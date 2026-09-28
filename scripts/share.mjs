/**
 * Put the prototype online for a quick try with a partner.
 *
 * Starts the production server (HTTP) and a free Cloudflare quick tunnel
 * (no account needed), waits until the public https:// URL answers, then
 * prints it with a QR code. The link works for anyone who has it, from any
 * network, until you stop this script (Ctrl+C). Keeps the Mac from idle-sleeping
 * meanwhile.
 *
 *   npm run share            (builds first)
 */
import { execFileSync, spawn } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Tunnel } from 'cloudflared';
import QRCode from 'qrcode';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3030);
const local = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(700);
  }
  return false;
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), HTTPS: '0', QUIET: '1' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
let tunnel = null;
const stop = (code = 0) => {
  tunnel?.stop();
  server.kill();
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
server.on('exit', (code) => {
  console.error(`\nServer stopped (exit ${code}).`);
  stop(1);
});

if (!(await waitFor(`${local}/api/info`, 15000))) {
  console.error(`The server did not start on ${local} — is the port already in use?`);
  stop(1);
}

// Keep the Mac awake while sharing (the phones talk through it).
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }).unref();

console.log('\n  Opening a public tunnel…');
tunnel = Tunnel.quick(local);
const url = await new Promise((resolve, reject) => {
  tunnel.once('url', resolve);
  tunnel.once('error', reject);
  tunnel.once('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
}).catch((err) => {
  console.error(`  Could not open a tunnel: ${err.message}`);
  stop(1);
});
tunnel.on('exit', () => {
  console.error('\nTunnel closed.');
  stop(1);
});

// The new hostname takes a few seconds to exist. Ask a public resolver first: asking the system
// resolver too early makes it cache "not found" for a while (and the link would seem dead here).
const publicDns = new Resolver();
publicDns.setServers(['1.1.1.1', '8.8.8.8']);
const host = new URL(url).hostname;
for (let until = Date.now() + 60000; Date.now() < until; await sleep(1500)) {
  if ((await publicDns.resolve4(host).catch(() => [])).length) break;
}
if (!(await waitFor(`${url}/api/info`, 30000))) {
  console.warn('  (Not answering from this computer yet. Phones usually work already; on a VPN, DNS can lag.)');
}

// The no-server single file, pointing phones at this link to load the app.
let single = null;
try {
  execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'single', '--logLevel', 'error'], {
    cwd: root,
    env: { ...process.env, VITE_APP_URL: `${url}/` },
    stdio: 'ignore',
  });
  copyFileSync(join(root, 'dist-single', 'index.html'), join(root, 'dist-single', 'right-there.html'));
  single = join(root, 'dist-single', 'right-there.html');
} catch {
  // optional extra; the shared link works without it
}

const outDir = join(root, '.share');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'url.txt'), `${url}\n`);
await QRCode.toFile(join(outDir, 'qr.png'), url, { width: 480, margin: 2 });
const qr = await QRCode.toString(url, { type: 'terminal', small: true });

console.log(`
  Right There is online — anyone with this link can use it until you press Ctrl+C:

      ${url}

${qr.replace(/^/gm, '    ')}
  1. Both phones open the link (scan the QR code with the camera).
  2. One taps "I'm getting the massage" (or "giving"), the other enters the 4-digit code it shows.
  3. Done? "⇄ Swap roles" on the summary screen and go again.
${single ? `
  No-server mode with this Mac as one side: double-click
      ${single}
  choose a role, and scan its QR code with the phone. The phone only loads the page from
  the link above; the session itself runs directly between the two devices.
` : ''}
  Keep this Mac awake and online while you use it. The link changes every time you run this.
`);
