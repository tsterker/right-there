/**
 * End-to-end walkthrough in Chrome, no server involved: a "MacBook" opens the
 * built file from disk (file://) and hosts; a "phone" joins over a direct
 * WebRTC link. Covers pairing (paste and in-app camera), the two setup swipes,
 * nudging, double-tap "right there", map mode learning, swapping roles and
 * reconnecting. Finally the dev server: the side-by-side demo page and the
 * QR link it puts on this computer's screen.
 *
 *   npm run build && node scripts/e2e.mjs [--out /tmp/right-there-e2e]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from 'playwright-core';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? process.argv[k + 1] : fallback;
};
const LOCAL = pathToFileURL(join(root, 'dist', 'right-there.html')).href;
/** Where the laptop opens the app (default: the file on disk) and where the phone does (e.g. the live site). */
const FILE = arg('host-url', LOCAL);
const GUEST = arg('guest-url', FILE);
const OUT = arg('out', '/tmp/right-there-e2e');
mkdirSync(OUT, { recursive: true });
if (FILE === LOCAL && !existsSync(fileURLToPath(LOCAL))) throw new Error('Run "npm run build" first.');

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
const laptop = async (name) => watch(name, await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage());
const phone = async (name) => watch(name, await (await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage());
const codeOf = async (page, scope = '') => (await page.locator(`${scope} .pair-qr[data-code]`.trim()).first().getAttribute('data-code')) ?? '';

// Input: real touch events (CDP) for the phone, the mouse for the laptop.
async function touchDrag(page, from, to, ms = 600, steps = 16) {
  const s = await page.context().newCDPSession(page);
  const at = (k) => [{ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= steps; k++) {
    await sleep(ms / steps);
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchTaps(page, p, count = 1) {
  const s = await page.context().newCDPSession(page);
  for (let i = 0; i < count; i++) {
    await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(90);
  }
}
async function mouseDrag(page, from, to, steps = 16) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
/** Screen position of a body point (cm) on the map inside `scope`. */
const onMap = (page, scope, x, y) =>
  page.evaluate(
    ([scope, x, y]) => {
      const g = document.querySelector(`${scope} svg.map g[transform^="matrix"]`);
      const pt = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
      return { x: pt.x, y: pt.y };
    },
    [scope, x, y],
  );

/** The receiver's two setup swipes: neck → lower back, then left → right (phone upright). */
async function setupSwipes(page, drag) {
  await page.getByRole('button', { name: 'Start the two swipes' }).click();
  const box = await page.locator('.swipe-area').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await drag(page, { x: cx, y: box.y + box.height * 0.3 }, { x: cx, y: box.y + box.height * 0.75 });
  await page.getByText('Swipe 2 of 2').waitFor();
  await drag(page, { x: box.x + box.width * 0.15, y: cy }, { x: box.x + box.width * 0.85, y: cy });
  await page.waitForSelector('.receiver-pad');
}

/** The dev server on its usual port, or null if something (e.g. `npm run dev`) already has it. */
async function startDevServer() {
  const server = await createServer({ root, logLevel: 'silent' });
  try {
    await server.listen();
    return server;
  } catch (err) {
    await server.close().catch(() => {});
    if (/already in use/.test(err.message)) return null;
    throw err;
  }
}

/** Host starts, guest opens the link from the QR code, host pastes the reply. */
async function pair(host, guest, hostButton, scope = '') {
  if (hostButton) await host.getByRole('button', { name: hostButton }).click();
  await host.waitForSelector(`${scope} .pair-qr[data-code]`.trim());
  const offer = await codeOf(host, scope);
  await guest.goto(`${GUEST}#/p2p/join/${offer}`);
  await guest.waitForSelector('.pair-qr[data-code]');
  const reply = await codeOf(guest);
  await host.fill(`${scope} .paste-row input`.trim(), reply);
  await host.locator(scope || 'body').getByRole('button', { name: 'Connect' }).click();
  return { offer, reply };
}

let dev = null;
try {
  console.log('1. MacBook opens right-there.html from disk and starts as the giver; the phone joins');
  const mac = await laptop('mac');
  await mac.goto(FILE);
  await mac.getByText('Scan their code').waitFor();
  await shot(mac, 'mac-landing');
  await mac.getByRole('button', { name: /giving the massage/i }).click();
  await mac.waitForSelector('.pair-qr[data-code]');
  const qrLink = (await mac.locator('.pair-qr[data-link]').getAttribute('data-link')) ?? '';
  check(/^https:\/\/.+#\/p2p\/join\/[\w-]+$/.test(qrLink), `the QR code opens the app on the phone (${qrLink.split('#')[0]})`);
  await shot(mac, 'mac-pairing');
  const iphone = await phone('phone');
  const { offer, reply } = await pair(mac, iphone, null);
  check(offer.length < 320 && reply.length < 320, `codes are compact (${offer.length} / ${reply.length} chars)`);
  await iphone.waitForSelector('.setup-intro', { timeout: 20000 });
  await mac.waitForSelector('.giver-live .first-view', { timeout: 20000 });
  check(true, 'connected: phone shows the swipe setup, Mac the map (asking where the giver stands)');
  await shot(iphone, 'phone-setup');
  await mac.locator('.first-view').getByRole('radio', { name: /At their feet/ }).click();
  check((await mac.locator('.first-view').count()) === 0, 'viewpoint picked once, then straight to the map');

  console.log('2. Phone: two swipes, then nudge');
  await setupSwipes(iphone, (p, a, b) => touchDrag(p, a, b, 500));
  check((await iphone.locator('.toast').innerText()).includes('toward your head'), 'swipes understood: phone top toward the head');
  check((await mac.locator('.region-name').innerText()) === 'No spot yet', 'Mac waits for the first pointing');
  await touchDrag(iphone, { x: 190, y: 420 }, { x: 250, y: 330 }, 900);
  await mac.waitForSelector('.nudge-chip', { timeout: 5000 });
  const region = await mac.locator('.region-name').innerText();
  check(region !== 'No spot yet', `Mac follows the nudge: "${region}", "${(await mac.locator('.nudge-chip').innerText()).trim()}"`);
  await shot(mac, 'mac-live-nudge');
  await shot(iphone, 'phone-pad-nudge');

  console.log('3. Phone: double-tap = right there');
  const pad = await iphone.locator('.touchpad').boundingBox();
  await touchTaps(iphone, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 }, 2);
  await mac.waitForSelector('.banner-good', { timeout: 5000 });
  check((await mac.locator('.region-name').innerText()) === region, 'Mac shows "♥ Right there"; the double-tap did not move the spot');
  await shot(mac, 'mac-right-there');

  console.log('4. Map mode: touch a spot, ♥, giver confirms where the hands are → the map learns');
  await iphone.getByRole('radio', { name: /Map/ }).click();
  const spot = await onMap(iphone, '.touchpad', 8, 30);
  await touchTaps(iphone, spot, 2);
  await mac.getByRole('button', { name: /teach map/ }).waitFor({ timeout: 5000 });
  check(true, 'after ♥ on a map touch the Mac offers "I’m here — teach map"');
  await mac.getByRole('button', { name: /teach map/ }).click();
  const hands = await onMap(mac, '.live-map', 10, 33);
  await mac.mouse.click(hands.x, hands.y);
  await iphone.getByText('Map calibration improved').waitFor({ timeout: 5000 });
  const points = await iphone.evaluate(() => JSON.parse(localStorage.getItem('mb.profile') ?? '{}').points?.length ?? 0);
  check(points === 1, `phone stored the calibration pair (${points})`);
  await shot(iphone, 'phone-pad-map');

  console.log('5. Swap roles from the Mac’s menu');
  await mac.getByRole('button', { name: 'More' }).click();
  await mac.getByRole('button', { name: /Swap roles/ }).click();
  await mac.waitForSelector('.setup-intro', { timeout: 10000 });
  await iphone.waitForSelector('.giver-live .first-view', { timeout: 10000 });
  check(true, 'Mac is now the receiver, the phone the giver');
  await iphone.getByRole('radio', { name: /At their left side/ }).click();
  await setupSwipes(mac, mouseDrag);
  check(true, 'Mac did its two swipes with the mouse');

  console.log('6. The phone drops out; the receiver keeps pointing; re-pair via "Reconnect"');
  await iphone.goto('about:blank');
  await mac.getByRole('button', { name: 'Reconnect' }).waitFor({ timeout: 20000 });
  check(true, 'Mac notices the phone is gone and offers Reconnect');
  const macPad = await mac.locator('.touchpad').boundingBox();
  await mouseDrag(mac, { x: macPad.x + macPad.width / 2, y: macPad.y + macPad.height / 2 }, { x: macPad.x + macPad.width / 2 + 120, y: macPad.y + macPad.height / 2 + 160 });
  await mac.getByRole('button', { name: 'Reconnect' }).click();
  await pair(mac, iphone, null, '.sheet');
  await iphone.waitForSelector('.giver-live', { timeout: 20000 });
  await sleep(300);
  const after = await iphone.locator('.region-name').innerText();
  check(after !== 'No spot yet' && (await iphone.locator('.first-view').count()) === 0, `phone is back and sees the spot set meanwhile ("${after}")`);
  await shot(iphone, 'phone-giver-rotated');

  console.log('7. Pairing through the camera: the phone scans the Mac’s QR code in the app');
  const mac2 = await laptop('mac2');
  await mac2.goto(FILE);
  await mac2.getByRole('button', { name: /getting the massage/i }).click();
  await mac2.waitForSelector('.pair-qr .qr svg');
  const qr = join(OUT, 'mac-qr.png');
  await mac2.locator('.pair-qr .qr').screenshot({ path: qr });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', qr, '-t', '2', '-vf', 'scale=480:480,pad=640:480:80:0:white', '-pix_fmt', 'yuv420p', CAM]);
  const phone2 = await phone('phone2');
  await phone2.goto(`${GUEST}#/p2p/scan`);
  await phone2.getByRole('button', { name: /Scan their code/ }).click();
  await phone2.waitForSelector('.pair-qr[data-code]', { timeout: 20000 });
  check(true, 'in-app camera read the QR code and produced a reply');
  await mac2.fill('.paste-row input', await codeOf(phone2));
  await mac2.getByRole('button', { name: 'Connect' }).click();
  await mac2.waitForSelector('.setup-intro', { timeout: 20000 });
  await phone2.waitForSelector('.giver-live', { timeout: 20000 });
  check(true, 'connected: Mac is the receiver, phone the giver');

  console.log('8. Dev server: both screens side by side, and the QR link for a phone');
  dev = await startDevServer();
  if (!dev) {
    console.log('  – skipped: the dev server port is taken (is `npm run dev` running?)');
  } else {
    const base = `http://localhost:${dev.config.server.port}/`;
    const desk = await laptop('dev');
    await desk.goto(`${base}#/demo`);
    const rx = desk.frameLocator('iframe[title=Receiver]');
    const gx = desk.frameLocator('iframe[title=Giver]');
    await rx.locator('.setup-intro').waitFor({ timeout: 20000 });
    await gx.locator('.giver-live').waitFor({ timeout: 20000 });
    check(true, 'demo page pairs its two frames by itself');
    await shot(desk, 'dev-demo');
    const devHost = await laptop('dev-host');
    await devHost.goto(base);
    await devHost.getByRole('button', { name: /giving the massage/i }).click();
    const devLink = (await devHost.locator('.pair-qr[data-link]').getAttribute('data-link')) ?? '';
    check(/^https?:\/\/(?!localhost)[^/]+\/#\/p2p\/join\//.test(devLink), `QR codes from localhost point phones at this computer (${devLink.split('#')[0]})`);
  }
} catch (err) {
  problems.push(`CRASH: ${err.message}`);
  console.error(err);
} finally {
  await browser.close();
  await dev?.close();
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nWalkthrough passed.');
