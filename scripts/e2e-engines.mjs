/**
 * Pairing and pointing across browser engines: Chrome (desktop) and WebKit
 * (Safari's engine, iPhone-sized) in every combination. Needs Playwright's
 * WebKit once:  npx playwright-core install webkit
 *
 *   npm run build && node scripts/e2e-engines.mjs [--url https://…]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices, webkit } from 'playwright-core';
import { mouseDrag, pair, setupSwipes } from './drive.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? process.argv[k + 1] : fallback;
};
const FILE = arg('url', pathToFileURL(join(root, 'dist', 'right-there.html')).href);
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
    await pair(host, guest, FILE);
    const t0 = Date.now();
    await guest.waitForSelector('.setup-intro', { timeout: 20000 });
    await host.waitForSelector('.giver-live', { timeout: 20000 });
    const ms = Date.now() - t0;
    await host.getByRole('radio', { name: /At their feet/ }).click();

    await setupSwipes(guest, mouseDrag);

    const pad = await guest.locator('.touchpad').boundingBox();
    await mouseDrag(guest, { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 }, { x: pad.x + pad.width * 0.7, y: pad.y + pad.height * 0.35 });
    await host.waitForSelector('.nudge-chip', { timeout: 5000 });
    await guest.getByRole('button', { name: /Right there/ }).click();
    await host.waitForSelector('.banner-good', { timeout: 5000 });

    await guest.getByRole('button', { name: 'More' }).click();
    await guest.getByRole('button', { name: /Swap roles/ }).click();
    await guest.waitForSelector('.giver-live', { timeout: 8000 });
    await host.waitForSelector('.setup-intro', { timeout: 8000 });
    if (errors.length) throw new Error(errors.join('; '));
    console.log(`✓ ${hostEngine} hosts ↔ ${guestEngine} joins: connected in ${ms} ms; swipes, nudge, right there, swap`);
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
