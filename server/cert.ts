/**
 * Self-signed certificate for the local HTTPS port. Phones need HTTPS for the
 * Screen Wake Lock API; the cert is cached in .cert/ and regenerated when the
 * machine's LAN addresses change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from 'selfsigned';

export async function loadOrCreateCert(dir: string, ips: string[]): Promise<{ key: string; cert: string }> {
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  const metaPath = join(dir, 'meta.json');
  if (existsSync(keyPath) && existsSync(certPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { ips: string[]; notAfter: number };
      if (ips.every((ip) => meta.ips.includes(ip)) && meta.notAfter > Date.now() + 86_400_000) {
        return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
      }
    } catch {
      // fall through and regenerate
    }
  }
  const notAfter = new Date(Date.now() + 365 * 86_400_000);
  const pems = await generate([{ name: 'commonName', value: 'Right There (local prototype)' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...ips.map((ip) => ({ type: 7 as const, ip }))],
      },
    ],
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(keyPath, pems.private);
  writeFileSync(certPath, pems.cert);
  writeFileSync(metaPath, JSON.stringify({ ips, notAfter: notAfter.getTime() }));
  return { key: pems.private, cert: pems.cert };
}
