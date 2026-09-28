/**
 * No-server walkthrough: a "MacBook" opens the single-file build from disk
 * (file://) and hosts; a "phone" joins over a direct WebRTC link. No server
 * runs at all. Also checks pairing through the in-app camera scanner (fake
 * camera showing the host's QR code).
 *
 *   npm run build:single && node scripts/walkthrough-p2p.mjs [--out /tmp/mb-p2p]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? process.argv[k + 1] : fallback;
};
const LOCAL = pathToFileURL(join(root, 'dist-single', 'right-there.html')).href;
/** Where the laptop opens the app (default: the file on disk) and where the phone does (e.g. the live site). */
const FILE = arg('host-url', LOCAL);
const GUEST = arg('guest-url', FILE);
const OUT = arg('out', '/tmp/mb-p2p');
mkdirSync(OUT, { recursive: true });
if (FILE === LOCAL && !existsSync(fileURLToPath(LOCAL))) throw new Error('Run "npm run build:single" first.');

const CAM = join(OUT, 'fake-camera.y4m');
if (existsSync(CAM)) unlinkSync(CAM);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${CAM}`],
});

const problems = [];
const check = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) problems.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shots = 0;
const shot = async (page, name) => {
  shots += 1;
  const file = `${OUT}/${String(shots).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(`  📸 ${file}`);
};
const watch = (name, page) => {
  page.on('pageerror', (e) => problems.push(`[${name}] page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${name}] console.error: ${m.text()}`));
  return page;
};
const codeOf = async (page) => (await page.locator('.pair-qr[data-code]').first().getAttribute('data-code')) ?? '';

async function drag(page, from, to, ms = 600, steps = 16) {
  const s = await page.context().newCDPSession(page);
  const at = (k) => [{ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= steps; k++) {
    await sleep(ms / steps);
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

try {
  console.log('1. MacBook: double-click right-there.html (file://), start as giver');
  const mac = watch('mac', await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage());
  await mac.goto(FILE);
  await mac.waitForSelector('text=Scan their code');
  check(true, 'opened from disk: landing offers no-server pairing');
  await shot(mac, 'mac-landing');
  await mac.getByRole('button', { name: /giving the massage/i }).click();
  await mac.waitForSelector('.pair-qr[data-code]');
  const offer = await codeOf(mac);
  check(offer.length > 80 && offer.length < 320, `first code is compact (${offer.length} chars)`);
  const qrLink = (await mac.locator('.pair-qr[data-link]').first().getAttribute('data-link')) ?? '';
  console.log(`     the QR code contains: ${qrLink.startsWith('http') ? qrLink.replace(offer, '<code>') : '(bare code, no app address)'}`);
  await shot(mac, 'mac-pairing');

  console.log('2. Phone: opens the link from the QR code (here: the same file), answers');
  const phone = watch('phone', await (await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage());
  await phone.goto(`${GUEST}#/p2p/join/${offer}`);
  await phone.waitForSelector('.pair-qr[data-code]');
  const reply = await codeOf(phone);
  check(reply.length > 80, `reply code is compact (${reply.length} chars)`);
  await shot(phone, 'phone-reply');

  console.log('3. MacBook: paste the reply (webcam path is tested below)');
  await mac.fill('.paste-row input', reply);
  await mac.getByRole('button', { name: 'Connect' }).click();
  await phone.waitForSelector('.checkin', { timeout: 20000 });
  await mac.waitForSelector('.brief', { timeout: 20000 });
  check(true, 'direct link up — phone is the receiver (check-in), Mac the giver (brief)');

  console.log('4. A short session over the direct link');
  const tap = async (page, sel, x, y) => {
    const p = await page.evaluate(
      ([sel, x, y]) => {
        const g = document.querySelector(`${sel} svg.map g[transform^="matrix"]`);
        const pt = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
        return { x: pt.x, y: pt.y };
      },
      [sel, x, y],
    );
    const s = await page.context().newCDPSession(page);
    await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await phone.getByRole('radio', { name: /Knot/ }).click();
  await tap(phone, '.checkin-map', 12, 1.5);
  await mac.waitForSelector('.brief-map .map-marker');
  check(true, 'knot marked on the phone appears on the Mac');
  await phone.getByRole('button', { name: /set up pointing/i }).click();
  await phone.getByRole('button', { name: /Skip — start massage/i }).click();
  await mac.waitForSelector('.giver-live');
  await drag(phone, { x: 190, y: 420 }, { x: 250, y: 330 }, 900);
  await sleep(500);
  const region = await mac.locator('.region-name').innerText();
  check(region.length > 0, `Mac sees where the phone points: "${region}"`);
  await phone.getByRole('button', { name: /Firmer/ }).click();
  await mac.waitForSelector('.banner-firmer');
  check(true, 'Firmer from the phone → banner on the Mac');
  await shot(mac, 'mac-live');
  await shot(phone, 'phone-pad');

  console.log('5. End and swap roles: the Mac becomes the receiver, the phone the giver');
  await mac.getByRole('button', { name: /More/ }).click();
  await mac.getByRole('button', { name: /End session/ }).click();
  await mac.getByRole('button', { name: /Yes, end session/ }).click();
  await phone.waitForSelector('.summary');
  await mac.getByRole('button', { name: /Swap roles/ }).click();
  await mac.waitForSelector('.checkin', { timeout: 10000 });
  await phone.waitForSelector('.brief', { timeout: 10000 });
  check(true, 'roles swapped over the same link');

  console.log('6. Phone reloads (link drops) → Mac re-pairs via "Reconnect", state survives');
  await phone.goto('about:blank');
  await mac.waitForSelector('text=Reconnect', { timeout: 20000 });
  check(true, 'Mac notices the phone is gone and offers Reconnect');
  await mac.getByRole('radio', { name: /Sore/ }).click();
  await tap(mac, '.checkin-map', -5, 40);
  await mac.getByRole('button', { name: 'Reconnect' }).click();
  await mac.waitForSelector('.sheet .pair-qr[data-code]');
  const offer2 = await codeOf(mac);
  await phone.goto(`${GUEST}#/p2p/join/${offer2}`);
  await phone.waitForSelector('.pair-qr[data-code]');
  await mac.fill('.sheet .paste-row input', await codeOf(phone));
  await mac.locator('.sheet').getByRole('button', { name: 'Connect' }).click();
  await phone.waitForSelector('.brief-map .map-marker', { timeout: 20000 });
  check(true, 'phone rejoined and got the mark made while it was away');

  console.log('7. Pairing through the camera: the phone scans the Mac’s QR code');
  const mac2 = watch('mac2', await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage());
  await mac2.goto(FILE);
  await mac2.getByRole('button', { name: /getting the massage/i }).click();
  await mac2.waitForSelector('.pair-qr .qr svg');
  const qr = join(OUT, 'mac-qr.png');
  await mac2.locator('.pair-qr .qr').screenshot({ path: qr });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', qr, '-t', '2', '-vf', 'scale=480:480,pad=640:480:80:0:white', '-pix_fmt', 'yuv420p', CAM]);
  const phone2 = watch('phone2', await (await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage());
  await phone2.goto(`${GUEST}#/p2p/scan`);
  await phone2.getByRole('button', { name: /Scan their code/ }).click();
  await phone2.waitForSelector('.pair-qr[data-code]', { timeout: 20000 });
  check(true, 'in-app camera read the QR code and produced a reply');
  await shot(phone2, 'phone-scanned');
  await mac2.fill('.paste-row input', await codeOf(phone2));
  await mac2.getByRole('button', { name: 'Connect' }).click();
  await mac2.waitForSelector('.checkin', { timeout: 20000 });
  await phone2.waitForSelector('.brief', { timeout: 20000 });
  check(true, 'connected — Mac is the receiver, phone the giver');
} catch (err) {
  problems.push(`CRASH: ${err.message}`);
  console.error(err);
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nNo-server walkthrough passed.');
