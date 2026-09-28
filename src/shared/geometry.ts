/** Small 2D helpers. Body coordinates are centimetres, screen coordinates CSS pixels. */

export interface Vec {
  x: number;
  y: number;
}

/** Row-major 2x2 matrix: [a, b, c, d] maps (x, y) to (a*x + b*y, c*x + d*y). */
export type Mat2 = readonly [number, number, number, number];

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (p: Vec, q: Vec): Vec => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p: Vec, q: Vec): Vec => ({ x: p.x - q.x, y: p.y - q.y });
export const scale = (p: Vec, k: number): Vec => ({ x: p.x * k, y: p.y * k });
export const len = (p: Vec): number => Math.hypot(p.x, p.y);
export const dist = (p: Vec, q: Vec): number => Math.hypot(p.x - q.x, p.y - q.y);
export const dot = (p: Vec, q: Vec): number => p.x * q.x + p.y * q.y;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const normalize = (p: Vec): Vec => {
  const l = len(p);
  return l === 0 ? { x: 0, y: 0 } : { x: p.x / l, y: p.y / l };
};

/** Angle between two vectors in degrees (0..180). */
export const angleBetween = (p: Vec, q: Vec): number => {
  const l = len(p) * len(q);
  if (l === 0) return 0;
  return (Math.acos(clamp(dot(p, q) / l, -1, 1)) * 180) / Math.PI;
};

export const apply = (m: Mat2, p: Vec): Vec => ({ x: m[0] * p.x + m[1] * p.y, y: m[2] * p.x + m[3] * p.y });
export const mul = (m: Mat2, n: Mat2): Mat2 => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
];
export const transpose = (m: Mat2): Mat2 => [m[0], m[2], m[1], m[3]];
export const det = (m: Mat2): number => m[0] * m[3] - m[1] * m[2];

/**
 * Rotation by `deg` degrees. In screen space (y pointing down) positive
 * angles turn clockwise, which matches SVG's rotate().
 */
export const rotation = (deg: number): Mat2 => {
  const r = (deg * Math.PI) / 180;
  const c = round6(Math.cos(r));
  const s = round6(Math.sin(r));
  return [c, -s, s, c];
};

export const MIRROR_X: Mat2 = [-1, 0, 0, 1];
export const IDENTITY: Mat2 = [1, 0, 0, 1];

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export const round = (v: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export const roundVec = (p: Vec, digits = 2): Vec => ({ x: round(p.x, digits), y: round(p.y, digits) });

export const isFiniteVec = (p: unknown): p is Vec =>
  typeof p === 'object' &&
  p !== null &&
  Number.isFinite((p as Vec).x) &&
  Number.isFinite((p as Vec).y);

/** Smooth closed/open path through points (Catmull-Rom converted to cubic Béziers). */
export function smoothPath(points: Vec[], closed: boolean, tension = 1): string {
  const n = points.length;
  if (n < 2) return '';
  const at = (i: number): Vec => {
    if (closed) return points[((i % n) + n) % n];
    return points[clamp(i, 0, n - 1)];
  };
  const f = (v: number) => round(v, 2);
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tension, y: p1.y + ((p2.y - p0.y) / 6) * tension };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tension, y: p2.y - ((p3.y - p1.y) / 6) * tension };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return closed ? `${d} Z` : d;
}
