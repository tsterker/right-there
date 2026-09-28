/**
 * Production server: serves the built app (dist/) and the session relay on
 * HTTP and, for phone features that need a secure context (screen wake lock),
 * on HTTPS with a self-signed certificate.
 *
 *   PORT=3030 HTTPS_PORT=3443 HTTPS=0|1 tsx server/index.ts
 */
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import sirv from 'sirv';
import { loadOrCreateCert } from './cert.ts';
import { lanAddresses } from './lan.ts';
import { createRelay } from './relay.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const PORT = Number(process.env.PORT ?? 3030);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3443);
const WANT_HTTPS = process.env.HTTPS !== '0';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No build found in dist/. Run "npm start" (builds first) or "npm run build".');
  process.exit(1);
}

let httpsPort: number | null = null;
const relay = createRelay({
  info: () => ({ lan: lanAddresses(), httpPort: PORT, httpsPort }),
  log: process.env.QUIET ? undefined : (m) => console.log(`  · ${m}`),
});

const assets = sirv(dist, {
  single: true,
  etag: true,
  setHeaders(res, pathname) {
    if (pathname === '/' || pathname.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
});

const handler: http.RequestListener = (req, res) => {
  relay.handleHttp(req, res).then((handled) => {
    if (!handled) assets(req, res);
  });
};

const listen = (server: http.Server | https.Server, port: number) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve());
  });

const httpServer = http.createServer(handler);
relay.attach(httpServer);
await listen(httpServer, PORT);

if (WANT_HTTPS) {
  try {
    const creds = await loadOrCreateCert(join(root, '.cert'), lanAddresses());
    const httpsServer = https.createServer(creds, handler);
    relay.attach(httpsServer);
    await listen(httpsServer, HTTPS_PORT);
    httpsPort = HTTPS_PORT;
  } catch (err) {
    console.warn(`HTTPS disabled: ${(err as Error).message}`);
  }
}

const lan = lanAddresses();
const phoneUrl = lan[0] ? `http://${lan[0]}:${PORT}` : null;
const lines = [
  '',
  '  Right There — prototype server',
  '',
  `  This computer   http://localhost:${PORT}   (demo with both screens: http://localhost:${PORT}/#/demo)`,
];
if (lan.length) {
  lines.push('  Phones on the same Wi-Fi:');
  for (const ip of lan) {
    lines.push(`                  http://${ip}:${PORT}`);
    if (httpsPort) lines.push(`                  https://${ip}:${httpsPort}   ← keeps the screen awake; accept the certificate warning once`);
  }
} else {
  lines.push('  (No LAN address found — connect this computer to Wi-Fi to use phones.)');
}
console.log(lines.join('\n'));
if (phoneUrl) {
  const qr = await QRCode.toString(phoneUrl, { type: 'terminal', small: true });
  console.log(`\n  Scan with a phone camera to open ${phoneUrl}\n`);
  console.log(qr.replace(/^/gm, '  '));
}

const shutdown = () => {
  relay.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
