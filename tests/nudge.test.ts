import { describe, expect, it } from 'vitest';
import {
  arrowFor,
  ballisticGain,
  describeNudge,
  Nudger,
  PX_PER_CM,
  sensitivityFromSwipes,
  strokeTravel,
  tuneFromStrokes,
  type Sample,
  type Stroke,
} from '../src/shared/nudge';

/** A straight swipe of `cm` finger-centimetres in `ms` milliseconds along direction (dx, dy). */
const swipe = (dx: number, dy: number, cm: number, ms: number, steps = 30): Sample[] => {
  const l = Math.hypot(dx, dy);
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: (dx / l) * cm * PX_PER_CM * (i / steps),
    y: (dy / l) * cm * PX_PER_CM * (i / steps),
    t: (ms * i) / steps,
  }));
};

describe('ballistics', () => {
  it('moves precisely when slow and far when fast', () => {
    expect(ballisticGain(1)).toBeLessThan(ballisticGain(10));
    expect(ballisticGain(10)).toBeLessThan(ballisticGain(40));
    expect(ballisticGain(0)).toBeCloseTo(1.6);
    expect(ballisticGain(100)).toBeCloseTo(6.5);
  });

  it('travels further for the same finger distance when swiped quickly', () => {
    const slow = strokeTravel(swipe(0, 1, 3, 1500));
    const fast = strokeTravel(swipe(0, 1, 3, 100));
    expect(fast).toBeGreaterThan(slow * 2);
  });

  it('derives a bounded sensitivity from the setup swipes', () => {
    const typical = sensitivityFromSwipes(swipe(0, 1, 6, 400), swipe(1, 0, 4, 350));
    expect(typical).toBeGreaterThan(0.5);
    expect(typical).toBeLessThan(2.5);
    const tiny = sensitivityFromSwipes(swipe(0, 1, 0.3, 300), swipe(1, 0, 0.3, 300));
    expect(tiny).toBe(2.5);
  });
});

describe('Nudger', () => {
  it('maps finger movement through the phone orientation', () => {
    // Phone rotated so that the head is toward screen-left: swiping left = toward the head.
    const n = new Nudger({ angle: 270, mirrored: false }, 1, 1);
    n.begin({ x: 200, y: 300, t: 0 });
    const d = n.move({ x: 200 - PX_PER_CM, y: 300, t: 500 });
    expect(d.y).toBeLessThan(0); // toward the head
    expect(Math.abs(d.x)).toBeLessThan(1e-9);
  });

  it('applies sensitivity and tune multiplicatively', () => {
    const a = new Nudger({ angle: 0, mirrored: false }, 1, 1);
    const b = new Nudger({ angle: 0, mirrored: false }, 2, 1.5);
    a.begin({ x: 0, y: 0, t: 0 });
    b.begin({ x: 0, y: 0, t: 0 });
    const da = a.move({ x: 30, y: 0, t: 200 });
    const db = b.move({ x: 30, y: 0, t: 200 });
    expect(db.x / da.x).toBeCloseTo(3);
  });
});

describe('auto-tune', () => {
  const s = (x: number, y: number, at: number, dur = 300): Stroke => ({ d: { x, y }, at, dur });

  it('lowers sensitivity after an overshoot and correction', () => {
    const r = tuneFromStrokes([s(10, 0, 0), s(-3, 0.5, 900)], 1);
    expect(r.reason).toBe('overshoot');
    expect(r.tune).toBeLessThan(1);
  });

  it('raises sensitivity after repeated clutching in one direction', () => {
    const r = tuneFromStrokes([s(0, 4, 0), s(0.3, 4, 700), s(-0.2, 4, 1400)], 1);
    expect(r.reason).toBe('undershoot');
    expect(r.tune).toBeGreaterThan(1);
  });

  it('leaves deliberate movement alone', () => {
    expect(tuneFromStrokes([s(10, 0, 0), s(0, 8, 5000)], 1).reason).toBeNull();
    expect(tuneFromStrokes([s(10, 0, 0)], 1).reason).toBeNull();
  });

  it('stays within bounds', () => {
    let tune = 1;
    for (let i = 0; i < 100; i++) tune = tuneFromStrokes([s(10, 0, 0), s(-3, 0, 900)], tune).tune;
    expect(tune).toBe(0.5);
  });
});

describe('describeNudge', () => {
  it('speaks in body terms', () => {
    expect(describeNudge({ x: 0, y: -2 })).toBe('A little higher');
    expect(describeNudge({ x: 6, y: 0.5 })).toBe('To their right');
    expect(describeNudge({ x: -8, y: 8 })).toBe('Lower and to their left');
    expect(describeNudge({ x: 0, y: 15 })).toBe('A lot lower');
    expect(describeNudge({ x: 0.2, y: 0.3 })).toBeNull();
  });

  it('draws screen arrows', () => {
    expect(arrowFor({ x: 0, y: -1 })).toBe('↑');
    expect(arrowFor({ x: 1, y: 1 })).toBe('↘');
  });
});
