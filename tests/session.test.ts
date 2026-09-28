import { describe, expect, it } from 'vitest';
import { elapsedMs, initialState, reduce, sanitizeAction, type Action, type Role, type SessionState } from '../src/shared/session';

const run = (steps: [Action, Role | 'server', number][], s: SessionState = initialState('1234', 0)) =>
  steps.reduce((acc, [a, from, at]) => reduce(acc, a, { from, at }), s);

const both: [Action, 'server', number][] = [
  [{ type: 'presence', role: 'A', connected: true }, 'server', 1],
  [{ type: 'presence', role: 'B', connected: true }, 'server', 2],
];

describe('reducer', () => {
  it('moves from lobby to check-in once both phones are connected', () => {
    const one = run(both.slice(0, 1));
    expect(one.phase).toBe('lobby');
    expect(run(both).phase).toBe('checkin');
  });

  it('tracks pressure and tempo from feedback', () => {
    const s = run([
      ...both,
      [{ type: 'prefs', prefs: { pressure: 4 } }, 'A', 3],
      [{ type: 'phase', phase: 'live' }, 'B', 10],
      [{ type: 'feedback', kind: 'firmer' }, 'A', 11],
      [{ type: 'feedback', kind: 'firmer' }, 'A', 12],
      [{ type: 'feedback', kind: 'ouch' }, 'A', 13],
      [{ type: 'feedback', kind: 'slower' }, 'A', 14],
    ]);
    expect(s.pressure).toBe(4); // 4 → 5 → 5 (max) → 4
    expect(s.tempo).toBe(-1);
    expect(s.feedback.map((f) => f.kind)).toEqual(['firmer', 'firmer', 'ouch', 'slower']);
  });

  it('accumulates time per region and excludes pauses', () => {
    const s = run([
      ...both,
      [{ type: 'phase', phase: 'live' }, 'B', 1000],
      [{ type: 'target', pos: { x: 12, y: 1.5 }, active: false, source: 'map' }, 'A', 1000],
      [{ type: 'pause', paused: true }, 'A', 4000],
      [{ type: 'pause', paused: false }, 'A', 9000],
      [{ type: 'target', pos: { x: 5, y: 40 }, active: false, source: 'map' }, 'A', 10000],
      [{ type: 'end' }, 'B', 12000],
    ]);
    expect(s.phase).toBe('summary');
    expect(s.dwell.trap_r).toBe(4000); // 1000..4000 and 9000..10000
    expect(s.dwell.lowback_r).toBe(2000);
    expect(elapsedMs(s, 99999)).toBe(6000);
    expect(Object.values(s.heat).reduce((a, b) => a + b, 0)).toBe(6000);
  });

  it('pauses the clock while recalibrating mid-session', () => {
    const s = run([
      ...both,
      [{ type: 'phase', phase: 'live' }, 'B', 0],
      [{ type: 'phase', phase: 'setup' }, 'A', 5000],
      [{ type: 'phase', phase: 'live' }, 'A', 8000],
    ]);
    expect(elapsedMs(s, 10000)).toBe(7000);
  });

  it('keeps markers and prefs on restart but resets the round', () => {
    const s = run([
      ...both,
      [{ type: 'marker.add', kind: 'knot', pos: { x: 12, y: 2 } }, 'A', 3],
      [{ type: 'phase', phase: 'live' }, 'B', 4],
      [{ type: 'feedback', kind: 'good' }, 'A', 5],
      [{ type: 'end' }, 'A', 6],
      [{ type: 'restart' }, 'B', 7],
    ]);
    expect(s.phase).toBe('checkin');
    expect(s.round).toBe(2);
    expect(s.markers).toHaveLength(1);
    expect(s.feedback).toHaveLength(0);
    expect(s.timer.startedAt).toBeNull();
  });

  it('ignores a stale end/restart meant for an earlier round', () => {
    const s = run([
      ...both,
      [{ type: 'phase', phase: 'live' }, 'B', 1],
      [{ type: 'end', round: 1 }, 'A', 2],
      [{ type: 'restart', round: 1 }, 'A', 3],
      [{ type: 'phase', phase: 'live' }, 'A', 4],
      // The giver's phone was offline and replays its own "Another round" from round 1:
      [{ type: 'restart', round: 1 }, 'B', 5],
      [{ type: 'end', round: 1 }, 'B', 6],
    ]);
    expect(s.round).toBe(2);
    expect(s.phase).toBe('live');
    expect(sanitizeAction({ type: 'restart', round: 2.2 }, 'B')).toEqual({ type: 'restart', round: 2 });
    expect(sanitizeAction({ type: 'end' }, 'B')).toEqual({ type: 'end' });
  });

  it('assigns deterministic ids', () => {
    const steps: [Action, Role, number][] = [
      [{ type: 'marker.add', kind: 'knot', pos: { x: 1, y: 2 } }, 'A', 1],
      [{ type: 'feedback', kind: 'good' }, 'A', 2],
    ];
    expect(run(steps)).toEqual(run(steps));
    expect(run(steps).markers[0].id).toBe('m1');
  });

  it('runs a calibration probe', () => {
    let s = run([[{ type: 'probe.start', landmark: 'scap_l', truth: { x: -12, y: 10 } }, 'B', 1]]);
    expect(s.probe?.answer).toBeNull();
    s = reduce(s, { type: 'probe.answer', id: s.probe!.id, answer: { x: -9, y: 14 }, corrected: { x: -9, y: 14 } }, { from: 'A', at: 2 });
    expect(s.probes).toHaveLength(1);
    // A second answer to the same probe is ignored.
    const again = reduce(s, { type: 'probe.answer', id: s.probe!.id, answer: { x: 0, y: 0 }, corrected: { x: 0, y: 0 } }, { from: 'A', at: 3 });
    expect(again.probes).toHaveLength(1);
  });
});

describe('sanitizeAction', () => {
  it('enforces who may send what', () => {
    expect(sanitizeAction({ type: 'feedback', kind: 'firmer' }, 'A')).not.toBeNull();
    expect(sanitizeAction({ type: 'feedback', kind: 'firmer' }, 'B')).toBeNull();
    expect(sanitizeAction({ type: 'probe.start', truth: { x: 0, y: 0 } }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'nudge' }, 'B')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'anchor' }, 'B')).not.toBeNull();
    expect(sanitizeAction({ type: 'presence', role: 'A', connected: true }, 'A')).toBeNull();
  });

  it('rejects malformed input and clamps values', () => {
    expect(sanitizeAction(null, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: NaN, y: 0 }, source: 'map' }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'marker.add', kind: 'lava', pos: { x: 0, y: 0 } }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'prefs', prefs: { pressure: 99, likes: ['knead', 'nope'] } }, 'A')).toEqual({
      type: 'prefs',
      prefs: { pressure: 5, likes: ['knead'] },
    });
  });
});
