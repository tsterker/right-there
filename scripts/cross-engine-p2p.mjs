/**
 * No-server pairing across browser engines: Chrome (desktop) and WebKit
 * (Safari's engine, iPhone-sized) in every combination. Needs Playwright's
 * WebKit once:  npx playwright-core install webkit
 *
 *   npm run build:single && node scripts/cross-engine-p2p.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices, webkit } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(join(root, 'dist-single', 'right-there.html')).href;
const code = async (p) => (await p.locator('.pair-qr[data-code]').first().getAttribute('data-code')) ?? '';
const engines = {
  chrome: () => chromium.launch({ channel: 'chrome', headless: true }),
  webkit: () => webkit.launch({ headless: true }),
};
let failed = 0;

async function run(hostEngine, guestEngine) {
  const hb = await engines[hostEngine]();
  const gb = await engines[guestEngine]();
  const errors = [];
  try {
    const host = await (await hb.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
    const guest = await (await gb.newContext(guestEngine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'])).newPage();
    for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`));
    await host.goto(FILE);
    await host.getByRole('button', { name: /giving the massage/i }).click();
    await host.waitForSelector('.pair-qr[data-code]');
    await guest.goto(`${FILE}#/p2p/join/${await code(host)}`);
    await guest.waitForSelector('.pair-qr[data-code]');
    await host.fill('.paste-row input', await code(guest));
    const t0 = Date.now();
    await host.getByRole('button', { name: 'Connect' }).click();
    await guest.waitForSelector('.checkin', { timeout: 20000 });
    await host.waitForSelector('.brief', { timeout: 20000 });
    const ms = Date.now() - t0;
    await guest.getByRole('radio', { name: /Knot/ }).click();
    const box = await guest.locator('.checkin-map svg.map').boundingBox();
    await guest.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.3);
    await host.waitForSelector('.brief-map .map-marker', { timeout: 5000 });
    await guest.getByRole('button', { name: /set up pointing/i }).click();
    await guest.getByRole('button', { name: /Skip — start massage/i }).click();
    await host.waitForSelector('.giver-live', { timeout: 5000 });
    await guest.getByRole('button', { name: /Firmer/ }).click();
    await host.waitForSelector('.banner-firmer', { timeout: 5000 });
    await host.getByRole('button', { name: /More/ }).click();
    await host.getByRole('button', { name: /End session/ }).click();
    await host.getByRole('button', { name: /Yes, end session/ }).click();
    await guest.waitForSelector('.summary', { timeout: 5000 });
    await guest.getByRole('button', { name: /Swap roles/ }).click();
    await guest.waitForSelector('.brief', { timeout: 8000 });
    await host.waitForSelector('.checkin', { timeout: 8000 });
    if (errors.length) throw new Error(errors.join('; '));
    console.log(`✓ ${hostEngine} hosts ↔ ${guestEngine} joins: connected in ${ms} ms; marks, feedback and swap flow`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${hostEngine} hosts ↔ ${guestEngine} joins: ${e.message.split('\n')[0]}`);
  } finally {
    await hb.close();
    await gb.close();
  }
}

await run('chrome', 'webkit');
await run('webkit', 'chrome');
await run('webkit', 'webkit');
process.exit(failed ? 1 : 0);
