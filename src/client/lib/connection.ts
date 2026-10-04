/**
 * This device's link to the session's authority (the hosting device). Keeps
 * a replica of the session state by applying the same sequenced actions;
 * resends what wasn't confirmed and resyncs from a snapshot when needed.
 *
 * The transport is a Link: in-page for the host's own screen, or the WebRTC
 * data channel for the partner (it reopens after re-pairing).
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { isEphemeral, reduce, type Action, type Role, type SessionState } from '../../shared/session';

export type ConnStatus = 'connecting' | 'online' | 'reconnecting';

export interface ConnSnapshot {
  status: ConnStatus;
  state: SessionState | null;
  /** Changes when the roles are swapped. */
  role: Role;
  code: string;
}

export type ActionListener = (a: Action, from: Role | 'server', at: number, state: SessionState) => void;

export interface LinkHandlers {
  /** Ready to talk; `send` goes to the session's authority. */
  open(send: (msg: ClientMsg) => void): void;
  message(msg: ServerMsg): void;
  closed(): void;
}

export interface Link {
  connect(handlers: LinkHandlers): void;
  close(): void;
}

/** How long an unconfirmed action stays worth (re)sending. "Right there" and "firmer" are only useful right away. */
const maxAge = (a: Action) => (a.type === 'good' || a.type === 'target' || a.type === 'pressure' ? 8_000 : 60_000);

interface Pending {
  id: string;
  a: Action;
  at: number;
}

export class SessionConnection {
  private sendFn: ((msg: ClientMsg) => void) | null = null;
  private seq = 0;
  private syncing = false;
  private snap: ConnSnapshot;
  private listeners = new Set<() => void>();
  private actionListeners = new Set<ActionListener>();
  /** Actions sent or queued but not yet echoed; resent after a reconnect. */
  private pending: Pending[] = [];
  private readonly instance = Math.random().toString(36).slice(2, 8);
  private counter = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private bestRtt = Infinity;
  private started = false;
  /** Authority's clock minus local clock (ms). */
  offset = 0;

  constructor(
    code: string,
    role: Role,
    private readonly link: Link,
  ) {
    this.snap = { status: 'connecting', state: null, role, code };
  }

  get role() {
    return this.snap.role;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.link.connect({
      open: (send) => {
        if (!this.started) return;
        this.sendFn = send;
        send({ t: 'hello' });
      },
      message: (msg) => {
        if (this.started) this.onMessage(msg);
      },
      closed: () => {
        if (!this.started) return;
        this.sendFn = null;
        clearInterval(this.pingTimer);
        this.set({ status: this.snap.state ? 'reconnecting' : 'connecting' });
      },
    });
  }

  stop() {
    this.started = false;
    clearInterval(this.pingTimer);
    this.sendFn = null;
    this.link.close();
  }

  /** Continue with the roles reversed. */
  swapRoles() {
    if (this.online()) this.send({ t: 'swap' });
  }

  getSnapshot = () => this.snap;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  onAction(l: ActionListener) {
    this.actionListeners.add(l);
    return () => {
      this.actionListeners.delete(l);
    };
  }

  /** Session time (the host's clock), for comparing with timestamps in the state. */
  now = () => Date.now() + this.offset;

  dispatch = (a: Action) => {
    if (isEphemeral(a)) {
      // Live pointing is superseded within milliseconds: fire and forget.
      if (this.online()) this.send({ t: 'act', a });
      return;
    }
    const p: Pending = { id: `${this.instance}-${++this.counter}`, a, at: Date.now() };
    this.pending = [...this.pending, p].slice(-60);
    if (this.online()) this.send({ t: 'act', a, id: p.id });
  };

  private online() {
    return this.sendFn != null && this.snap.status === 'online';
  }

  private set(patch: Partial<ConnSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  private send(msg: ClientMsg) {
    this.sendFn?.(msg);
  }

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        this.seq = msg.seq;
        this.syncing = false;
        this.offset = msg.now - Date.now();
        this.bestRtt = Infinity;
        // A different room (roles swapped): nothing pending belongs there.
        if (msg.code !== this.snap.code) this.pending = [];
        const acked = new Set(msg.acked ?? []);
        this.pending = this.pending.filter((p) => !acked.has(p.id));
        this.set({ status: 'online', state: msg.state, role: msg.role, code: msg.code });
        this.resend();
        this.startPing();
        return;
      }
      case 'snapshot':
        this.seq = msg.seq;
        this.syncing = false;
        this.set({ state: msg.state });
        return;
      case 'act': {
        if (msg.id && msg.from === this.snap.role) this.pending = this.pending.filter((p) => p.id !== msg.id);
        const state = this.snap.state;
        if (!state || this.syncing || msg.seq <= this.seq) return;
        if (msg.seq !== this.seq + 1) {
          this.syncing = true;
          this.send({ t: 'sync' });
          return;
        }
        this.seq = msg.seq;
        const next = reduce(state, msg.a, { from: msg.from, at: msg.at });
        this.set({ state: next });
        this.actionListeners.forEach((l) => l(msg.a, msg.from, msg.at, next));
        return;
      }
      case 'pong': {
        const rtt = Date.now() - msg.c;
        if (rtt >= 0 && rtt <= this.bestRtt * 1.5 + 20) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = msg.now + rtt / 2 - Date.now();
        }
        return;
      }
      case 'error':
        console.warn(`[right-there] ${msg.code}: ${msg.message}`);
        return;
    }
  }

  /** After (re)connecting: send what hasn't been confirmed yet, unless it's gone stale. */
  private resend() {
    const now = Date.now();
    this.pending = this.pending.filter((p) => now - p.at <= maxAge(p.a));
    for (const p of this.pending) this.send({ t: 'act', a: p.a, id: p.id });
  }

  /** Keeps the clock offset fresh (timestamps in the state are the host's). */
  private startPing() {
    clearInterval(this.pingTimer);
    this.send({ t: 'ping', c: Date.now() });
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 10_000);
  }
}

export interface SessionApi extends ConnSnapshot {
  conn: SessionConnection;
  dispatch: (a: Action) => void;
  now: () => number;
}

/** Run a connection while mounted and re-render on every change. */
export function useConnection(create: () => SessionConnection): SessionApi {
  const [conn] = useState(create);
  useEffect(() => {
    conn.start();
    return () => conn.stop();
  }, [conn]);
  const snap = useSyncExternalStore(conn.subscribe, conn.getSnapshot);
  return { ...snap, conn, dispatch: conn.dispatch, now: conn.now };
}

export const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi & { state: SessionState } {
  const api = useContext(SessionContext);
  if (!api?.state) throw new Error('useSession outside of an active session');
  return api as SessionApi & { state: SessionState };
}

/** Subscribe to actions as they arrive (for speech and haptics). */
export function useActions(listener: ActionListener) {
  const api = useContext(SessionContext);
  const conn = api?.conn;
  const ref = useLatest(listener);
  useEffect(() => {
    if (!conn) return;
    return conn.onAction((...args) => ref.current(...args));
  }, [conn, ref]);
}

export function useLatest<T>(value: T) {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}
