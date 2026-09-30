/**
 * The spot's smudge: a soft mass pulled along behind the spot on a spring.
 * When the spot moves, the mass trails behind, so the blob stretches from
 * where it was toward where it is, then catches up and rounds again.
 */
import { len, sub, type Vec } from '../../shared/geometry';

export interface Smudge {
  /** Where the blob's mass is (the spot itself is the head). */
  mass: Vec;
  v: Vec;
}

export interface Spring {
  stiffness: number;
  damping: number;
}

/** Settles in about a second with a hint of give; trails ~0.33 s (damping / stiffness) behind a moving spot. */
export const SPRING: Spring = { stiffness: 30, damping: 10 };

export const restingAt = (p: Vec): Smudge => ({ mass: { ...p }, v: { x: 0, y: 0 } });

/** Advance by `dt` seconds toward `head`; the mass never trails more than `leash` behind. */
export function stepSmudge(s: Smudge, head: Vec, dt: number, leash: number, { stiffness: k, damping: c }: Spring = SPRING): Smudge {
  const ax = k * (head.x - s.mass.x) - c * s.v.x;
  const ay = k * (head.y - s.mass.y) - c * s.v.y;
  const v = { x: s.v.x + ax * dt, y: s.v.y + ay * dt };
  let mass = { x: s.mass.x + v.x * dt, y: s.mass.y + v.y * dt };
  const back = sub(mass, head);
  const d = len(back);
  if (d > leash) mass = { x: head.x + (back.x * leash) / d, y: head.y + (back.y * leash) / d };
  return { mass, v };
}

/** Still moving (worth another frame)? */
export const stirring = (s: Smudge, head: Vec) => len(sub(head, s.mass)) + len(s.v) > 0.02;
