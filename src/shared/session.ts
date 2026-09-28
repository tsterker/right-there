/**
 * Shared session state and its reducer.
 *
 * The server sequences every action and applies this reducer; both phones
 * apply the same actions in the same order, so all three copies stay equal.
 * A (re)connecting phone simply receives a snapshot.
 */
import { clampToBody, LANDMARKS, type LandmarkId } from './body.ts';
import type { Orientation } from './calibration.ts';
import { clamp, isFiniteVec, roundVec, type Vec } from './geometry.ts';
import { classify } from './regions.ts';
import { LIKEABLE, SYMPTOMS, type SymptomKind, type TechniqueId } from './techniques.ts';

/** A = receives the massage (touch pad). B = gives the massage (back map). */
export type Role = 'A' | 'B';
export const otherRole = (r: Role): Role => (r === 'A' ? 'B' : 'A');
export const ROLE_NAME: Record<Role, string> = { A: 'Receiver', B: 'Giver' };

export type Phase = 'lobby' | 'checkin' | 'setup' | 'live' | 'summary';
export type InputMode = 'nudge' | 'map';
export type TargetSource = 'nudge' | 'map' | 'anchor' | 'plan';
export type FeedbackKind = 'firmer' | 'softer' | 'good' | 'ouch' | 'slower' | 'faster' | 'change';
export type SetupStep = 'intro' | 'swipe-down' | 'swipe-right' | 'practice' | 'done';

export interface Marker {
  id: string;
  kind: SymptomKind;
  pos: Vec;
  by: Role;
  at: number;
}

export interface Target {
  pos: Vec;
  /** Receiver's finger is down and moving the target right now. */
  active: boolean;
  source: TargetSource;
  /** Where the current nudge stroke started (for direction arrows). */
  from: Vec | null;
  by: Role;
  at: number;
}

export interface FeedbackEvent {
  id: string;
  kind: FeedbackKind;
  at: number;
  pos: Vec | null;
  /** Pressure level after this feedback. */
  pressure: number;
}

export interface Prefs {
  /** Preferred starting pressure 1..5. */
  pressure: number;
  durationMin: number | null;
  likes: TechniqueId[];
  notes: string;
}

export interface CalibInfo {
  orientation: Orientation;
  sensitivity: number;
  tune: number;
  mode: InputMode;
  points: number;
  rawErrorCm: number | null;
  errorCm: number | null;
  at: number;
}

export interface Probe {
  id: string;
  landmark: LandmarkId | null;
  truth: Vec;
  at: number;
  /** Where the receiver felt it (uncorrected). */
  answer: Vec | null;
  /** Where the correction model placed that answer (before learning from it). */
  corrected: Vec | null;
  answeredAt: number | null;
}

export interface Timer {
  startedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  endedAt: number | null;
}

export interface SessionState {
  v: 1;
  code: string;
  createdAt: number;
  round: number;
  phase: Phase;
  members: Record<Role, { connected: boolean; joined: boolean }>;
  prefs: Prefs;
  markers: Marker[];
  target: Target | null;
  pressure: number;
  /** -2 (much slower) .. +2 (much faster). */
  tempo: number;
  feedback: FeedbackEvent[];
  calib: CalibInfo | null;
  setupStep: SetupStep;
  probe: Probe | null;
  probes: Probe[];
  timer: Timer;
  /** ms spent per region during the live phase. */
  dwell: Record<string, number>;
  /** ms spent per 3 cm cell ("x,y" cell index) during the live phase. */
  heat: Record<string, number>;
  dwellMark: number | null;
  /** How many times the receiver asked for "something different". */
  change: number;
  nextId: number;
}

export type Action =
  | { type: 'presence'; role: Role; connected: boolean }
  | { type: 'phase'; phase: Exclude<Phase, 'lobby'> }
  | { type: 'prefs'; prefs: Partial<Prefs> }
  | { type: 'marker.add'; kind: SymptomKind; pos: Vec }
  | { type: 'marker.remove'; id: string }
  | { type: 'markers.set'; markers: { kind: SymptomKind; pos: Vec }[] }
  | {
      type: 'target';
      pos: Vec;
      active: boolean;
      source: TargetSource;
      from?: Vec | null;
      /** Giver confirms their hands are on the spot the receiver just loved: a calibration pair. */
      learn?: boolean;
    }
  | { type: 'feedback'; kind: FeedbackKind }
  | { type: 'pause'; paused: boolean }
  | { type: 'calib'; info: Omit<CalibInfo, 'at'> }
  | { type: 'setup.step'; step: SetupStep }
  | { type: 'probe.start'; landmark: LandmarkId | null; truth: Vec }
  | { type: 'probe.answer'; id: string; answer: Vec; corrected: Vec }
  | { type: 'probe.cancel' }
  /** `round` guards against a stale replay (e.g. queued while offline) ending a newer round. */
  | { type: 'end'; round?: number }
  | { type: 'restart'; round?: number };

export type ActionType = Action['type'];

export interface Meta {
  from: Role | 'server';
  at: number;
}

export const DEFAULT_PREFS: Prefs = { pressure: 3, durationMin: 20, likes: [], notes: '' };

export const HEAT_CELL_CM = 3;
export const heatKey = (p: Vec): string => `${Math.floor(p.x / HEAT_CELL_CM)},${Math.floor(p.y / HEAT_CELL_CM)}`;

export function initialState(code: string, now: number): SessionState {
  return {
    v: 1,
    code,
    createdAt: now,
    round: 1,
    phase: 'lobby',
    members: { A: { connected: false, joined: false }, B: { connected: false, joined: false } },
    prefs: { ...DEFAULT_PREFS },
    markers: [],
    target: null,
    pressure: DEFAULT_PREFS.pressure,
    tempo: 0,
    feedback: [],
    calib: null,
    setupStep: 'intro',
    probe: null,
    probes: [],
    timer: { startedAt: null, pausedAt: null, pausedMs: 0, endedAt: null },
    dwell: {},
    heat: {},
    dwellMark: null,
    change: 0,
    nextId: 1,
  };
}

export function elapsedMs(s: SessionState, now: number): number {
  const t = s.timer;
  if (t.startedAt == null) return 0;
  const end = t.endedAt ?? now;
  const paused = t.pausedMs + (t.pausedAt != null ? Math.max(0, end - t.pausedAt) : 0);
  return Math.max(0, end - t.startedAt - paused);
}

export const isPaused = (s: SessionState) => s.timer.pausedAt != null;

/** Attribute the time since the last mark to the region the target was in. */
function accrue(s: SessionState, at: number): SessionState {
  if (s.phase !== 'live' || s.timer.pausedAt != null || s.dwellMark == null) return s;
  const dt = Math.max(0, at - s.dwellMark);
  if (!s.target || dt === 0) return { ...s, dwellMark: at };
  const region = classify(s.target.pos);
  const cell = heatKey(s.target.pos);
  return {
    ...s,
    dwellMark: at,
    dwell: { ...s.dwell, [region]: (s.dwell[region] ?? 0) + dt },
    heat: { ...s.heat, [cell]: (s.heat[cell] ?? 0) + dt },
  };
}

function pauseTimer(t: Timer, at: number): Timer {
  return t.pausedAt == null && t.startedAt != null && t.endedAt == null ? { ...t, pausedAt: at } : t;
}

function resumeTimer(t: Timer, at: number): Timer {
  return t.pausedAt == null ? t : { ...t, pausedMs: t.pausedMs + Math.max(0, at - t.pausedAt), pausedAt: null };
}

function enterPhase(s: SessionState, phase: Phase, at: number): SessionState {
  if (phase === s.phase || phase === 'lobby') return s;
  if (phase === 'summary') return endSession(s, at);
  if (s.phase === 'summary') return s; // use "restart" to leave the summary
  if (phase === 'live') {
    const timer = s.timer.startedAt == null ? { ...s.timer, startedAt: at } : resumeTimer(s.timer, at);
    return { ...s, phase, timer, dwellMark: at, probe: null };
  }
  // Leaving the live phase (e.g. to recalibrate) pauses the clock.
  const timer = s.phase === 'live' ? pauseTimer(s.timer, at) : s.timer;
  return { ...s, phase, timer };
}

function endSession(s: SessionState, at: number): SessionState {
  if (s.phase === 'summary') return s;
  const t = resumeTimer(s.timer, at);
  return {
    ...s,
    phase: 'summary',
    probe: null,
    dwellMark: null,
    timer: { ...t, startedAt: t.startedAt ?? at, endedAt: at },
  };
}

function restart(s: SessionState): SessionState {
  const fresh = initialState(s.code, s.createdAt);
  return {
    ...fresh,
    round: s.round + 1,
    phase: 'checkin',
    members: s.members,
    prefs: s.prefs,
    markers: s.markers,
    calib: s.calib,
    pressure: s.prefs.pressure,
    nextId: s.nextId,
  };
}

export function reduce(state: SessionState, action: Action, meta: Meta): SessionState {
  const at = meta.at;
  const by: Role = meta.from === 'server' ? 'A' : meta.from;
  let s = accrue(state, at);

  switch (action.type) {
    case 'presence': {
      const prev = s.members[action.role];
      const members = {
        ...s.members,
        [action.role]: { connected: action.connected, joined: prev.joined || action.connected },
      };
      s = { ...s, members };
      if (s.phase === 'lobby' && members.A.connected && members.B.connected) s = { ...s, phase: 'checkin' };
      return s;
    }
    case 'phase':
      return enterPhase(s, action.phase, at);
    case 'prefs': {
      const prefs = { ...s.prefs, ...action.prefs };
      const pressure = action.prefs.pressure != null && s.phase !== 'live' ? prefs.pressure : s.pressure;
      return { ...s, prefs, pressure };
    }
    case 'marker.add': {
      const marker: Marker = { id: `m${s.nextId}`, kind: action.kind, pos: clampToBody(action.pos, 0), by, at };
      return { ...s, nextId: s.nextId + 1, markers: [...s.markers, marker].slice(-60) };
    }
    case 'marker.remove':
      return { ...s, markers: s.markers.filter((m) => m.id !== action.id) };
    case 'markers.set': {
      const markers = action.markers.slice(0, 60).map((m, i) => ({
        id: `m${s.nextId + i}`,
        kind: m.kind,
        pos: clampToBody(m.pos, 0),
        by,
        at,
      }));
      return { ...s, nextId: s.nextId + markers.length, markers };
    }
    case 'target':
      return {
        ...s,
        target: {
          pos: clampToBody(action.pos),
          active: action.active,
          source: action.source,
          from: action.from ?? null,
          by,
          at,
        },
      };
    case 'feedback': {
      let { pressure, tempo, change } = s;
      switch (action.kind) {
        case 'firmer':
          pressure = Math.min(5, pressure + 1);
          break;
        case 'softer':
        case 'ouch':
          pressure = Math.max(1, pressure - 1);
          break;
        case 'slower':
          tempo = Math.max(-2, tempo - 1);
          break;
        case 'faster':
          tempo = Math.min(2, tempo + 1);
          break;
        case 'change':
          change += 1;
          break;
        case 'good':
          break;
      }
      const event: FeedbackEvent = {
        id: `f${s.nextId}`,
        kind: action.kind,
        at,
        pos: s.target?.pos ?? null,
        pressure,
      };
      return { ...s, pressure, tempo, change, nextId: s.nextId + 1, feedback: [...s.feedback, event].slice(-300) };
    }
    case 'pause': {
      if (action.paused) return { ...s, timer: pauseTimer(s.timer, at) };
      return { ...s, timer: resumeTimer(s.timer, at), dwellMark: s.phase === 'live' ? at : s.dwellMark };
    }
    case 'calib':
      return { ...s, calib: { ...action.info, at } };
    case 'setup.step':
      return { ...s, setupStep: action.step };
    case 'probe.start': {
      const probe: Probe = {
        id: `p${s.nextId}`,
        landmark: action.landmark,
        truth: clampToBody(action.truth, 0),
        at,
        answer: null,
        corrected: null,
        answeredAt: null,
      };
      return { ...s, nextId: s.nextId + 1, probe };
    }
    case 'probe.answer': {
      if (!s.probe || s.probe.id !== action.id || s.probe.answer) return s;
      const done: Probe = { ...s.probe, answer: action.answer, corrected: action.corrected, answeredAt: at };
      return { ...s, probe: done, probes: [...s.probes, done].slice(-30) };
    }
    case 'probe.cancel':
      return { ...s, probe: null };
    case 'end':
      return action.round != null && action.round !== s.round ? s : endSession(s, at);
    case 'restart':
      return action.round != null && action.round !== s.round ? s : restart(s);
  }
}

// ---------------------------------------------------------------------------
// Validation: everything that arrives over the network goes through here.

const PHASES: Exclude<Phase, 'lobby'>[] = ['checkin', 'setup', 'live', 'summary'];
const SOURCES: TargetSource[] = ['nudge', 'map', 'anchor', 'plan'];
const FEEDBACK: FeedbackKind[] = ['firmer', 'softer', 'good', 'ouch', 'slower', 'faster', 'change'];
const STEPS: SetupStep[] = ['intro', 'swipe-down', 'swipe-right', 'practice', 'done'];
const LIKE_IDS = LIKEABLE.map((l) => l.id);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && list.includes(v as T);
const isSymptom = (v: unknown): v is SymptomKind => typeof v === 'string' && v in SYMPTOMS;
const saneVec = (v: unknown): Vec | null =>
  isFiniteVec(v) && Math.abs(v.x) < 200 && Math.abs(v.y) < 200 ? roundVec(v) : null;
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : null;
const numOrNull = (v: unknown, lo: number, hi: number): number | null => (v == null ? null : num(v, lo, hi));

/** Who may send what. Presence is server-only. */
const ONLY_A: ActionType[] = ['prefs', 'feedback', 'calib', 'setup.step', 'probe.answer', 'markers.set'];
const ONLY_B: ActionType[] = ['probe.start'];

export function sanitizeAction(raw: unknown, from: Role): Action | null {
  if (!isObj(raw) || typeof raw.type !== 'string') return null;
  const type = raw.type as ActionType;
  if (type === 'presence') return null;
  if (ONLY_A.includes(type) && from !== 'A') return null;
  if (ONLY_B.includes(type) && from !== 'B') return null;

  switch (type) {
    case 'phase':
      return oneOf(raw.phase, PHASES) ? { type, phase: raw.phase } : null;
    case 'prefs': {
      if (!isObj(raw.prefs)) return null;
      const p = raw.prefs;
      const prefs: Partial<Prefs> = {};
      const pressure = num(p.pressure, 1, 5);
      if (pressure != null) prefs.pressure = Math.round(pressure);
      if ('durationMin' in p) {
        const d = numOrNull(p.durationMin, 1, 240);
        prefs.durationMin = d == null ? null : Math.round(d);
      }
      if (Array.isArray(p.likes)) prefs.likes = p.likes.filter((l): l is TechniqueId => oneOf(l, LIKE_IDS)).slice(0, 12);
      if (typeof p.notes === 'string') prefs.notes = p.notes.slice(0, 500);
      return { type, prefs };
    }
    case 'marker.add': {
      const pos = saneVec(raw.pos);
      return pos && isSymptom(raw.kind) ? { type, kind: raw.kind, pos } : null;
    }
    case 'marker.remove':
      return typeof raw.id === 'string' ? { type, id: raw.id.slice(0, 20) } : null;
    case 'markers.set': {
      if (!Array.isArray(raw.markers)) return null;
      const markers = raw.markers
        .map((m) => (isObj(m) && isSymptom(m.kind) && saneVec(m.pos) ? { kind: m.kind, pos: saneVec(m.pos)! } : null))
        .filter((m): m is { kind: SymptomKind; pos: Vec } => m !== null)
        .slice(0, 60);
      return { type, markers };
    }
    case 'target': {
      const pos = saneVec(raw.pos);
      if (!pos || !oneOf(raw.source, SOURCES)) return null;
      const allowed: TargetSource[] = from === 'A' ? ['nudge', 'map'] : ['anchor', 'plan'];
      if (!allowed.includes(raw.source)) return null;
      const action: Action = { type, pos, active: raw.active === true, source: raw.source, from: saneVec(raw.from) };
      if (raw.source === 'anchor' && raw.learn === true) action.learn = true;
      return action;
    }
    case 'feedback':
      return oneOf(raw.kind, FEEDBACK) ? { type, kind: raw.kind } : null;
    case 'pause':
      return { type, paused: raw.paused === true };
    case 'calib': {
      const i = raw.info;
      if (!isObj(i) || !isObj(i.orientation)) return null;
      const angle = num(i.orientation.angle, 0, 360);
      if (angle == null) return null;
      return {
        type,
        info: {
          orientation: { angle, mirrored: i.orientation.mirrored === true },
          sensitivity: num(i.sensitivity, 0.1, 10) ?? 1,
          tune: num(i.tune, 0.1, 10) ?? 1,
          mode: i.mode === 'map' ? 'map' : 'nudge',
          points: Math.round(num(i.points, 0, 1000) ?? 0),
          rawErrorCm: numOrNull(i.rawErrorCm, 0, 200),
          errorCm: numOrNull(i.errorCm, 0, 200),
        },
      };
    }
    case 'setup.step':
      return oneOf(raw.step, STEPS) ? { type, step: raw.step } : null;
    case 'probe.start': {
      const truth = saneVec(raw.truth);
      if (!truth) return null;
      const landmark = typeof raw.landmark === 'string' && raw.landmark in LANDMARKS ? (raw.landmark as LandmarkId) : null;
      return { type, landmark, truth };
    }
    case 'probe.answer': {
      const answer = saneVec(raw.answer);
      const corrected = saneVec(raw.corrected);
      return typeof raw.id === 'string' && answer && corrected ? { type, id: raw.id.slice(0, 20), answer, corrected } : null;
    }
    case 'probe.cancel':
      return { type };
    case 'end':
    case 'restart': {
      const round = num(raw.round, 1, 1e6);
      return round == null ? { type } : { type, round: Math.round(round) };
    }
    default:
      return null;
  }
}

/** High-frequency actions that should not be queued while offline. */
export const isEphemeral = (a: Action) => a.type === 'target' && a.active;
