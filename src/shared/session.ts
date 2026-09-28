/**
 * Shared session state and its reducer: where the receiver wants the hands.
 *
 * The hosting device sequences every action and applies this reducer; the
 * other device applies the same actions in the same order, so both copies
 * stay equal. A (re)connecting device simply receives a snapshot.
 */
import { clampToBody } from './body.ts';
import { isFiniteVec, roundVec, type Vec } from './geometry.ts';

/** A = receives the massage (touch pad). B = gives the massage (back map). */
export type Role = 'A' | 'B';
export const otherRole = (r: Role): Role => (r === 'A' ? 'B' : 'A');
export const ROLE_NAME: Record<Role, string> = { A: 'Receiver', B: 'Giver' };

export type InputMode = 'nudge' | 'map';
export type TargetSource = 'nudge' | 'map' | 'anchor';

export interface Target {
  pos: Vec;
  /** Receiver's finger is down and moving the spot right now. */
  active: boolean;
  source: TargetSource;
  /** Where the current nudge stroke started (for direction arrows). */
  from: Vec | null;
  by: Role;
  at: number;
}

export interface SessionState {
  v: 2;
  code: string;
  createdAt: number;
  members: Record<Role, { connected: boolean; joined: boolean }>;
  target: Target | null;
  /** The receiver's last "right there" (double-tap). */
  good: { id: string; at: number; pos: Vec | null } | null;
  nextId: number;
}

export type Action =
  | { type: 'presence'; role: Role; connected: boolean }
  | {
      type: 'target';
      pos: Vec;
      active: boolean;
      source: TargetSource;
      from?: Vec | null;
      /** Giver confirms their hands are on the spot the receiver just called "right there": a calibration pair. */
      learn?: boolean;
    }
  | { type: 'good' };

export type ActionType = Action['type'];

export interface Meta {
  from: Role | 'server';
  at: number;
}

export function initialState(code: string, now: number): SessionState {
  return {
    v: 2,
    code,
    createdAt: now,
    members: { A: { connected: false, joined: false }, B: { connected: false, joined: false } },
    target: null,
    good: null,
    nextId: 1,
  };
}

export function reduce(s: SessionState, action: Action, meta: Meta): SessionState {
  const at = meta.at;
  const by: Role = meta.from === 'server' ? 'A' : meta.from;
  switch (action.type) {
    case 'presence': {
      const prev = s.members[action.role];
      return {
        ...s,
        members: { ...s.members, [action.role]: { connected: action.connected, joined: prev.joined || action.connected } },
      };
    }
    case 'target':
      return {
        ...s,
        target: { pos: clampToBody(action.pos), active: action.active, source: action.source, from: action.from ?? null, by, at },
      };
    case 'good':
      return { ...s, nextId: s.nextId + 1, good: { id: `g${s.nextId}`, at, pos: s.target?.pos ?? null } };
  }
}

// ---------------------------------------------------------------------------
// Validation: everything that arrives over the network goes through here.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const saneVec = (v: unknown): Vec | null =>
  isFiniteVec(v) && Math.abs(v.x) < 200 && Math.abs(v.y) < 200 ? roundVec(v) : null;

export function sanitizeAction(raw: unknown, from: Role): Action | null {
  if (!isObj(raw) || typeof raw.type !== 'string') return null;
  switch (raw.type) {
    case 'target': {
      const pos = saneVec(raw.pos);
      const source = raw.source;
      // The receiver points; the giver can only say where their hands are.
      const allowed: TargetSource[] = from === 'A' ? ['nudge', 'map'] : ['anchor'];
      if (!pos || typeof source !== 'string' || !allowed.includes(source as TargetSource)) return null;
      const action: Action = { type: 'target', pos, active: raw.active === true, source: source as TargetSource, from: saneVec(raw.from) };
      if (source === 'anchor' && raw.learn === true) action.learn = true;
      return action;
    }
    case 'good':
      return from === 'A' ? { type: 'good' } : null;
    default:
      return null;
  }
}

/** High-frequency actions that should not be queued while offline. */
export const isEphemeral = (a: Action) => a.type === 'target' && a.active;
