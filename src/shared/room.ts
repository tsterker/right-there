/**
 * The authoritative copy of one session. It validates every action, applies
 * the reducer, numbers the result and produces the messages to send.
 *
 * Runs in the server relay and — in no-server mode — in the browser of the
 * device that hosts the session. Transport-agnostic: callers decide who
 * receives which message.
 */
import type { ServerMsg } from './protocol.ts';
import { initialState, reduce, sanitizeAction, type Action, type Role, type SessionState } from './session.ts';

const RECENT_IDS = 200;

export type RoomResult =
  | { kind: 'broadcast'; msg: ServerMsg }
  | { kind: 'reply'; msg: ServerMsg }
  | { kind: 'none' };

export class Room {
  state: SessionState;
  seq = 0;
  lastActivity: number;
  /** Ids of recently applied actions per seat, to drop duplicates resent after a reconnect. */
  private recent: Record<Role, string[]> = { A: [], B: [] };

  constructor(
    readonly code: string,
    private readonly now: () => number,
  ) {
    this.state = initialState(code, now());
    this.lastActivity = now();
  }

  /** Apply an already valid action and return the message that tells everyone. */
  apply(action: Action, from: Role | 'server', id?: string): ServerMsg {
    const at = this.now();
    this.state = reduce(this.state, action, { from, at });
    this.seq += 1;
    this.lastActivity = at;
    return { t: 'act', a: action, from, at, seq: this.seq, ...(id ? { id } : {}) };
  }

  /** An action sent by a phone: deduplicated, validated, applied. */
  act(raw: unknown, from: Role, rawId?: unknown): RoomResult {
    const id = typeof rawId === 'string' && rawId.length <= 64 ? rawId : undefined;
    if (id && this.recent[from].includes(id)) return { kind: 'none' };
    const action = sanitizeAction(raw, from);
    if (!action) return { kind: 'reply', msg: { t: 'error', code: 'bad-request', message: 'Action rejected.' } };
    if (id) this.recent[from] = [...this.recent[from], id].slice(-RECENT_IDS);
    return { kind: 'broadcast', msg: this.apply(action, from, id) };
  }

  /** A seat (dis)connected. Null if nothing changed. */
  presence(role: Role, connected: boolean): ServerMsg | null {
    if (this.state.members[role].connected === connected) return null;
    return this.apply({ type: 'presence', role, connected }, 'server');
  }

  welcome(role: Role): ServerMsg {
    return {
      t: 'welcome',
      role,
      code: this.code,
      state: this.state,
      seq: this.seq,
      now: this.now(),
      acked: this.recent[role],
    };
  }

  snapshot(): ServerMsg {
    return { t: 'snapshot', state: this.state, seq: this.seq, now: this.now() };
  }

  pong(c: unknown): ServerMsg {
    return { t: 'pong', c: Number(c) || 0, now: this.now() };
  }
}
