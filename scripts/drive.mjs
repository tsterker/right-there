/** Driving the app in a browser (Playwright), shared by the e2e and screenshot scripts. */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The code a pairing screen shows in its QR code. */
export const codeOf = async (page, scope = '') =>
  (await page.locator(`${scope} .pair-qr[data-code]`.trim()).first().getAttribute('data-code')) ?? '';

/**
 * The host shows its code: the guest opens the link from the QR code, the host
 * pastes the reply. `beforeConnect` runs while the guest shows its reply.
 */
export async function pair(host, guest, guestUrl, scope = '', beforeConnect = async () => {}) {
  await host.waitForSelector(`${scope} .pair-qr[data-code]`.trim());
  const offer = await codeOf(host, scope);
  await guest.goto(`${guestUrl}#/p2p/join/${offer}`);
  await guest.waitForSelector('.pair-qr[data-code]');
  const reply = await codeOf(guest);
  await beforeConnect();
  const paste = host.locator(`${scope} .pair-paste`.trim());
  if (!(await paste.evaluate((d) => d.open))) await paste.locator('summary').click();
  await host.fill(`${scope} .paste-row input`.trim(), reply);
  await host.locator(scope || 'body').getByRole('button', { name: 'Connect' }).click();
  return { offer, reply };
}

// Input: real touch events (Chrome DevTools Protocol) for phones, the mouse otherwise.
export async function touchDrag(page, from, to, ms = 600, steps = 16) {
  const s = await page.context().newCDPSession(page);
  const at = (k) => [{ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps }];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= steps; k++) {
    await sleep(ms / steps);
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function touchTaps(page, p, count = 1) {
  const s = await page.context().newCDPSession(page);
  for (let i = 0; i < count; i++) {
    await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(90);
  }
}

/** One finger down, still, for `ms`. */
export async function touchHold(page, p, ms = 700) {
  const s = await page.context().newCDPSession(page);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await sleep(ms);
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Two fingers down and up together, a little apart. */
export async function touchTwoFingerTap(page, p) {
  const s = await page.context().newCDPSession(page);
  const points = [
    { x: p.x - 30, y: p.y, id: 1 },
    { x: p.x + 30, y: p.y, id: 2 },
  ];
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await sleep(60);
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function mouseDrag(page, from, to, steps = 16) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Screen position of a body point (cm) on the map inside `scope`. */
export const onMap = (page, scope, x, y) =>
  page.evaluate(
    ([scope, x, y]) => {
      const g = document.querySelector(`${scope} svg.map g[transform^="matrix"]`);
      const pt = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
      return { x: pt.x, y: pt.y };
    },
    [scope, x, y],
  );

/** The receiver's two setup swipes: neck → lower back, then left → right (phone upright). */
export async function setupSwipes(page, drag) {
  await page.getByRole('button', { name: 'Start the two swipes' }).click();
  const box = await page.locator('.swipe-area').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await drag(page, { x: cx, y: box.y + box.height * 0.3 }, { x: cx, y: box.y + box.height * 0.75 });
  await page.getByText('Swipe 2 of 2').waitFor();
  await drag(page, { x: box.x + box.width * 0.15, y: cy }, { x: box.x + box.width * 0.85, y: cy });
  await page.waitForSelector('.receiver-pad');
}
