import { describe, expect, it } from 'vitest';
import { initialState, isEphemeral, reduce, sanitizeAction, type Action, type Role, type SessionState } from '../src/shared/session';

const run = (steps: [Action, Role | 'server', number][], s: SessionState = initialState('1234', 0)) =>
  steps.reduce((acc, [a, from, at]) => reduce(acc, a, { from, at }), s);

describe('reducer', () => {
  it('tracks who is connected; "joined" sticks after a disconnect', () => {
    const s = run([
      [{ type: 'presence', role: 'A', connected: true }, 'server', 1],
      [{ type: 'presence', role: 'A', connected: false }, 'server', 2],
    ]);
    expect(s.members.A).toEqual({ connected: false, joined: true });
    expect(s.members.B).toEqual({ connected: false, joined: false });
  });

  it('keeps the target on the body and remembers who set it', () => {
    const s = run([[{ type: 'target', pos: { x: 90, y: 20 }, active: true, source: 'nudge', from: { x: 0, y: 18 } }, 'A', 5]]);
    expect(s.target).toMatchObject({ active: true, source: 'nudge', from: { x: 0, y: 18 }, by: 'A', at: 5 });
    expect(s.target!.pos.x).toBeLessThan(20);
    const anchored = reduce(s, { type: 'target', pos: { x: 3, y: 30 }, active: false, source: 'anchor' }, { from: 'B', at: 6 });
    expect(anchored.target).toMatchObject({ pos: { x: 3, y: 30 }, by: 'B', from: null });
  });

  it('records "right there" on the current spot with deterministic ids', () => {
    const steps: [Action, Role, number][] = [
      [{ type: 'target', pos: { x: 5, y: 40 }, active: false, source: 'map' }, 'A', 1],
      [{ type: 'good' }, 'A', 2],
      [{ type: 'good' }, 'A', 3],
    ];
    const s = run(steps);
    expect(s.good).toEqual({ id: 'g2', at: 3, pos: { x: 5, y: 40 } });
    expect(run(steps)).toEqual(s);
    expect(run([[{ type: 'good' }, 'A', 1]]).good?.pos).toBeNull();
  });

  it('steps the pressure within 1..5 and remembers the last ask, even at the end of the scale', () => {
    expect(initialState('1234', 0).pressure).toEqual({ level: 3, last: null });
    const firm = run([
      [{ type: 'pressure', change: 'firmer' }, 'A', 1],
      [{ type: 'pressure', change: 'firmer' }, 'A', 2],
      [{ type: 'pressure', change: 'firmer' }, 'A', 3],
    ]);
    expect(firm.pressure).toEqual({ level: 5, last: { id: 'p3', at: 3, change: 'firmer' } });
    const soft = run(
      [
        [{ type: 'pressure', change: 'softer' }, 'A', 4],
        [{ type: 'good' }, 'A', 5],
      ],
      firm,
    );
    expect(soft.pressure).toEqual({ level: 4, last: { id: 'p4', at: 4, change: 'softer' } });
    expect(soft.good?.id).toBe('g5');
    const floor = run(Array.from({ length: 6 }, (_, i): [Action, Role, number] => [{ type: 'pressure', change: 'softer' }, 'A', i]));
    expect(floor.pressure.level).toBe(1);
  });

  it('works both sides from the side the spot is on; nudges stop at the spine', () => {
    expect(initialState('1234', 0).bothSides).toBeNull();
    const on = run([
      [{ type: 'target', pos: { x: -6, y: 20 }, active: false, source: 'nudge' }, 'A', 1],
      [{ type: 'bothSides', on: true }, 'A', 2],
    ]);
    expect(on.bothSides).toBe('left');
    expect(on.target?.pos).toEqual({ x: -6, y: 20 });
    const across = reduce(on, { type: 'target', pos: { x: 4, y: 22 }, active: true, source: 'nudge' }, { from: 'A', at: 3 });
    expect(across.target?.pos).toEqual({ x: 0, y: 22 });
    expect(across.bothSides).toBe('left');
    const touched = reduce(on, { type: 'target', pos: { x: 8, y: 30 }, active: false, source: 'map' }, { from: 'A', at: 3 });
    expect(touched.target?.pos).toEqual({ x: 8, y: 30 });
    expect(touched.bothSides).toBe('right');
    expect(reduce(on, { type: 'bothSides', on: false }, { from: 'A', at: 4 }).bothSides).toBeNull();
    expect(run([[{ type: 'bothSides', on: true }, 'A', 1]]).bothSides).toBe('right');
  });

  it('switches hands without moving the pair: the spot becomes its mirror', () => {
    const on = run([
      [{ type: 'target', pos: { x: -6, y: 20 }, active: false, source: 'nudge' }, 'A', 1],
      [{ type: 'bothSides', on: true }, 'A', 2],
      [{ type: 'bothSides', on: true, side: 'right' }, 'A', 3],
    ]);
    expect(on.bothSides).toBe('right');
    expect(on.target?.pos).toEqual({ x: 6, y: 20 });
    // Now nudges steer the right hand: going left stops at the spine.
    const left = reduce(on, { type: 'target', pos: { x: -3, y: 20 }, active: true, source: 'nudge' }, { from: 'A', at: 4 });
    expect(left.target?.pos.x).toBe(0);
    expect(reduce(on, { type: 'bothSides', on: true, side: 'right' }, { from: 'A', at: 4 }).target?.pos).toEqual({ x: 6, y: 20 });
  });
});

describe('sanitizeAction', () => {
  it('lets the receiver point and the giver only say where their hands are', () => {
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'nudge' }, 'A')).not.toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'map' }, 'A')).not.toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'anchor' }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'nudge' }, 'B')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 0, y: 0 }, source: 'anchor', learn: true }, 'B')).toMatchObject({ learn: true });
    expect(sanitizeAction({ type: 'good' }, 'A')).toEqual({ type: 'good' });
    expect(sanitizeAction({ type: 'good' }, 'B')).toBeNull();
    expect(sanitizeAction({ type: 'bothSides', on: true, extra: 1 }, 'A')).toEqual({ type: 'bothSides', on: true });
    expect(sanitizeAction({ type: 'bothSides', on: 'yes' }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'bothSides', on: true, side: 'left' }, 'A')).toEqual({ type: 'bothSides', on: true, side: 'left' });
    expect(sanitizeAction({ type: 'bothSides', on: true, side: 'up' }, 'A')).toEqual({ type: 'bothSides', on: true });
    expect(sanitizeAction({ type: 'bothSides', on: true }, 'B')).toBeNull();
    expect(sanitizeAction({ type: 'presence', role: 'A', connected: true }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'pressure', change: 'firmer', level: 9 }, 'A')).toEqual({ type: 'pressure', change: 'firmer' });
    expect(sanitizeAction({ type: 'pressure', change: 'softer' }, 'A')).toEqual({ type: 'pressure', change: 'softer' });
    expect(sanitizeAction({ type: 'pressure', change: 'harder' }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'pressure', change: 'firmer' }, 'B')).toBeNull();
  });

  it('rejects malformed input and rounds positions', () => {
    expect(sanitizeAction(null, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: NaN, y: 0 }, source: 'map' }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 1e6, y: 0 }, source: 'map' }, 'A')).toBeNull();
    expect(sanitizeAction({ type: 'target', pos: { x: 1.23456, y: 2 }, source: 'map', active: 'yes' }, 'A')).toMatchObject({
      pos: { x: 1.23, y: 2 },
      active: false,
    });
  });

  it('only live pointing is fire-and-forget', () => {
    expect(isEphemeral({ type: 'target', pos: { x: 0, y: 0 }, active: true, source: 'nudge' })).toBe(true);
    expect(isEphemeral({ type: 'target', pos: { x: 0, y: 0 }, active: false, source: 'nudge' })).toBe(false);
    expect(isEphemeral({ type: 'good' })).toBe(false);
  });
});
