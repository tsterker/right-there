/**
 * Nudge mode: the receiver drags anywhere on the phone and the target moves
 * like a trackpad cursor. Slow drags move precisely, quick swipes travel far
 * (pointer ballistics). Sensitivity comes from the setup swipes and is
 * auto-tuned over time from overshoot/undershoot patterns.
 */
import { screenToBody, type Orientation } from './calibration.ts';
import { angleBetween, apply, clamp, len, sub, type Vec } from './geometry.ts';

/** CSS pixels per physical centimetre on typical phones (≈160 CSS px per inch). */
export const PX_PER_CM = 63;

const GAIN_SLOW = 1.6;
const GAIN_FAST = 6.5;
const SPEED_SLOW = 3; // finger cm/s
const SPEED_FAST = 28;

/** Body-cm moved per finger-cm at a given finger speed (cm/s). */
export function ballisticGain(speedCmPerS: number): number {
  const t = clamp((speedCmPerS - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW), 0, 1);
  const s = t * t * (3 - 2 * t);
  return GAIN_SLOW + (GAIN_FAST - GAIN_SLOW) * s;
}

export interface Sample {
  /** Screen position in CSS px. */
  x: number;
  y: number;
  /** Timestamp in ms. */
  t: number;
}

const SPEED_SMOOTHING = 0.45;

/** Body distance (cm) a recorded stroke travels at sensitivity 1. */
export function strokeTravel(samples: Sample[]): number {
  let speed = 0;
  let travel = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const cm = Math.hypot(b.x - a.x, b.y - a.y) / PX_PER_CM;
    const dt = (b.t - a.t) / 1000;
    if (dt > 0) speed = speed === 0 ? cm / dt : speed + SPEED_SMOOTHING * (cm / dt - speed);
    travel += cm * ballisticGain(speed);
  }
  return travel;
}

/** Typical distances the setup swipes stand for. */
const NECK_TO_LOWER_BACK_CM = 46;
const SIDE_TO_SIDE_CM = 32;

/** Sensitivity that makes the two setup swipes cover a whole back. */
export function sensitivityFromSwipes(down: Sample[], right: Sample[]): number {
  const d = strokeTravel(down);
  const r = strokeTravel(right);
  if (d <= 0 || r <= 0) return 1;
  return clamp(Math.sqrt((NECK_TO_LOWER_BACK_CM / d) * (SIDE_TO_SIDE_CM / r)), 0.5, 2.5);
}

/** Turns pointer movement into body-space target movement. */
export class Nudger {
  private last: Sample | null = null;
  private speed = 0;

  constructor(
    public orientation: Orientation,
    public sensitivity: number,
    public tune: number,
  ) {}

  begin(s: Sample): void {
    this.last = s;
    this.speed = 0;
  }

  /** Body delta (cm) for this pointer move. */
  move(s: Sample): Vec {
    const prev = this.last;
    this.last = s;
    if (!prev) return { x: 0, y: 0 };
    const dx = (s.x - prev.x) / PX_PER_CM;
    const dy = (s.y - prev.y) / PX_PER_CM;
    const cm = Math.hypot(dx, dy);
    const dt = (s.t - prev.t) / 1000;
    if (dt > 0) {
      const v = cm / dt;
      this.speed = this.speed === 0 ? v : this.speed + SPEED_SMOOTHING * (v - this.speed);
    }
    const gain = ballisticGain(this.speed) * this.sensitivity * this.tune;
    const body = apply(screenToBody(this.orientation), { x: dx, y: dy });
    return { x: body.x * gain, y: body.y * gain };
  }

  end(): void {
    this.last = null;
  }
}

export interface Stroke {
  /** Net body displacement of the stroke (cm). */
  d: Vec;
  /** Start time (ms). */
  at: number;
  /** Duration (ms). */
  dur: number;
}

export const TUNE_MIN = 0.5;
export const TUNE_MAX = 2;

export interface TuneResult {
  tune: number;
  reason: 'overshoot' | 'undershoot' | null;
}

/**
 * Looks at the most recent strokes:
 * - overshoot: a stroke is quickly followed by a smaller one going back → too sensitive
 * - undershoot: three quick strokes in the same direction ("clutching") → not sensitive enough
 * The caller should clear its stroke history after a non-null reason.
 */
export function tuneFromStrokes(strokes: Stroke[], tune: number): TuneResult {
  const n = strokes.length;
  if (n >= 2) {
    const p = strokes[n - 2];
    const s = strokes[n - 1];
    const gap = s.at - (p.at + p.dur);
    if (gap < 2500 && len(p.d) > 3 && len(s.d) > 0.5 && len(s.d) < 0.7 * len(p.d) && angleBetween(p.d, s.d) > 140) {
      return { tune: clamp(tune * 0.94, TUNE_MIN, TUNE_MAX), reason: 'overshoot' };
    }
  }
  if (n >= 3) {
    const [a, b, c] = strokes.slice(-3);
    const quick = b.at - (a.at + a.dur) < 1800 && c.at - (b.at + b.dur) < 1800;
    const long = [a, b, c].every((s) => len(s.d) > 1);
    const aligned = angleBetween(a.d, b.d) < 35 && angleBetween(b.d, c.d) < 35;
    if (quick && long && aligned) {
      return { tune: clamp(tune * 1.06, TUNE_MIN, TUNE_MAX), reason: 'undershoot' };
    }
  }
  return { tune, reason: null };
}

/**
 * Words for a nudge (body cm), relative to the receiver's body. Null if negligible.
 * `bothSidesAt`: working both sides, with the spot at this x; sideways then means apart or together.
 */
export function describeNudge(d: Vec, bothSidesAt?: number): string | null {
  const l = len(d);
  if (l < 1.2) return null;
  const amount = l < 3.5 ? 'a little ' : l > 12 ? 'a lot ' : '';
  const vert = d.y < 0 ? 'higher' : 'lower';
  const horiz =
    bothSidesAt === undefined ? (d.x < 0 ? 'to their left' : 'to their right') : d.x * bothSidesAt > 0 ? 'further apart' : 'closer together';
  const ay = Math.abs(d.y);
  const ax = Math.abs(d.x);
  let text: string;
  if (ay > ax * 2) text = `${amount}${vert}`;
  else if (ax > ay * 2) text = `${amount}${horiz}`;
  else text = `${amount}${vert} and ${horiz}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface RecentMove {
  /** Which way the spot is going (body cm; its length means little). */
  d: Vec;
  /** How fast it's moving right now (cm/s). */
  speed: number;
}

/**
 * Which way the spot is going, from stroke samples (oldest first). The
 * direction runs back from the latest sample to one at least `minCm` away, so
 * a slow drag's jitter averages out, but no further back than `maxMs`, so a
 * change of direction shows within about a centimetre or so. The speed only looks
 * at the last `speedMs`. Null before there's a move.
 */
export function recentMove(samples: { p: Vec; t: number }[], minCm = 1.2, maxMs = 800, speedMs = 200): RecentMove | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  let base: { p: Vec; t: number } | null = null;
  for (let i = samples.length - 2; i >= 0; i--) {
    const q = samples[i];
    if (last.t - q.t > maxMs) break;
    base = q;
    if (len(sub(last.p, q.p)) >= minCm) break;
  }
  // Sparse updates: the previous sample, however old.
  base ??= samples[samples.length - 2] ?? null;
  if (!base) return null;
  const d = sub(last.p, base.p);
  if (len(d) < 0.4) return null;
  const recent = samples.find((q) => last.t - q.t <= speedMs) ?? base;
  const dt = last.t - recent.t;
  const speed = recent === last ? 0 : dt > 0 ? (len(sub(last.p, recent.p)) / dt) * 1000 : 0;
  return { d, speed };
}
