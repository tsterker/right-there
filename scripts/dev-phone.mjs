/**
 * The dev server plus a temporary public HTTPS link (Cloudflare quick tunnel,
 * no account), for trying changes on a phone. QR codes shown on this computer
 * then open the dev server on the phone over HTTPS — so the camera and keeping
 * the screen on work there too — with hot reload on both screens. The session
 * itself still runs directly between the two devices (same Wi-Fi).
 *
 *   npm run dev:phone      then open the printed http://localhost:… on this computer
 */
import { Resolver } from 'node:dns/promises';
import { Tunnel } from 'cloudflared';
import QRCode from 'qrcode';
import { createServer, resolveConfig } from 'vite';

const PORT = (await resolveConfig({}, 'serve')).server.port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n  Opening a temporary public link…');
const tunnel = Tunnel.quick(`http://127.0.0.1:${PORT}`);
const url = await new Promise((resolve, reject) => {
  tunnel.once('url', resolve);
  tunnel.once('error', reject);
  tunnel.once('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
}).catch((err) => {
  console.error(`  Could not open the link: ${err.message}. Plain \`npm run dev\` still works on the same Wi-Fi.`);
  process.exit(1);
});

// vite.config.ts puts this into the QR codes shown on this computer.
process.env.DEV_APP_URL = `${url}/`;
const server = await createServer();
await server.listen();

const stop = async (code = 0) => {
  tunnel.stop();
  await server.close();
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
tunnel.on('exit', () => {
  console.error('\n  The public link closed.');
  stop(1);
});

// The new hostname takes a few seconds to exist. Ask a public resolver first: asking the
// system resolver too early makes it cache "not found" for a while.
const dns = new Resolver();
dns.setServers(['1.1.1.1', '8.8.8.8']);
const host = new URL(url).hostname;
for (let until = Date.now() + 60_000; Date.now() < until; await sleep(1500)) {
  if ((await dns.resolve4(host).catch(() => [])).length) break;
}

const qr = await QRCode.toString(`${url}/`, { type: 'terminal', small: true });
console.log(`
  Right There dev server — for this computer and a phone:

      This computer:  http://localhost:${PORT}/
      Phone:          ${url}/

${qr.replace(/^/gm, '    ')}
  Start on this computer and scan its QR code with the phone (or open the phone link
  above and start there). Edits reload on both screens. Ctrl+C stops; the link
  changes every run.
`);
