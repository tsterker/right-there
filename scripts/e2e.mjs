/**
 * End-to-end walkthrough in Chrome, no server involved: a "MacBook" opens the
 * built file from disk (file://) and starts as the giver; a "phone" joins over
 * a direct WebRTC link. Covers pairing (paste, and both cameras), the two setup
 * swipes, nudging, double-tap "right there", firmer/softer, full screen, map
 * mode learning, swapping roles,
 * reconnecting and the demo. Finally the dev server's QR link for a phone.
 *
 *   npm run build && node scripts/e2e.mjs [--out /tmp/right-there-e2e]
 */
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from 'playwright-core';
import { createServer } from 'vite';
import { codeOf, mouseDrag, onMap, pair, setupSwipes, sleep, touchDrag, touchHold, touchTaps, touchTwoFingerTap } from './drive.mjs';

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

// Chrome's fake camera plays this file. It must exist before the first camera starts (Chrome
// remembers a missing one); it starts blank and later shows QR codes. Running cameras pick up new
// pictures, so each is written over the old bytes in place: truncating the file under a running
// camera kills it.
const CAM = join(OUT, 'fake-camera.y4m');
const BLANK = join(OUT, 'blank.png');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=white:s=480x480', '-frames:v', '1', BLANK]);
/** One camera frame (y4m) showing a picture; always the same size and header. */
const frame = (png) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', png, '-vf', 'scale=480:480,pad=640:480:80:0:white', '-frames:v', '1', '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', '-'], { maxBuffer: 1 << 24 });
writeFileSync(CAM, frame(BLANK));
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
  // A session asks before the tab is closed or left; the walkthrough means it.
  page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
  return page;
};
const laptop = async (name) => watch(name, await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage());
const phone = async (name) => watch(name, await (await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage());
/** Show the fake camera a QR code from the screen. */
async function fakeCamera(qr, name) {
  const png = join(OUT, `${name}.png`);
  await qr.screenshot({ path: png });
  const bytes = frame(png);
  if (bytes.length !== statSync(CAM).size) throw new Error('fake camera frame changed size');
  const fd = openSync(CAM, 'r+');
  writeSync(fd, bytes, 0, bytes.length, 0);
  closeSync(fd);
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

let dev = null;
try {
  console.log('1. MacBook opens right-there.html from disk and starts as the giver; the phone joins');
  const mac = await laptop('mac');
  await mac.goto(FILE);
  await shot(mac, 'mac-landing');
  await mac.getByRole('button', { name: 'Start as the giver' }).click();
  await mac.waitForSelector('.pair-qr[data-code]');
  const qrLink = (await mac.locator('.pair-qr[data-link]').getAttribute('data-link')) ?? '';
  check(/^https:\/\/.+#\/p2p\/join\/[\w-]+$/.test(qrLink), `the QR code opens the app on the phone (${qrLink.split('#')[0]})`);
  await shot(mac, 'mac-pairing');
  const iphone = await phone('phone');
  const { offer, reply } = await pair(mac, iphone, GUEST);
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
  check(await iphone.evaluate(() => document.fullscreenElement != null), 'the session runs full screen from its first tap');
  await iphone.evaluate(() => history.back());
  await sleep(400);
  check((await iphone.locator('.receiver-pad').count()) === 1, 'a stray back swipe stays in the session');
  check((await mac.locator('.region-name').textContent()) === 'No spot yet', 'Mac waits for the first pointing');
  await touchDrag(iphone, { x: 190, y: 420 }, { x: 250, y: 330 }, 900);
  await mac.waitForSelector('.map-ping', { timeout: 5000 });
  const region = await mac.locator('.region-name').textContent();
  check(region !== 'No spot yet', `Mac follows the nudge and points its way: "${region}"`);
  await shot(mac, 'mac-live-nudge');
  await shot(iphone, 'phone-pad-nudge');

  console.log('3. Phone: double-tap = right there');
  const pad = await iphone.locator('.touchpad').boundingBox();
  await touchTaps(iphone, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 }, 2);
  await mac.waitForSelector('.banner-good', { timeout: 5000 });
  check((await mac.locator('.region-name').textContent()) === region, 'Mac shows "♥ Right there"; the double-tap did not move the spot');
  await shot(mac, 'mac-right-there');
  const pressure = () => mac.locator('.pressure-meter').getAttribute('aria-label');
  await sleep(500);
  check((await pressure()) === 'Pressure 3 of 5', 'the double-tap was not also a "softer" tap');
  await touchHold(iphone, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 });
  await mac.waitForSelector('.banner-firmer', { timeout: 5000 });
  check((await pressure()) === 'Pressure 4 of 5', 'hold still, then lift = firmer: the Mac shows it and the meter rises');
  await shot(mac, 'mac-firmer');
  await shot(iphone, 'phone-firmer');
  await touchTaps(iphone, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 }, 1);
  await mac.waitForSelector('.banner-softer', { timeout: 5000 });
  check((await pressure()) === 'Pressure 3 of 5', 'a single tap = softer');
  check((await mac.locator('.region-name').textContent()) === region, 'neither moved the spot');
  await touchTwoFingerTap(iphone, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 });
  await mac.waitForSelector('.map-mode-chip', { timeout: 5000 });
  check((await iphone.locator('.toast').innerText()).includes('Both sides'), 'two-finger tap: both sides on the phone and the Mac');
  await shot(mac, 'mac-both-sides');
  // The spot is right of the spine. A stroke starting on the left half, moving left, spreads the hands.
  // How far apart the hands are drawn: each hand's hot core is moved to ±w.
  const spread = () =>
    mac.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.map-spot-core')].map((c) => Math.abs(c.transform.baseVal.consolidate()?.matrix.e ?? 0))));
  const w0 = await spread();
  const [a, b] = [await onMap(iphone, '.touchpad', -9, 22), await onMap(iphone, '.touchpad', -15, 22)];
  await touchDrag(iphone, a, b, 500);
  await sleep(500);
  const w1 = await spread();
  check(w1 > w0 + 1, `a stroke started on the left half steers the left hand: apart (${w0.toFixed(1)} → ${w1.toFixed(1)} cm)`);
  await touchTwoFingerTap(iphone, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 });
  await mac.waitForSelector('.map-mode-chip', { state: 'detached', timeout: 5000 });
  check(true, 'another two-finger tap: back to one side');

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
  await pair(mac, iphone, GUEST, '.sheet');
  await iphone.waitForSelector('.giver-live', { timeout: 20000 });
  await sleep(300);
  const after = await iphone.locator('.region-name').textContent();
  check(after !== 'No spot yet' && (await iphone.locator('.first-view').count()) === 0, `phone is back and sees the spot set meanwhile ("${after}")`);
  await shot(iphone, 'phone-giver-rotated');

  console.log('7. Both cameras: the phone scans the Mac’s code in the app, the Mac’s webcam reads the reply');
  const mac2 = await laptop('mac2');
  await mac2.goto(FILE);
  await mac2.getByRole('button', { name: 'Start as the giver' }).click();
  await mac2.waitForSelector('.pair-qr .qr svg');
  await mac2.waitForSelector('.qr-scanner video');
  // Both cameras now see the Mac's own code; the Mac's has to ignore it.
  await fakeCamera(mac2.locator('.pair-qr .qr'), 'mac-qr');
  const phone2 = await phone('phone2');
  await phone2.goto(`${GUEST}#/p2p/scan`);
  await phone2.getByRole('button', { name: /Scan the code/ }).click();
  await phone2.waitForSelector('.pair-qr[data-code]', { timeout: 20000 });
  check(true, 'the phone’s camera read the Mac’s code and shows its reply');
  await fakeCamera(phone2.locator('.pair-qr .qr'), 'phone-qr');
  await mac2.waitForSelector('.giver-live', { timeout: 20000 });
  await phone2.waitForSelector('.setup-intro', { timeout: 20000 });
  check(true, 'the Mac’s webcam read the reply: connected without typing anything');

  console.log('7b. No camera: the reply goes back as a link, tapped on the host device');
  const mac3 = await laptop('mac3');
  await mac3.goto(FILE);
  await mac3.getByRole('button', { name: 'Start as the giver' }).click();
  await mac3.waitForSelector('.pair-qr[data-code]');
  const phone3 = await phone('phone3');
  await phone3.goto(`${GUEST}#/p2p/join/${await codeOf(mac3)}`);
  await phone3.waitForSelector('.pair-qr[data-code]');
  const replyCode = await codeOf(phone3);
  const elsewhere = await laptop('other-browser');
  await elsewhere.goto(`${FILE}#/p2p/reply/${replyCode}`);
  await elsewhere.waitForSelector('.reply-handoff[data-status="nowhere"]', { timeout: 5000 });
  check(true, 'opened in a browser without the pairing screen, the link says so');
  const tab = watch('mac3-link', await mac3.context().newPage());
  await tab.goto(`${FILE}#/p2p/reply/${replyCode}`);
  await mac3.waitForSelector('.giver-live', { timeout: 20000 });
  await phone3.waitForSelector('.setup-intro', { timeout: 20000 });
  await tab.waitForSelector('.reply-handoff[data-status="connected"]', { timeout: 5000 });
  check(true, 'the link, opened in a new tab of the host’s browser, connects the pairing tab; the link tab says so');
  // A paused tab (phones pause background tabs) misses the storage event: it reads the reply when shown again.
  const mac4 = await laptop('mac4');
  await mac4.goto(FILE);
  await mac4.getByRole('button', { name: 'Start as the giver' }).click();
  await mac4.waitForSelector('.pair-qr[data-code]');
  const phone4 = await phone('phone4');
  await phone4.goto(`${GUEST}#/p2p/join/${await codeOf(mac4)}`);
  await phone4.waitForSelector('.pair-qr[data-code]');
  const late = await codeOf(phone4);
  await mac4.evaluate((code) => {
    const { session } = JSON.parse(localStorage.getItem('mb.pairWaiting'));
    localStorage.setItem('mb.pairReply', JSON.stringify({ session, code, at: Date.now() }));
    document.dispatchEvent(new Event('visibilitychange'));
  }, late);
  await mac4.waitForSelector('.giver-live', { timeout: 20000 });
  check(true, 'a pairing tab that was in the background picks up the reply when it is shown again');
  const leftover = await mac3.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mb.pair')));
  check(!leftover.includes('mb.pairWaiting') && !leftover.includes('mb.pairReply'), `nothing left waiting (${leftover.join(', ') || 'none'})`);

  console.log('8. The demo: both screens side by side, already connected');
  const desk = await laptop('demo');
  await desk.goto(FILE);
  await desk.getByRole('button', { name: /Try the demo/ }).click();
  const rx = desk.frameLocator('iframe[title=Receiver]');
  const gx = desk.frameLocator('iframe[title=Giver]');
  await rx.locator('.receiver-pad').waitFor({ timeout: 20000 });
  await gx.locator('.giver-live').waitFor({ timeout: 20000 });
  check((await gx.locator('.first-view').count()) === 0, 'the demo opens straight on the touch pad and the map');
  const frame = await desk.locator('iframe[title=Receiver]').boundingBox();
  const mid = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const end = { x: mid.x + 60, y: mid.y - 90 };
  await mouseDrag(desk, mid, end);
  await gx.locator('.map-ping').waitFor({ timeout: 5000 });
  await desk.mouse.dblclick(end.x, end.y);
  await gx.locator('.banner-good').waitFor({ timeout: 5000 });
  check(true, 'dragging on the receiver moves the giver’s dot; double-click = right there');
  await shot(desk, 'demo');
  await desk.keyboard.press('t');
  await desk.locator('.tuner').waitFor({ timeout: 3000 });
  await desk.keyboard.press('3');
  const stiffness = await desk.locator('.tuner-row output').first().innerText();
  await desk.keyboard.press('Escape');
  check((await desk.locator('.tuner').count()) === 0 && stiffness === '16', `T opens the blob tuner, 3 picks “Gooey” (catch-up ${stiffness}), Esc closes it`);
  const saved = await desk.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mb.')));
  check(saved.length === 0, `the demo leaves this device’s saved settings alone (${saved.join(', ') || 'nothing saved'})`);
  await rx.getByRole('button', { name: 'More' }).click();
  await rx.getByRole('button', { name: 'Leave' }).click();
  await desk.getByRole('button', { name: 'Start as the giver' }).waitFor({ timeout: 5000 });
  check(true, '“Leave” inside the demo returns to the start page');

  console.log('9. Dev server: the QR link it puts on this computer’s screen');
  dev = await startDevServer();
  if (!dev) {
    console.log('  – skipped: the dev server port is taken (is `npm run dev` running?)');
  } else {
    const base = `http://localhost:${dev.config.server.port}/`;
    const devHost = await laptop('dev-host');
    await devHost.goto(base);
    await devHost.getByRole('button', { name: 'Start as the giver' }).click();
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
