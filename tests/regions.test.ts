import { describe, expect, it } from 'vitest';
import { clampToBody, isOnBody, LANDMARKS, torsoHalfWidth } from '../src/shared/body';
import { classify, regionInfo } from '../src/shared/regions';
import { buildPlan, hintFor } from '../src/shared/techniques';

describe('regions', () => {
  it.each([
    [{ x: 0, y: -10 }, 'skull_base'],
    [{ x: -3, y: -5 }, 'neck_l'],
    [{ x: 12, y: 1.5 }, 'trap_r'],
    [{ x: -21, y: 8 }, 'deltoid_l'],
    [{ x: 4, y: 11 }, 'rhomboid_r'],
    [{ x: -12, y: 10 }, 'scapula_l'],
    [{ x: 0.5, y: 18 }, 'upper_spine'],
    [{ x: 5, y: 26 }, 'midback_r'],
    [{ x: -16, y: 25 }, 'lats_l'],
    [{ x: 5, y: 40 }, 'lowback_r'],
    [{ x: -13, y: 40 }, 'flank_l'],
    [{ x: 0, y: 40 }, 'lower_spine'],
    [{ x: 1, y: 54 }, 'sacrum'],
    [{ x: 11, y: 52 }, 'hip_r'],
  ])('classifies %o as %s', (p, id) => {
    expect(classify(p)).toBe(id);
  });

  it('names regions with the side', () => {
    expect(regionInfo('scapula_l').name).toBe('Left shoulder blade');
    expect(regionInfo('trap_r').short).toBe('R shoulder top');
    expect(regionInfo('sacrum').name).toBe('Sacrum');
    expect(regionInfo('lowback_l').centroid.x).toBeLessThan(0);
  });

  it('has every landmark on the body', () => {
    for (const l of Object.values(LANDMARKS)) expect(isOnBody(l.pos)).toBe(true);
  });

  it('keeps points on the body', () => {
    const p = clampToBody({ x: 40, y: 38 });
    expect(p.x).toBeLessThan(torsoHalfWidth(38));
    expect(clampToBody({ x: 0, y: -40 }).y).toBe(-11.5);
    expect(clampToBody({ x: 0, y: 90 }).y).toBe(62);
  });
});

describe('hints', () => {
  it('suggests press & hold for a knot on the shoulder top', () => {
    const h = hintFor({
      pos: { x: 12, y: 1.5 },
      markers: [{ kind: 'knot', pos: { x: 13, y: 2 } }],
      pressure: 3,
      likes: [],
      change: 0,
    });
    expect(h.regionName).toBe('Top of the right shoulder');
    expect(h.symptom?.kind).toBe('knot');
    expect(h.technique?.id).toBe('hold');
  });

  it('cycles techniques when asked for something different', () => {
    const base = { pos: { x: -5, y: 26 }, markers: [], pressure: 3, likes: [] };
    const a = hintFor({ ...base, change: 0 }).technique?.id;
    const b = hintFor({ ...base, change: 1 }).technique?.id;
    expect(a).not.toBe(b);
  });

  it('warns near an avoid marker and on delicate areas', () => {
    const h = hintFor({ pos: { x: 6, y: 40 }, markers: [{ kind: 'avoid', pos: { x: 7, y: 41 } }], pressure: 3, likes: [], change: 0 });
    expect(h.avoid).toBe(true);
    expect(h.technique).toBeNull();
    const neck = hintFor({ pos: { x: -3, y: -5 }, markers: [], pressure: 5, likes: [], change: 0 });
    expect(neck.cautions.join(' ')).toMatch(/Delicate/);
  });

  it('puts liked techniques first when no symptom is marked', () => {
    const h = hintFor({ pos: { x: 12, y: 1.5 }, markers: [], pressure: 3, likes: ['forearm'], change: 0 });
    expect(h.technique?.id).toBe('forearm');
  });
});

describe('plan', () => {
  it('orders focus areas top to bottom between warm-up and cool-down', () => {
    const plan = buildPlan(
      [
        { kind: 'sore', pos: { x: 5, y: 40 } },
        { kind: 'knot', pos: { x: 12, y: 1.5 } },
        { kind: 'avoid', pos: { x: -12, y: 10 } },
      ],
      20,
      [],
    );
    expect(plan.steps.map((s) => s.kind)).toEqual(['warmup', 'focus', 'focus', 'cooldown']);
    expect(plan.steps[1].regionId).toBe('trap_r');
    expect(plan.steps[2].regionId).toBe('lowback_r');
    expect(plan.avoid[0].regionId).toBe('scapula_l');
    const total = plan.steps.reduce((s, x) => s + x.minutes, 0);
    expect(total).toBeGreaterThan(18);
    expect(total).toBeLessThan(22);
  });

  it('suggests a default route without markers', () => {
    const plan = buildPlan([], null, []);
    expect(plan.steps.filter((s) => s.kind === 'focus').length).toBe(3);
  });
});
