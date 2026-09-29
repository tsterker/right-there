/**
 * The receiver's touch surface.
 *
 * - Nudge mode: drag anywhere; the spot moves like a trackpad cursor through
 *   the calibrated phone orientation (slow = precise, quick = far).
 * - Map mode: touch the spot on the picture; the correction model maps it to
 *   where it really is.
 * Double-tap anywhere = "right there". Two-finger tap = both sides on/off.
 * A haptic tick marks entering a new area.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clampToBody } from '../../shared/body';
import { correct, type CorrectionModel, type Orientation } from '../../shared/calibration';
import { add, roundVec, sub, type Vec } from '../../shared/geometry';
import { Nudger, tuneFromStrokes, type Stroke } from '../../shared/nudge';
import { classify } from '../../shared/regions';
import type { Action, InputMode, Target } from '../../shared/session';
import { useLatest } from '../lib/connection';
import { haptic } from '../lib/haptics';
import { DEFAULT_START, lastMapPoint } from '../lib/pointing';
import { BackMap, type MapHandle } from './BackMap';

const SEND_INTERVAL_MS = 40;
/** Finger travel (px) before a touch counts as a drag; taps jitter by a few px. */
const DEAD_ZONE_PX = 8;

const near = (a: Vec, b: Vec) => Math.abs(a.x - b.x) < 0.15 && Math.abs(a.y - b.y) < 0.15;

type Gesture =
  | { kind: 'none' }
  | {
      kind: 'single';
      startT: number;
      sx: number;
      sy: number;
      moved: boolean;
      /** Local spot when the finger went down. */
      from: Vec;
      /** Shared target when the finger went down (to restore it). */
      before: Vec | null;
      /** Sent at least one active target during this gesture. */
      sent: boolean;
    }
  /** More than one finger: no pointing. A quick two-finger tap toggles both sides. */
  | { kind: 'multi'; startT: number; fingers: number; moved: boolean; starts: Map<number, Vec> };

export interface TouchPadProps {
  mode: InputMode;
  orientation: Orientation;
  sensitivity: number;
  tune: number;
  autoTune: boolean;
  model: CorrectionModel;
  target: Target | null;
  dispatch: (a: Action) => void;
  onRightThere?: () => void;
  onTwoFingerTap?: () => void;
  bothSides?: boolean;
  onTune?: (tune: number, reason: 'overshoot' | 'undershoot') => void;
  dim?: boolean;
  children?: ReactNode;
}

export function TouchPad(props: TouchPadProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapHandle>(null);
  const initial = props.target?.pos ?? DEFAULT_START;
  const [pos, setPos] = useState<Vec>(initial);
  const [active, setActive] = useState(false);
  const posRef = useRef(initial);
  const nudger = useRef(new Nudger(props.orientation, props.sensitivity, props.tune));
  nudger.current.orientation = props.orientation;
  nudger.current.sensitivity = props.sensitivity;
  nudger.current.tune = props.tune;
  const gesture = useRef<Gesture>({ kind: 'none' });
  const pointers = useRef(new Set<number>());
  const sender = useRef<{ last: number; timer: number | undefined; pending: Action | null }>({
    last: 0,
    timer: undefined,
    pending: null,
  });
  /** Last settled spot we sent in nudge mode; only its echo may move our local spot. */
  const settled = useRef<Vec | null>(null);
  const lastTap = useRef({ at: 0, x: 0, y: 0 });
  const strokes = useRef<Stroke[]>([]);
  const region = useRef<string | null>(null);
  const p = useLatest(props);

  const place = (v: Vec) => {
    posRef.current = v;
    setPos(v);
  };

  /**
   * Follow targets set elsewhere (the giver's "I'm here") while no finger is down.
   * Our own echoes only count once settled, and only the latest one (late echoes of
   * earlier strokes would pull the spot back).
   */
  const follow = () => {
    const t = p.current.target;
    if (!t || gesture.current.kind !== 'none') return;
    if (t.by === 'B') {
      place(t.pos);
      return;
    }
    if (p.current.mode === 'nudge' && !t.active && (!settled.current || near(t.pos, settled.current))) place(t.pos);
  };

  const t = props.target;
  useEffect(follow, [t]);

  // Switching mode: nudge continues from the shared target (map mode shows raw finger spots).
  useEffect(() => {
    settled.current = null;
    const target = p.current.target;
    if (props.mode === 'nudge' && target) place(target.pos);
  }, [props.mode, p]);

  useEffect(() => () => window.clearTimeout(sender.current.timer), []);

  const flush = () => {
    const s = sender.current;
    window.clearTimeout(s.timer);
    s.timer = undefined;
    if (!s.pending) return;
    p.current.dispatch(s.pending);
    s.pending = null;
    s.last = performance.now();
  };

  /** Queue a target update. `exact`: already a shared-target position, don't run it through the map correction. */
  const emit = (bodyPos: Vec, isActive: boolean, from: Vec | null, exact = false) => {
    const { mode, model } = p.current;
    const out = roundVec(mode === 'map' && !exact ? correct(model, bodyPos) : bodyPos);
    if (!isActive && mode === 'nudge') settled.current = out;
    const s = sender.current;
    s.pending = { type: 'target', pos: out, active: isActive, source: mode, from: from ? roundVec(from) : null };
    const wait = SEND_INTERVAL_MS - (performance.now() - s.last);
    if (!isActive || wait <= 0) flush();
    else if (s.timer === undefined) s.timer = window.setTimeout(flush, wait);
  };

  const setLocal = (v: Vec) => {
    place(v);
    const r = classify(v);
    if (region.current && r !== region.current) haptic('tick');
    region.current = r;
  };

  const bodyAt = (e: React.PointerEvent) => {
    const raw = mapRef.current?.toBody(e.clientX, e.clientY);
    return raw ? clampToBody(raw) : null;
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    el.current?.setPointerCapture?.(e.pointerId);
    // First finger of a new touch: forget pointers whose "up" never arrived.
    if (e.isPrimary) pointers.current.clear();
    pointers.current.add(e.pointerId);
    if (pointers.current.size === 1) {
      const g: Gesture = {
        kind: 'single',
        startT: e.timeStamp,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        from: posRef.current,
        before: p.current.target?.pos ?? null,
        sent: false,
      };
      gesture.current = g;
      setActive(true);
      if (p.current.mode === 'nudge') {
        nudger.current.begin({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      } else {
        const b = bodyAt(e);
        if (b) {
          setLocal(b);
          emit(b, true, null);
          g.sent = true;
        }
      }
      return;
    }
    // A second finger: not a pointing gesture. Settle (map mode: put the spot back) and ignore.
    const g = gesture.current;
    if (g.kind === 'multi') {
      g.fingers++;
      g.starts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (g.kind === 'single' && g.sent) {
      if (p.current.mode === 'map') {
        place(g.from);
        emit(g.before ?? g.from, false, null, g.before != null);
      } else {
        emit(posRef.current, false, g.from);
      }
    }
    const starts = new Map<number, Vec>([[e.pointerId, { x: e.clientX, y: e.clientY }]]);
    if (g.kind === 'single') for (const id of pointers.current) if (id !== e.pointerId) starts.set(id, { x: g.sx, y: g.sy });
    gesture.current = {
      kind: 'multi',
      startT: g.kind === 'single' ? g.startT : e.timeStamp,
      fingers: pointers.current.size,
      moved: g.kind === 'single' && g.moved,
      starts,
    };
    setActive(false);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    if (g.kind === 'multi') {
      const s0 = g.starts.get(e.pointerId);
      if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > DEAD_ZONE_PX) g.moved = true;
      return;
    }
    if (g.kind !== 'single') return;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > DEAD_ZONE_PX) g.moved = true;
    if (p.current.mode === 'nudge') {
      // Taps must not move the spot. The first move past the dead zone includes the travel so far.
      if (!g.moved) return;
      const d = nudger.current.move({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (d.x === 0 && d.y === 0) return;
      const next = clampToBody(add(posRef.current, d));
      setLocal(next);
      emit(next, true, g.from);
      g.sent = true;
    } else {
      const b = bodyAt(e);
      if (!b) return;
      setLocal(b);
      emit(b, true, null);
      g.sent = true;
    }
  };

  const onUp = (e: React.PointerEvent, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'multi') {
      if (cancelled) g.moved = true;
      if (pointers.current.size === 0) {
        gesture.current = { kind: 'none' };
        follow();
        if (g.fingers === 2 && !g.moved && e.timeStamp - g.startT < 400) p.current.onTwoFingerTap?.();
      }
      return;
    }
    if (g.kind !== 'single' || pointers.current.size > 0) return;

    gesture.current = { kind: 'none' };
    setActive(false);
    const dur = e.timeStamp - g.startT;
    const { mode, autoTune, tune, onTune, onRightThere } = p.current;
    if (mode === 'nudge') {
      nudger.current.end();
      if (g.sent) {
        emit(posRef.current, false, g.from);
        strokes.current = [...strokes.current, { d: sub(posRef.current, g.from), at: g.startT, dur }].slice(-4);
        if (autoTune) {
          const r = tuneFromStrokes(strokes.current, tune);
          if (r.reason) {
            strokes.current = [];
            onTune?.(r.tune, r.reason);
          }
        }
      }
    } else if (g.sent) {
      emit(posRef.current, false, null);
      lastMapPoint.raw = posRef.current;
      lastMapPoint.at = Date.now();
    }
    // Nothing sent (a tap in nudge mode): catch up with anything that arrived meanwhile.
    if (!g.sent) follow();

    if (!cancelled && !g.moved && dur < 300) {
      const tap = lastTap.current;
      if (e.timeStamp - tap.at < 380 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 45) {
        tap.at = 0;
        onRightThere?.();
      } else {
        lastTap.current = { at: e.timeStamp, x: e.clientX, y: e.clientY };
      }
    }
  };

  return (
    <div
      ref={el}
      className={`touchpad mode-${props.mode}${active ? ' is-touching' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => onUp(e, false)}
      onPointerCancel={(e) => onUp(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <BackMap
        angle={props.orientation.angle}
        mirrored={props.orientation.mirrored}
        target={{ pos, active }}
        bothSides={props.bothSides}
        handle={mapRef}
        dim={props.dim}
      />
      {props.children}
    </div>
  );
}
