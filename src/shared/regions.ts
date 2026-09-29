/** Named areas of the back, derived from a body position with simple deterministic rules. */
import type { Vec } from './geometry.ts';

type Base =
  | 'skull_base'
  | 'neck_mid'
  | 'neck'
  | 'trap'
  | 'deltoid'
  | 'rhomboid'
  | 'scapula'
  | 'upper_spine'
  | 'midback'
  | 'lats'
  | 'lowback'
  | 'flank'
  | 'lower_spine'
  | 'sacrum'
  | 'hip';

/** e.g. "trap_l", "sacrum". Centre regions have no suffix. */
export type RegionId = string;

/** `{side}` is replaced by "left"/"right"; names without it are centre regions. */
const NAMES: Record<Base, string> = {
  skull_base: 'Base of the skull',
  neck_mid: 'Back of the neck',
  neck: '{Side} side of the neck',
  trap: 'Top of the {side} shoulder',
  deltoid: '{Side} shoulder cap',
  rhomboid: 'Between spine and {side} shoulder blade',
  scapula: '{Side} shoulder blade',
  upper_spine: 'Upper spine',
  midback: '{Side} mid back',
  lats: '{Side} side of the rib cage',
  lowback: '{Side} lower back',
  flank: '{Side} waist',
  lower_spine: 'Lower spine',
  sacrum: 'Sacrum',
  hip: 'Top of the {side} hip',
};

/** Sided areas worked on both sides at once. */
const BOTH: Partial<Record<Base, string>> = {
  neck: 'Both sides of the neck',
  trap: 'Tops of both shoulders',
  deltoid: 'Both shoulder caps',
  rhomboid: 'Between spine and shoulder blades',
  scapula: 'Both shoulder blades',
  midback: 'Both sides of the mid back',
  lats: 'Both sides of the rib cage',
  lowback: 'Both sides of the lower back',
  flank: 'Both sides of the waist',
  hip: 'Tops of both hips',
};

function classifyBase(p: Vec): Base {
  const ax = Math.abs(p.x);
  const y = p.y;
  if (y < -8.5) return 'skull_base';
  if (y < 0.8 && ax < 5.8) return ax < 1.3 ? 'neck_mid' : 'neck';
  if (y < 4.5 && ax < 18.8 && ax >= 5.8) return 'trap';
  if (y < 13 && ax >= 18.8) return 'deltoid';
  if (y < 0.8) return 'trap';
  if (ax < 1.3) {
    if (y < 31) return 'upper_spine';
    if (y < 47.5) return 'lower_spine';
    return 'sacrum';
  }
  if (y < 19) {
    if (ax < 7.4) return 'rhomboid';
    if (ax < 18.8) return 'scapula';
    return 'lats';
  }
  if (y < 33) return ax < 9.5 ? 'midback' : 'lats';
  if (y < 45.5) return ax < 8.2 ? 'lowback' : 'flank';
  if (ax < 5.2) return y >= 47.5 ? 'sacrum' : 'lowback';
  return 'hip';
}

const sided = (base: Base) => NAMES[base].toLowerCase().includes('{side}');

export function classify(p: Vec): RegionId {
  const base = classifyBase(p);
  return sided(base) ? `${base}_${p.x < 0 ? 'l' : 'r'}` : base;
}

/** `both`: the area on both sides of the spine ("Both shoulder blades"). */
export function regionName(id: RegionId, both = false): string {
  const m = /^(.*)_(l|r)$/.exec(id);
  const base = (m && m[1] in NAMES ? m[1] : id in NAMES ? id : 'upper_spine') as Base;
  if (both && BOTH[base]) return BOTH[base];
  const side = m && m[1] in NAMES ? (m[2] === 'l' ? 'left' : 'right') : '';
  return NAMES[base].replace('{side}', side).replace('{Side}', side.charAt(0).toUpperCase() + side.slice(1));
}
