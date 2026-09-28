import { describe, expect, it } from 'vitest';
import {
  bodyToScreen,
  correct,
  describeOrientation,
  fitCorrection,
  orientationFromSwipes,
  screenToBody,
  type CalibPoint,
  type Orientation,
} from '../src/shared/calibration';
import { apply, dist, type Vec } from '../src/shared/geometry';

const close = (a: Vec, b: Vec, eps = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
  return dist(a, b) < eps;
};

/** Screen swipes a person would make for a phone lying in orientation `o`. */
const swipesFor = (o: Orientation) => {
  const m = bodyToScreen(o);
  const down = apply(m, { x: 0, y: 200 });
  const right = apply(m, { x: 200, y: 0 });
  return { down, right };
};

describe('orientationFromSwipes', () => {
  it('recognises the upright phone (top toward the head)', () => {
    const r = orientationFromSwipes({ x: 3, y: 240 }, { x: 180, y: -10 });
    expect(r).toMatchObject({ ok: true, orientation: { angle: 0, mirrored: false } });
  });

  for (const angle of [0, 90, 180, 270]) {
    for (const mirrored of [false, true]) {
      it(`round-trips angle ${angle}${mirrored ? ' mirrored' : ''}`, () => {
        const { down, right } = swipesFor({ angle, mirrored });
        const r = orientationFromSwipes(down, right);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.orientation).toEqual({ angle, mirrored });
        // screenToBody must undo bodyToScreen.
        const back = apply(screenToBody(r.orientation), down);
        close(back, { x: 0, y: 200 });
      });
    }
  }

  it('handles the phone lying beside the face, top pointing to their right', () => {
    // Head toward screen-left, feet toward screen-right, their right side toward the top edge.
    const r = orientationFromSwipes({ x: 220, y: 8 }, { x: -6, y: -190 });
    expect(r).toMatchObject({ ok: true, orientation: { angle: 270, mirrored: false } });
    if (r.ok) expect(describeOrientation(r.orientation)).toContain('your right side');
  });

  it('rejects short, diagonal or parallel swipes', () => {
    expect(orientationFromSwipes({ x: 0, y: 20 }, { x: 200, y: 0 })).toMatchObject({ ok: false, error: 'too-short' });
    expect(orientationFromSwipes({ x: 150, y: 150 }, { x: 200, y: 0 })).toMatchObject({ ok: false, error: 'not-straight' });
    expect(orientationFromSwipes({ x: 0, y: 200 }, { x: 0, y: -200 })).toMatchObject({ ok: false, error: 'same-direction' });
  });

  it('describes the orientation in body terms', () => {
    expect(describeOrientation({ angle: 0, mirrored: false })).toContain('your head');
    expect(describeOrientation({ angle: 180, mirrored: false })).toContain('your feet');
    expect(describeOrientation({ angle: 0, mirrored: true })).toContain('mirror');
  });
});

const pt = (raw: Vec, truth: Vec, i: number): CalibPoint => ({ raw, truth, at: 1000 + i });

describe('map correction', () => {
  it('is the identity without points', () => {
    const m = fitCorrection([]);
    expect(correct(m, { x: 5, y: 20 })).toEqual({ x: 5, y: 20 });
  });

  it('turns a single point into a pure shift', () => {
    const m = fitCorrection([pt({ x: 10, y: 30 }, { x: 12, y: 26 }, 0)]);
    const far = correct(m, { x: -8, y: 5 });
    // Kernel only acts locally; far away we still get most of the shift from the affine offset.
    expect(far.x).toBeCloseTo(-6, 0);
    expect(far.y).toBeCloseTo(1, 0);
  });

  it('learns a consistent distortion and predicts unseen points', () => {
    // Receiver squeezes everything toward the middle of the back and aims too high.
    const distort = (p: Vec): Vec => ({ x: p.x * 0.7, y: 25 + (p.y - 25) * 0.75 - 3 });
    const truths: Vec[] = [
      { x: -12, y: 10 },
      { x: 12, y: 10 },
      { x: -6, y: 41 },
      { x: 6, y: 41 },
      { x: 0, y: 0 },
      { x: 4.5, y: 24 },
      { x: -13, y: 1 },
      { x: -4.5, y: 24 },
    ];
    const points = truths.map((t, i) => pt(distort(t), t, i));
    const model = fitCorrection(points);
    const unseen = { x: 9, y: 33 };
    const before = dist(distort(unseen), unseen);
    const after = dist(correct(model, distort(unseen)), unseen);
    expect(before).toBeGreaterThan(4);
    // The local correction is deliberately conservative (robust to noisy taps), so allow ~1.5 cm.
    expect(after).toBeLessThan(2);
  });

  it('prefers recent points when the receiver changes their habit', () => {
    const old = Array.from({ length: 6 }, (_, i) => pt({ x: -10 + i * 4, y: 20 }, { x: -10 + i * 4 + 5, y: 20 }, i));
    const recent = Array.from({ length: 6 }, (_, i) => pt({ x: -10 + i * 4, y: 20 }, { x: -10 + i * 4, y: 20 }, 100 + i));
    const model = fitCorrection([...old, ...recent]);
    const c = correct(model, { x: 0, y: 20 });
    expect(Math.abs(c.x)).toBeLessThan(2.5);
  });
});
