import { describe, expect, it } from 'vitest';
import { restingAt, stepSmudge, stirring, type Smudge } from '../src/client/lib/smudge';

const run = (s: Smudge, head: (t: number) => { x: number; y: number }, seconds: number, leash = 100) => {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) s = stepSmudge(s, head(t), dt, leash);
  return s;
};

describe('smudge', () => {
  it('trails behind a moving spot, on the side it came from', () => {
    // The spot moves right at 20 cm/s for half a second.
    const s = run(restingAt({ x: 0, y: 0 }), (t) => ({ x: 20 * t, y: 0 }), 0.5);
    const lag = 10 - s.mass.x;
    expect(lag).toBeGreaterThan(3);
    expect(lag).toBeLessThan(8);
    expect(Math.abs(s.mass.y)).toBeLessThan(1e-9);
  });

  it('catches up and comes to rest, without much wobble', () => {
    const at = { x: 10, y: -5 };
    let s = restingAt({ x: 0, y: 0 });
    let furthest = 0;
    const dt = 1 / 60;
    for (let t = 0; t < 2; t += dt) {
      s = stepSmudge(s, at, dt, 100);
      furthest = Math.max(furthest, s.mass.x);
    }
    expect(furthest).toBeLessThan(10.5);
    expect(stirring(s, at)).toBe(false);
  });

  it('never trails further than the leash', () => {
    const s = stepSmudge(restingAt({ x: 0, y: 0 }), { x: 40, y: 0 }, 1 / 60, 12);
    expect(40 - s.mass.x).toBeCloseTo(12, 5);
  });
});
