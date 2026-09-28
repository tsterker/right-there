import { describe, expect, it } from 'vitest';
import { initialState, reduce, type Action, type Role } from '../src/shared/session';
import { summarize } from '../src/shared/summary';
import { buildPlan, currentStepIndex } from '../src/shared/techniques';

const play = (steps: [Action, Role | 'server', number][]) =>
  steps.reduce((s, [a, from, at]) => reduce(s, a, { from, at }), initialState('1234', 0));

describe('summarize', () => {
  it('reports where the time went, what they loved and notes for next time', () => {
    const s = play([
      [{ type: 'presence', role: 'A', connected: true }, 'server', 0],
      [{ type: 'presence', role: 'B', connected: true }, 'server', 0],
      [{ type: 'phase', phase: 'live' }, 'B', 0],
      [{ type: 'target', pos: { x: 12, y: 1.5 }, active: false, source: 'map' }, 'A', 0],
      [{ type: 'feedback', kind: 'good' }, 'A', 60_000],
      [{ type: 'feedback', kind: 'firmer' }, 'A', 61_000],
      [{ type: 'target', pos: { x: 5, y: 40 }, active: false, source: 'map' }, 'A', 120_000],
      [{ type: 'feedback', kind: 'ouch' }, 'A', 130_000],
      [{ type: 'feedback', kind: 'slower' }, 'A', 131_000],
      [{ type: 'end' }, 'B', 180_000],
    ]);
    const sum = summarize(s);
    expect(sum.durationMs).toBe(180_000);
    expect(sum.topAreas.map((a) => a.name)).toEqual(['Top of the right shoulder', 'Right lower back']);
    expect(sum.topAreas[0].ms).toBe(120_000);
    expect(sum.favorites).toEqual([{ x: 12, y: 1.5 }]);
    expect(sum.ouches).toEqual([{ x: 5, y: 40 }]);
    expect(sum.counts).toMatchObject({ good: 1, firmer: 1, ouch: 1, slower: 1 });
    expect(sum.notes.join(' | ')).toMatch(/Loved: Top of the right shoulder/);
    expect(sum.notes.join(' | ')).toMatch(/Go gently on: Right lower back/);
    expect(sum.notes.join(' | ')).toMatch(/slower pace/);
  });
});

describe('plan timing', () => {
  it('walks through warm-up, focus steps and cool-down as time passes', () => {
    const plan = buildPlan([{ kind: 'knot', pos: { x: 12, y: 1.5 } }], 20, []);
    const [warm, focus, cool] = plan.steps;
    expect(currentStepIndex(plan, 0)).toBe(0);
    expect(currentStepIndex(plan, warm.minutes + 0.1)).toBe(1);
    expect(currentStepIndex(plan, warm.minutes + focus.minutes + 0.1)).toBe(2);
    expect(currentStepIndex(plan, 999)).toBe(2);
    expect(cool.kind).toBe('cooldown');
  });
});
