/** Named areas of the back, derived from a body position with simple deterministic rules. */
import type { Vec } from './geometry.ts';

export type Side = 'l' | 'r' | 'c';

export type RegionBase =
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

interface RegionDef {
  base: RegionBase;
  sided: boolean;
  /** `{side}` is replaced by "left"/"right". */
  name: string;
  short: string;
  muscle: string;
  /** Centroid for the right side (mirrored for the left). */
  centroid: Vec;
}

const DEFS: Record<RegionBase, RegionDef> = {
  skull_base: {
    base: 'skull_base',
    sided: false,
    name: 'Base of the skull',
    short: 'Skull base',
    muscle: 'suboccipitals',
    centroid: { x: 0, y: -10.2 },
  },
  neck_mid: {
    base: 'neck_mid',
    sided: false,
    name: 'Back of the neck',
    short: 'Neck',
    muscle: 'cervical spine — work beside it',
    centroid: { x: 0, y: -4.5 },
  },
  neck: {
    base: 'neck',
    sided: true,
    name: '{Side} side of the neck',
    short: '{S} neck',
    muscle: 'levator scapulae, upper trapezius',
    centroid: { x: 3.4, y: -4.5 },
  },
  trap: {
    base: 'trap',
    sided: true,
    name: 'Top of the {side} shoulder',
    short: '{S} shoulder top',
    muscle: 'upper trapezius',
    centroid: { x: 12, y: 1.6 },
  },
  deltoid: {
    base: 'deltoid',
    sided: true,
    name: '{Side} shoulder cap',
    short: '{S} shoulder cap',
    muscle: 'deltoid, rotator cuff',
    centroid: { x: 20.6, y: 8 },
  },
  rhomboid: {
    base: 'rhomboid',
    sided: true,
    name: 'Between spine and {side} shoulder blade',
    short: '{S} between blades',
    muscle: 'rhomboids, middle trapezius',
    centroid: { x: 4.4, y: 11 },
  },
  scapula: {
    base: 'scapula',
    sided: true,
    name: '{Side} shoulder blade',
    short: '{S} shoulder blade',
    muscle: 'infraspinatus, teres',
    centroid: { x: 12.4, y: 10.5 },
  },
  upper_spine: {
    base: 'upper_spine',
    sided: false,
    name: 'Upper spine',
    short: 'Upper spine',
    muscle: 'thoracic spine — work beside it',
    centroid: { x: 0, y: 15 },
  },
  midback: {
    base: 'midback',
    sided: true,
    name: '{Side} mid back',
    short: '{S} mid back',
    muscle: 'erector spinae',
    centroid: { x: 5.2, y: 26 },
  },
  lats: {
    base: 'lats',
    sided: true,
    name: '{Side} side of the rib cage',
    short: '{S} side',
    muscle: 'latissimus dorsi',
    centroid: { x: 15.2, y: 24 },
  },
  lowback: {
    base: 'lowback',
    sided: true,
    name: '{Side} lower back',
    short: '{S} lower back',
    muscle: 'lumbar erector spinae',
    centroid: { x: 4.8, y: 39.5 },
  },
  flank: {
    base: 'flank',
    sided: true,
    name: '{Side} waist',
    short: '{S} waist',
    muscle: 'quadratus lumborum, obliques',
    centroid: { x: 12.2, y: 39.5 },
  },
  lower_spine: {
    base: 'lower_spine',
    sided: false,
    name: 'Lower spine',
    short: 'Lower spine',
    muscle: 'lumbar spine — work beside it',
    centroid: { x: 0, y: 39 },
  },
  sacrum: {
    base: 'sacrum',
    sided: false,
    name: 'Sacrum',
    short: 'Sacrum',
    muscle: 'sacrum, SI joints',
    centroid: { x: 0, y: 53 },
  },
  hip: {
    base: 'hip',
    sided: true,
    name: 'Top of the {side} hip',
    short: '{S} hip',
    muscle: 'gluteus medius',
    centroid: { x: 11.8, y: 52 },
  },
};

/** Top-to-bottom order, used for sorting plans and summaries. */
export const REGION_ORDER: RegionBase[] = [
  'skull_base',
  'neck_mid',
  'neck',
  'trap',
  'deltoid',
  'rhomboid',
  'scapula',
  'upper_spine',
  'lats',
  'midback',
  'lowback',
  'flank',
  'lower_spine',
  'sacrum',
  'hip',
];

export function classifyBase(p: Vec): RegionBase {
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

export function sideOf(p: Vec): 'l' | 'r' {
  return p.x < 0 ? 'l' : 'r';
}

export function regionId(base: RegionBase, side: Side): RegionId {
  return DEFS[base].sided && side !== 'c' ? `${base}_${side}` : base;
}

export function classify(p: Vec): RegionId {
  const base = classifyBase(p);
  return regionId(base, sideOf(p));
}

export function parseRegion(id: RegionId): { base: RegionBase; side: Side } {
  const m = /^(.*)_(l|r)$/.exec(id);
  if (m && m[1] in DEFS) return { base: m[1] as RegionBase, side: m[2] as Side };
  return { base: (id in DEFS ? id : 'upper_spine') as RegionBase, side: 'c' };
}

const fill = (template: string, side: Side) => {
  const word = side === 'l' ? 'left' : side === 'r' ? 'right' : '';
  return template
    .replace('{side}', word)
    .replace('{Side}', word.charAt(0).toUpperCase() + word.slice(1))
    .replace('{S}', side === 'l' ? 'L' : side === 'r' ? 'R' : '');
};

export interface RegionInfo {
  id: RegionId;
  base: RegionBase;
  side: Side;
  name: string;
  short: string;
  muscle: string;
  centroid: Vec;
}

export function regionInfo(id: RegionId): RegionInfo {
  const { base, side } = parseRegion(id);
  const def = DEFS[base];
  const c = def.centroid;
  return {
    id,
    base,
    side,
    name: fill(def.name, side),
    short: fill(def.short, side),
    muscle: def.muscle,
    centroid: side === 'l' ? { x: -c.x, y: c.y } : c,
  };
}

export function regionOrderIndex(id: RegionId): number {
  const { base, side } = parseRegion(id);
  return REGION_ORDER.indexOf(base) * 3 + (side === 'l' ? 0 : side === 'c' ? 1 : 2);
}
