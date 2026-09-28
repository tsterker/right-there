/**
 * The back model.
 *
 * Coordinates are centimetres on an average adult back seen from behind
 * (posterior view): x = 0 is the spine, +x is the receiver's RIGHT side,
 * y = 0 is the C7 vertebra (the bony bump at the base of the neck) and +y
 * points toward the feet. Everything else (screens, rotations, calibration)
 * maps into this frame, so both phones always talk about the same spot.
 */
import { clamp, type Vec } from './geometry.ts';

/** Right half of the torso outline, from the neck (under the head) down to the bottom centre. */
const RIGHT_OUTLINE: Vec[] = [
  { x: 4.3, y: -14 },
  { x: 4.6, y: -8 },
  { x: 5.6, y: -3.2 },
  { x: 8.6, y: -1.2 },
  { x: 13, y: 0.1 },
  { x: 17.4, y: 1.5 },
  { x: 20.7, y: 3.6 },
  { x: 22.5, y: 6.8 },
  { x: 22.3, y: 10.4 },
  { x: 20.4, y: 13.8 },
  { x: 19.6, y: 18 },
  { x: 19.2, y: 24 },
  { x: 18.2, y: 30 },
  { x: 16.5, y: 35.5 },
  { x: 15.7, y: 39 },
  { x: 16.4, y: 44 },
  { x: 17.8, y: 50 },
  { x: 18.2, y: 55 },
  { x: 17.5, y: 60 },
  { x: 14.6, y: 63.3 },
  { x: 8.4, y: 65 },
];

const mirror = (p: Vec): Vec => ({ x: -p.x, y: p.y });

/** Closed torso outline, clockwise starting at the right side of the neck. */
export const TORSO_OUTLINE: Vec[] = [
  ...RIGHT_OUTLINE,
  { x: 0, y: 65.4 },
  ...RIGHT_OUTLINE.slice().reverse().map(mirror),
];

export const HEAD = { cx: 0, cy: -21.5, rx: 7.6, ry: 9.2 };

/** Arm hanging along the right side (mirror for the left). Fades out toward the hands. */
export const RIGHT_ARM: Vec[] = [
  { x: 21.6, y: 7.5 },
  { x: 25, y: 7.2 },
  { x: 27.2, y: 12 },
  { x: 27.9, y: 22 },
  { x: 27.6, y: 34 },
  { x: 27.3, y: 46 },
  { x: 27, y: 60 },
  { x: 22.8, y: 60 },
  { x: 22.9, y: 46 },
  { x: 22.6, y: 34 },
  { x: 21.9, y: 24 },
  { x: 21.1, y: 15 },
];
export const LEFT_ARM = RIGHT_ARM.map(mirror);

export const RIGHT_SCAPULA: Vec[] = [
  { x: 6.8, y: 3.2 },
  { x: 11, y: 3.3 },
  { x: 15.2, y: 4.6 },
  { x: 16.9, y: 7.4 },
  { x: 14.6, y: 12.6 },
  { x: 10.4, y: 18.4 },
  { x: 8.2, y: 15.8 },
  { x: 7, y: 9.5 },
];
export const LEFT_SCAPULA = RIGHT_SCAPULA.map(mirror);

/** Ridge ("spine") of the shoulder blade, running out to the shoulder tip. */
export const RIGHT_SCAPULA_SPINE: Vec[] = [
  { x: 7.3, y: 6.9 },
  { x: 12.6, y: 5.4 },
  { x: 18.8, y: 4 },
];
export const LEFT_SCAPULA_SPINE = RIGHT_SCAPULA_SPINE.map(mirror);

/** Top edge of the pelvis (iliac crest), from the dimple near the sacrum outward. */
export const RIGHT_ILIAC_CREST: Vec[] = [
  { x: 4.6, y: 49 },
  { x: 7.6, y: 45.3 },
  { x: 12, y: 43.7 },
  { x: 16.1, y: 44.5 },
  { x: 17.9, y: 47.2 },
];
export const LEFT_ILIAC_CREST = RIGHT_ILIAC_CREST.map(mirror);

export const SACRUM: Vec[] = [
  { x: -5.2, y: 48.8 },
  { x: 5.2, y: 48.8 },
  { x: 3.4, y: 55.6 },
  { x: 0, y: 61 },
  { x: -3.4, y: 55.6 },
];

/** Lower rib arcs (right side), a faint hint of the rib cage above the kidneys. */
export const RIGHT_RIBS: Vec[][] = [
  [
    { x: 2.4, y: 28.6 },
    { x: 8, y: 30.6 },
    { x: 14.6, y: 33.6 },
  ],
  [
    { x: 2.4, y: 31.4 },
    { x: 6.8, y: 33.4 },
    { x: 10.8, y: 36 },
  ],
];
export const LEFT_RIBS = RIGHT_RIBS.map((arc) => arc.map(mirror));

export interface Vertebra {
  y: number;
  w: number;
  label: string;
}

/** Spinous processes C2..L5 — the bumps you can feel along the spine. */
export const VERTEBRAE: Vertebra[] = [
  ...[-9.4, -7.6, -5.8, -4, -2.1].map((y, i) => ({ y, w: 1.1, label: `C${i + 2}` })),
  { y: 0, w: 1.7, label: 'C7' },
  ...Array.from({ length: 12 }, (_, i) => ({ y: 2.4 + i * 2.45, w: 1.4, label: `T${i + 1}` })),
  ...Array.from({ length: 5 }, (_, i) => ({ y: 32.6 + i * 3.25, w: 1.9, label: `L${i + 1}` })),
];

/** Bounds of everything drawn (head, arms, torso). */
export const DRAW_BOUNDS = { minX: -30, maxX: 30, minY: -33, maxY: 66.5 };

/** The area the target dot may occupy. */
export const MASSAGE_MIN_Y = -11.5;
export const MASSAGE_MAX_Y = 62;

export function torsoHalfWidth(y: number): number {
  const pts = RIGHT_OUTLINE;
  if (y <= pts[0].y) return pts[0].x;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (y <= b.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return pts[pts.length - 1].x;
}

/** Keep a point on the massageable part of the back (slides along the edges). */
export function clampToBody(p: Vec, margin = 0.6): Vec {
  const y = clamp(p.y, MASSAGE_MIN_Y, MASSAGE_MAX_Y);
  const hw = Math.max(0, torsoHalfWidth(y) - margin);
  return { x: clamp(p.x, -hw, hw), y };
}

export function isOnBody(p: Vec): boolean {
  return p.y >= MASSAGE_MIN_Y && p.y <= MASSAGE_MAX_Y && Math.abs(p.x) <= torsoHalfWidth(p.y);
}

export type LandmarkId =
  | 'neck_base'
  | 'scap_l'
  | 'scap_r'
  | 'trap_l'
  | 'trap_r'
  | 'mid_l'
  | 'mid_r'
  | 'low_l'
  | 'low_r'
  | 'sacrum';

export interface Landmark {
  id: LandmarkId;
  pos: Vec;
  name: string;
  /** How the giver finds it on a real body. */
  find: string;
}

export const LANDMARKS: Record<LandmarkId, Landmark> = {
  neck_base: {
    id: 'neck_base',
    pos: { x: 0, y: 0 },
    name: 'Base of the neck',
    find: 'The bony bump where neck meets back (C7).',
  },
  scap_l: {
    id: 'scap_l',
    pos: { x: -12, y: 10 },
    name: 'Left shoulder blade',
    find: 'Middle of the flat bone on their left upper back.',
  },
  scap_r: {
    id: 'scap_r',
    pos: { x: 12, y: 10 },
    name: 'Right shoulder blade',
    find: 'Middle of the flat bone on their right upper back.',
  },
  trap_l: {
    id: 'trap_l',
    pos: { x: -13, y: 1 },
    name: 'Top of left shoulder',
    find: 'The muscle ridge halfway between neck and shoulder tip.',
  },
  trap_r: {
    id: 'trap_r',
    pos: { x: 13, y: 1 },
    name: 'Top of right shoulder',
    find: 'The muscle ridge halfway between neck and shoulder tip.',
  },
  mid_l: {
    id: 'mid_l',
    pos: { x: -4.5, y: 24 },
    name: 'Left mid back',
    find: 'Two fingers left of the spine, level with the bottom of the shoulder blades.',
  },
  mid_r: {
    id: 'mid_r',
    pos: { x: 4.5, y: 24 },
    name: 'Right mid back',
    find: 'Two fingers right of the spine, level with the bottom of the shoulder blades.',
  },
  low_l: {
    id: 'low_l',
    pos: { x: -6, y: 41 },
    name: 'Left lower back',
    find: 'A hand width above the top of the left hip bone, beside the spine.',
  },
  low_r: {
    id: 'low_r',
    pos: { x: 6, y: 41 },
    name: 'Right lower back',
    find: 'A hand width above the top of the right hip bone, beside the spine.',
  },
  sacrum: {
    id: 'sacrum',
    pos: { x: 0, y: 54 },
    name: 'Sacrum',
    find: 'The flat triangular bone just above the tailbone.',
  },
};

/** Order in which the giver is asked to touch landmarks: spread out first, then fill in. */
export const LANDMARK_SEQUENCE: LandmarkId[] = [
  'scap_l',
  'scap_r',
  'low_l',
  'low_r',
  'neck_base',
  'mid_r',
  'trap_l',
  'mid_l',
  'trap_r',
  'sacrum',
];
