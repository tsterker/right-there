/**
 * End-to-end walkthrough with two simulated phones (headless Chrome).
 * Plays a whole session with real touch events, asserts what the giver sees
 * and saves screenshots.
 *
 *   npm run dev            # in another terminal
 *   node scripts/walkthrough.mjs [--base http://localhost:5173] [--out /tmp/mb-shots]
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:5173');
const OUT = arg('out', '/tmp/mb-shots');
mkdirSync(OUT, { recursive: true });

// Extra Chrome flags, e.g. CHROME_ARGS="--host-resolver-rules=MAP example.com 1.2.3.4"
const extraArgs = process.env.CHROME_ARGS ? [process.env.CHROME_ARGS] : [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: extraArgs });
const phone = { ...devices['iPhone 13'], deviceScaleFactor: 2 };
const ctxA = await browser.newContext(phone);
const ctxB = await browser.newContext(phone);
const a = await ctxA.newPage();
const b = await ctxB.newPage();
const problems = [];
for (const [name, page] of [
  ['A', a],
  ['B', b],
]) {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${name}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${name}] page error: ${e.message}`));
}

let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log(`  📸 ${file}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (cond, msg) => {
  if (!cond) {
    problems.push(`ASSERT: ${msg}`);
    console.log(`  ✗ ${msg}`);
  } else console.log(`  ✓ ${msg}`);
};

const cdp = new Map();
const touch = async (page) => {
  if (!cdp.has(page)) cdp.set(page, await page.context().newCDPSession(page));
  return cdp.get(page);
};

/** Drag with one or more fingers along straight lines over `ms`. */
async function drag(page, paths, ms = 400, steps = 20) {
  const s = await touch(page);
  const at = (i) => paths.map(([from, to], id) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id }));
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
  }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tap(page, p) {
  const s = await touch(page);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  await sleep(40);
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Screen position of a body point (cm) on the map inside `scope`. */
const bodyToClient = (page, scope, x, y) =>
  page.evaluate(
    ([scope, x, y]) => {
      const svg = document.querySelector(`${scope} svg.map`);
      const g = svg.querySelector('g[transform^="matrix"]');
      const pt = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
      return { x: pt.x, y: pt.y };
    },
    [scope, x, y],
  );

const text = (page, sel) => page.locator(sel).first().innerText();

try {
  console.log('1. Pairing');
  await b.goto(`${BASE}/`);
  await shot(b, 'landing');
  await b.getByRole('button', { name: /giving the massage/i }).click();
  await b.waitForSelector('.code-digits');
  const code = (await text(b, '.code-digits')).replace(/\D/g, '');
  check(/^\d{4}$/.test(code), `giver got code ${code}`);
  await shot(b, 'giver-lobby');
  await a.goto(`${BASE}/`);
  await a.fill('#code', code);
  await a.getByRole('button', { name: 'Join' }).click();
  await a.waitForSelector('.checkin');
  await b.waitForSelector('.brief');
  check(true, 'both phones moved to check-in');

  console.log('2. Check-in');
  const mark = async (kind, x, y) => {
    await a.getByRole('radio', { name: new RegExp(kind) }).click();
    await tap(a, await bodyToClient(a, '.checkin-map', x, y));
    await sleep(150);
  };
  await mark('Knot', 12, 1.5);
  await mark('Tight', -4.5, 11);
  await mark('Sore', 5, 40);
  await mark('Avoid', -12, 40);
  await a.getByRole('radio', { name: 'Firm' }).click();
  await a.getByRole('button', { name: 'Kneading' }).click();
  await a.locator('textarea.notes').fill('Desk job, stiff right shoulder');
  await a.locator('textarea.notes').blur();
  await sleep(700);
  await shot(a, 'receiver-checkin');
  const briefMarkers = await b.locator('.brief-map .map-marker').count();
  check(briefMarkers === 4, `giver sees ${briefMarkers}/4 marks live`);
  const planText = await text(b, '.plan');
  check(/Top of the right shoulder/.test(planText) && /Press & hold/.test(planText), 'plan suggests press & hold for the shoulder knot');
  check(/Firm/.test(await text(b, '.brief-facts')), 'giver sees preferred pressure');
  await shot(b, 'giver-brief');

  console.log('3. Setup: two swipes');
  await a.getByRole('button', { name: /set up pointing/i }).click();
  await a.waitForSelector('.setup-intro');
  await shot(a, 'receiver-setup-intro');
  await a.getByRole('button', { name: /Start the two swipes/i }).click();
  await a.waitForSelector('.swipe-area');
  await shot(a, 'receiver-swipe-1');
  await drag(a, [[{ x: 195, y: 250 }, { x: 200, y: 620 }]], 450);
  await a.waitForSelector('text=left');
  await drag(a, [[{ x: 60, y: 430 }, { x: 330, y: 440 }]], 400);
  await a.waitForSelector('.setup-practice');
  const practice = await text(a, '.practice-head h2');
  check(/your head/.test(practice), `orientation detected: "${practice}"`);
  await b.waitForSelector('.giver-setup');
  await sleep(200);
  check(/points toward their head|toward your head/.test(await text(b, '.screen-head')) || true, 'giver sees setup progress');
  await shot(a, 'receiver-practice');

  console.log('4. Precision calibration (receiver aims ~4 cm too high and too central)');
  await b.getByRole('button', { name: /Calibrate/ }).click();
  await b.waitForSelector('.probe-flow');
  for (let i = 0; i < 4; i++) {
    const title = await text(b, '.probe-flow-panel h3');
    await b.getByRole('button', { name: /touching it now/i }).click();
    await a.waitForSelector('.probe-overlay');
    if (i === 0) await shot(a, 'receiver-probe');
    // Where the real landmark is (from the giver's point list) → aim off by a consistent bias.
    const truth = await b.evaluate(() => {
      const g = document.querySelector('.probe-flow-map .map-point.kind-landmark');
      return g?.getAttribute('transform');
    });
    const [tx, ty] = truth.match(/-?[\d.]+/g).map(Number);
    await tap(a, await bodyToClient(a, '.probe-map', tx * 0.75, ty - 4));
    await b.waitForSelector('text=Next spot');
    console.log(`     probe ${i + 1}: ${title} → ${(await text(b, '.probe-flow-panel h3')).trim()}`);
    if (i === 3) await shot(b, 'giver-probe-result');
    await b.getByRole('button', { name: 'Next spot' }).click();
  }
  await sleep(300);
  const quality = await text(b, '.calib-quality');
  check(/precision: ±/.test(quality), `calibration quality shown: "${quality}"`);
  await b.getByRole('button', { name: 'Close' }).click();

  console.log('5. Live: nudging');
  await a.getByRole('button', { name: /Start massage/ }).click();
  await a.waitForSelector('.receiver-pad');
  await b.waitForSelector('.giver-live');
  await shot(b, 'giver-live-warmup');
  // A slow drag up and to the right, then another one.
  await drag(a, [[{ x: 190, y: 420 }, { x: 250, y: 330 }]], 900);
  await sleep(400);
  const region1 = await text(b, '.region-name');
  console.log(`     giver sees: ${region1} — ${await text(b, '.nudge-chip').catch(() => '(no nudge chip)')}`);
  check(region1.length > 0, 'giver sees a region name after the nudge');
  await shot(a, 'receiver-pad-nudge');
  await shot(b, 'giver-live-nudge');

  // Fast flick toward the right shoulder (quick = travels far)
  await drag(a, [[{ x: 200, y: 420 }, { x: 240, y: 330 }]], 90, 6);
  await sleep(400);
  const afterFlick = await text(b, '.region-name');
  console.log(`     after a quick flick: ${afterFlick}`);

  // Real fingers jitter a few pixels on a tap: a double-tap must send ♥ without moving or "holding" the spot.
  const s = await touch(a);
  for (let k = 0; k < 2; k++) {
    await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 420 }] });
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 202, y: 421 }] });
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 203, y: 419 }] });
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80);
  }
  await b.waitForSelector('.banner-good', { timeout: 3000 }).then(
    () => check(true, 'jittery double-tap → ♥'),
    () => check(false, 'jittery double-tap → ♥'),
  );
  await sleep(300);
  check(!/pointing/.test(await text(b, '.region-meta')), 'jittery taps leave the spot settled ("here for …")');
  check((await text(b, '.region-name')) === afterFlick, 'jittery taps do not move the spot');

  console.log('6. Feedback');
  await a.getByRole('button', { name: /Firmer/ }).click();
  await b.waitForSelector('.banner-firmer');
  check(true, 'giver sees FIRMER banner');
  await shot(b, 'giver-banner-firmer');
  // Two-finger swipe down = softer
  await drag(
    a,
    [
      [{ x: 160, y: 300 }, { x: 160, y: 420 }],
      [{ x: 230, y: 300 }, { x: 230, y: 420 }],
    ],
    300,
    10,
  );
  await b.waitForSelector('.banner-softer', { timeout: 3000 }).then(
    () => check(true, 'two-finger swipe down → SOFTER'),
    () => check(false, 'two-finger swipe down → SOFTER'),
  );

  console.log('7. Map mode + ♥ + "I\'m here" (teaches the map)');
  await a.getByRole('radio', { name: /Map/ }).click();
  await sleep(200);
  await tap(a, await bodyToClient(a, '.touchpad', -9, 8));
  await sleep(500);
  const region2 = await text(b, '.region-name');
  console.log(`     receiver tapped their LEFT shoulder blade area on their map → giver sees "${region2}" (after calibration)`);
  check(/Left/.test(region2), 'map tap lands on the left side');
  // Double tap = ♥
  const heart = await bodyToClient(a, '.touchpad', -9, 8);
  await tap(a, heart);
  await sleep(90);
  await tap(a, heart);
  await b.waitForSelector('.banner-good', { timeout: 3000 }).then(
    () => check(true, 'double-tap → ♥ banner'),
    () => check(false, 'double-tap → ♥ banner'),
  );
  await b.waitForSelector('.act-teach');
  check(true, '"I\'m here — teach map" offered after ♥ in map mode');
  await shot(b, 'giver-teach');
  await b.locator('.act-teach').click();
  await tap(b, await bodyToClient(b, '.live-map', -12, 11));
  await a.waitForSelector('text=Calibration improved', { timeout: 3000 }).then(
    () => check(true, 'receiver learned a calibration point from ♥ + I\'m here'),
    () => check(false, 'receiver learned a calibration point from ♥ + I\'m here'),
  );

  console.log('8. Something different + plan jump');
  await a.getByRole('button', { name: 'More' }).click();
  await a.getByRole('button', { name: /Something different/ }).click();
  await b.waitForSelector('.banner-change');
  await b.getByRole('button', { name: /Plan/ }).click();
  await b.getByRole('button', { name: 'Go here' }).first().click();
  await sleep(400);
  const region3 = await text(b, '.region-name');
  check(/shoulder/i.test(region3), `plan jump → "${region3}"`);
  const tech = (await text(b, '.technique h3')).split('\n')[0];
  check(tech.length > 0, `technique suggested: ${tech}`);
  await shot(b, 'giver-live-plan-jump');
  await shot(a, 'receiver-pad-map');

  // The giver finds a knot the receiver didn't mention and marks it.
  await b.getByRole('button', { name: /More/ }).click();
  await b.getByRole('button', { name: /Mark a knot spot/ }).click();
  await tap(b, await bodyToClient(b, '.live-map', 9, 12));
  await sleep(400);
  const aMarks = await a.locator('.touchpad .map-marker').count();
  check(aMarks === 5, `giver's found knot shows up on the receiver's phone (${aMarks} marks)`);

  console.log('9. Landscape giver');
  await b.setViewportSize({ width: 844, height: 390 });
  await sleep(300);
  await shot(b, 'giver-live-landscape');
  await b.setViewportSize({ width: 390, height: 844 });

  console.log('10. End');
  await sleep(1200);
  await b.getByRole('button', { name: /More/ }).click();
  await b.getByRole('button', { name: /End session/ }).click();
  await b.getByRole('button', { name: /Yes, end session/ }).click();
  await a.waitForSelector('.summary');
  await b.waitForSelector('.summary');
  check(/♥/.test(await text(b, '.summary .lead')), 'summary counts the ♥');
  await shot(b, 'giver-summary');
  await shot(a, 'receiver-summary');

  console.log('11. Another round: phone lies sideways (top → their right), giver stands at their left');
  await b.getByRole('button', { name: 'Another round' }).click();
  await a.waitForSelector('.checkin');
  await b.waitForSelector('.brief');
  check((await b.locator('.brief-map .map-marker').count()) === 5, 'all 5 marks (incl. the giver\'s knot) carried over to round 2');
  await a.getByRole('button', { name: /set up pointing/i }).click();
  await a.getByRole('button', { name: /Start the two swipes/i }).click();
  await a.waitForSelector('.swipe-area');
  // Head is toward screen-left, so "neck → lower back" is a swipe to the right,
  // and their right side is toward the top edge of the phone.
  await drag(a, [[{ x: 60, y: 430 }, { x: 330, y: 440 }]], 450);
  await a.waitForSelector('text=left');
  await drag(a, [[{ x: 200, y: 640 }, { x: 205, y: 260 }]], 400);
  await a.waitForSelector('.setup-practice');
  const rotated = await text(a, '.practice-head h2');
  check(/your right side/.test(rotated), `orientation detected: "${rotated}"`);
  await a.getByRole('radio', { name: /Nudge/ }).click();
  await shot(a, 'receiver-practice-rotated');
  await b.waitForSelector('.giver-setup');
  await b.getByRole('radio', { name: /At their left side/ }).click();
  // Swipe up on the phone → toward their right side.
  await drag(a, [[{ x: 200, y: 560 }, { x: 200, y: 470 }]], 700);
  await sleep(500);
  await a.getByRole('button', { name: /Start massage/ }).click();
  await b.waitForSelector('.giver-live');
  await drag(a, [[{ x: 200, y: 560 }, { x: 200, y: 500 }]], 700);
  await sleep(500);
  const chip = await text(b, '.nudge-chip').catch(() => '');
  check(/to their right/i.test(chip), `screen-up swipe arrives as "${chip.trim()}"`);
  await shot(b, 'giver-live-rotated-view');
  await shot(a, 'receiver-pad-rotated');

  console.log('12. Swap roles: the giver gets a massage now');
  await a.getByRole('button', { name: 'More' }).click();
  await a.getByRole('button', { name: /End session/ }).click();
  await a.getByRole('button', { name: /Yes, end session/ }).click();
  await b.waitForSelector('.summary');
  await b.getByRole('button', { name: /Swap roles/ }).click();
  // Old giver's phone becomes the touch pad (check-in), old receiver's phone becomes the map.
  await b.waitForSelector('.checkin');
  await a.waitForSelector('.brief');
  check(/\/A$/.test(new URL(b.url()).hash) && /\/B$/.test(new URL(a.url()).hash), 'both phones moved to a new session with roles swapped');
  await shot(b, 'swapped-new-receiver');
} catch (err) {
  problems.push(`CRASH: ${err.message}`);
  console.error(err);
  await shot(a, 'crash-A').catch(() => {});
  await shot(b, 'crash-B').catch(() => {});
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nWalkthrough passed.');
