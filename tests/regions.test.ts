import { describe, expect, it } from 'vitest';
import { clampToBody, torsoHalfWidth } from '../src/shared/body';
import { classify, regionName } from '../src/shared/regions';

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
    expect(regionName('scapula_l')).toBe('Left shoulder blade');
    expect(regionName('trap_r')).toBe('Top of the right shoulder');
    expect(regionName('neck_mid')).toBe('Back of the neck');
    expect(regionName('sacrum')).toBe('Sacrum');
    expect(regionName('scapula_l', true)).toBe('Both shoulder blades');
    expect(regionName('trap_r', true)).toBe('Tops of both shoulders');
    expect(regionName('upper_spine', true)).toBe('Upper spine');
  });

  it('keeps points on the body', () => {
    const p = clampToBody({ x: 40, y: 38 });
    expect(p.x).toBeLessThan(torsoHalfWidth(38));
    expect(clampToBody({ x: 0, y: -40 }).y).toBe(-11.5);
    expect(clampToBody({ x: 0, y: 90 }).y).toBe(62);
  });
});
