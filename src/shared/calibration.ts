/**
 * Calibration: how the receiver's phone and sense of touch map onto the back.
 *
 * 1. Orientation — two swipes ("neck → lower back", "left → right") tell us
 *    how the phone lies next to the receiver, including mirror-image
 *    mental models. Used by nudge mode and to draw the receiver's map aligned
 *    with their body.
 * 2. Correction — pairs of (where the receiver pointed, where the touch really
 *    was) fit a map-mode correction: centred affine plus a smooth local
 *    residual field. More pairs over time → better precision.
 */
import { clampToBody } from './body.ts';
import {
  IDENTITY,
  MIRROR_X,
  apply,
  det,
  len,
  mul,
  normalize,
  rotation,
  transpose,
  type Mat2,
  type Vec,
} from './geometry.ts';

export interface Orientation {
  /** Clockwise rotation (degrees) of the upright back as drawn on the receiver's screen. */
  angle: number;
  /** Receiver's mental model is a mirror image (left and right swapped). */
  mirrored: boolean;
}

export const DEFAULT_ORIENTATION: Orientation = { angle: 0, mirrored: false };

/** Body vector → screen vector for this orientation. */
export function bodyToScreen(o: Orientation): Mat2 {
  const r = rotation(o.angle);
  return o.mirrored ? mul(r, MIRROR_X) : r;
}

/** Screen vector → body vector (orthogonal, so the inverse is the transpose). */
export function screenToBody(o: Orientation): Mat2 {
  return transpose(bodyToScreen(o));
}

export type OrientationError = 'too-short' | 'same-direction' | 'not-straight';

export type OrientationResult =
  | { ok: true; orientation: Orientation; skewDeg: number }
  | { ok: false; error: OrientationError; message: string };

const snapAxis = (v: Vec): Vec => {
  if (Math.abs(v.x) >= Math.abs(v.y)) return { x: Math.sign(v.x) || 1, y: 0 };
  return { x: 0, y: Math.sign(v.y) || 1 };
};

const axisSkew = (v: Vec): number => {
  const n = normalize(v);
  return (Math.acos(Math.min(1, Math.max(Math.abs(n.x), Math.abs(n.y)))) * 180) / Math.PI;
};

/**
 * @param down screen delta (px) of the swipe "from your neck toward your lower back"
 * @param right screen delta (px) of the swipe "from your left side to your right side"
 */
export function orientationFromSwipes(down: Vec, right: Vec, minLengthPx = 60): OrientationResult {
  if (len(down) < minLengthPx || len(right) < minLengthPx) {
    return { ok: false, error: 'too-short', message: 'That swipe was a bit short — try a longer one.' };
  }
  const skew = Math.max(axisSkew(down), axisSkew(right));
  if (skew > 35) {
    return {
      ok: false,
      error: 'not-straight',
      message: 'Hard to tell the direction — swipe in a straighter line, along the phone edges.',
    };
  }
  const col2 = snapAxis(down); // where body +y (feet) points on screen
  const col1 = snapAxis(right); // where body +x (their right) points on screen
  if (col1.x * col2.x + col1.y * col2.y !== 0) {
    return {
      ok: false,
      error: 'same-direction',
      message: 'Both swipes went along the same line. The second one should cross the first.',
    };
  }
  const m: Mat2 = [col1.x, col2.x, col1.y, col2.y];
  const mirrored = det(m) < 0;
  const ref = mirrored ? { x: -col1.x, y: -col1.y } : col1;
  const angle = (((Math.round((Math.atan2(ref.y, ref.x) * 180) / Math.PI) % 360) + 360) % 360) as number;
  return { ok: true, orientation: { angle, mirrored }, skewDeg: Math.round(skew) };
}

/** Human description of where the top edge of the phone points, for the receiver ("you") or the giver ("they"). */
export function describeOrientation(o: Orientation, who: 'you' | 'they' = 'you'): string {
  // The screen's "up" direction (0, -1) expressed in body terms.
  const up = apply(screenToBody(o), { x: 0, y: -1 });
  const my = who === 'you' ? 'your' : 'their';
  const dir =
    Math.abs(up.y) >= Math.abs(up.x)
      ? up.y < 0
        ? 'head'
        : 'feet'
      : up.x > 0
        ? 'right side'
        : 'left side';
  const phone = who === 'you' ? 'the phone' : 'their phone';
  return `top of ${phone} points toward ${my} ${dir}${o.mirrored ? ' (mirror-image mapping)' : ''}`;
}

// ---------------------------------------------------------------------------
// Map-mode correction

/** One "right there" in map mode, paired with where the giver's hands really were. */
export interface CalibPoint {
  /** Where the receiver pointed on their map (body cm, orientation already applied). */
  raw: Vec;
  /** Where the hands were (body cm). */
  truth: Vec;
  at: number;
}

export interface CorrectionModel {
  n: number;
  center: Vec;
  a: Mat2;
  t: Vec;
  kernel: { p: Vec; r: Vec; w: number }[];
}

export const MAX_CALIB_POINTS = 40;
const RIDGE_LINEAR = 300;
const KERNEL_SIGMA = 7;
/** Higher = the local correction needs more agreeing points before it kicks in (robust to noisy taps). */
const KERNEL_PRIOR = 3;
const RECENCY_HALF_LIFE = 12;

export const IDENTITY_MODEL: CorrectionModel = {
  n: 0,
  center: { x: 0, y: 25 },
  a: IDENTITY,
  t: { x: 0, y: 0 },
  kernel: [],
};

function weights(points: CalibPoint[]): number[] {
  const order = points.map((p, i) => ({ i, at: p.at })).sort((a, b) => b.at - a.at);
  const w = new Array<number>(points.length).fill(0);
  order.forEach(({ i }, rank) => {
    w[i] = 0.5 ** (rank / RECENCY_HALF_LIFE);
  });
  return w;
}

/** Solve a 3x3 linear system with Gaussian elimination (partial pivoting). */
function solve3(m: number[][], b: number[]): number[] | null {
  const a = m.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

function affinePart(model: Pick<CorrectionModel, 'center' | 'a' | 't'>, p: Vec): Vec {
  const d = apply(model.a, { x: p.x - model.center.x, y: p.y - model.center.y });
  return { x: model.center.x + d.x + model.t.x, y: model.center.y + d.y + model.t.y };
}

/** Keep the linear part sane: bounded shear/scale, no flips. */
function tame(a: Mat2): Mat2 {
  let k = 1;
  for (let i = 0; i < 12; i++) {
    const m: Mat2 = [1 + (a[0] - 1) * k, a[1] * k, a[2] * k, 1 + (a[3] - 1) * k];
    const maxDev = Math.max(Math.abs(m[0] - 1), Math.abs(m[1]), Math.abs(m[2]), Math.abs(m[3] - 1));
    if (det(m) > 0.35 && maxDev < 0.8) return m;
    k *= 0.7;
  }
  return IDENTITY;
}

export function fitCorrection(input: CalibPoint[]): CorrectionModel {
  const points = input.slice(-MAX_CALIB_POINTS);
  if (points.length === 0) return IDENTITY_MODEL;
  const w = weights(points);
  const wSum = w.reduce((s, v) => s + v, 0);
  const center = {
    x: points.reduce((s, p, i) => s + p.raw.x * w[i], 0) / wSum,
    y: points.reduce((s, p, i) => s + p.raw.y * w[i], 0) / wSum,
  };

  // Ridge regression per output dimension, prior: identity with zero offset.
  // Features: [dx, dy, 1] with d = raw - center.
  const xtx = [
    [RIDGE_LINEAR, 0, 0],
    [0, RIDGE_LINEAR, 0],
    [0, 0, 1e-6],
  ];
  const xty = [
    [RIDGE_LINEAR, 0, 0], // prior contribution for output x: w0 = [1, 0, 0]
    [0, RIDGE_LINEAR, 0], // prior contribution for output y: w0 = [0, 1, 0]
  ];
  points.forEach((p, i) => {
    const f = [p.raw.x - center.x, p.raw.y - center.y, 1];
    const tx = p.truth.x - center.x;
    const ty = p.truth.y - center.y;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) xtx[r][c] += w[i] * f[r] * f[c];
      xty[0][r] += w[i] * f[r] * tx;
      xty[1][r] += w[i] * f[r] * ty;
    }
  });
  const sx = solve3(xtx, xty[0]);
  const sy = solve3(xtx, xty[1]);
  const a = sx && sy ? tame([sx[0], sx[1], sy[0], sy[1]]) : IDENTITY;
  // Re-derive the offset for the tamed linear part (weighted mean residual).
  let tx = 0;
  let ty = 0;
  points.forEach((p, i) => {
    const d = apply(a, { x: p.raw.x - center.x, y: p.raw.y - center.y });
    tx += w[i] * (p.truth.x - center.x - d.x);
    ty += w[i] * (p.truth.y - center.y - d.y);
  });
  const base = { center, a, t: { x: tx / wSum, y: ty / wSum } };
  const kernel = points.map((p, i) => {
    const f = affinePart(base, p.raw);
    return { p: p.raw, r: { x: p.truth.x - f.x, y: p.truth.y - f.y }, w: w[i] };
  });
  return { n: points.length, ...base, kernel };
}

export function correct(model: CorrectionModel, p: Vec): Vec {
  if (model.n === 0) return clampToBody(p);
  const f = affinePart(model, p);
  let kx = 0;
  let ky = 0;
  let ks = 0;
  for (const k of model.kernel) {
    const d2 = (p.x - k.p.x) ** 2 + (p.y - k.p.y) ** 2;
    const g = k.w * Math.exp(-d2 / (2 * KERNEL_SIGMA * KERNEL_SIGMA));
    kx += g * k.r.x;
    ky += g * k.r.y;
    ks += g;
  }
  const denom = KERNEL_PRIOR + ks;
  return clampToBody({ x: f.x + kx / denom, y: f.y + ky / denom });
}
