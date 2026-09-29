/**
 * Refreshes the README screenshots in docs/: pairing (the receiver's phone
 * showing its reply code), the receiver's touch pad and the giver's map, on two
 * emulated phones connected over WebRTC.
 *
 *   npm run screenshots
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from 'playwright-core';
import { pair, setupSwipes, sleep, touchDrag } from './drive.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(join(root, 'dist', 'right-there.html')).href;
const OUT = join(root, 'docs');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const phone = async () => (await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })).newPage();
const save = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  📸 docs/${name}.png`);
};

try {
  const giver = await phone();
  await giver.goto(FILE);
  await giver.getByRole('button', { name: 'Start as the giver' }).click();
  const receiver = await phone();
  await pair(giver, receiver, FILE, '', () => save(receiver, 'pair'));
  await giver.getByRole('radio', { name: /At their feet/ }).click();
  await setupSwipes(receiver, (p, a, b) => touchDrag(p, a, b, 500));
  await touchDrag(receiver, { x: 190, y: 430 }, { x: 250, y: 330 }, 900);
  await giver.waitForSelector('.map-ping');
  await sleep(150);
  await save(giver, 'giver');
  await sleep(1600); // the receiver's "Got it" toast fades
  await save(receiver, 'receiver');
} finally {
  await browser.close();
}
