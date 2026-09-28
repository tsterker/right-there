/**
 * One phone's link to the session's authority — the relay server, or in
 * no-server mode the device that hosts the session. Keeps a replica of the
 * session state by applying the same sequenced actions; resends what wasn't
 * confirmed and resyncs from a snapshot when needed.
 *
 * The transport is a pluggable Link: WebSocket (reconnects by itself), a
 * WebRTC data channel (reopens after re-pairing), or in-page for the host.
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { WS_PATH, type ClientMsg, type ServerMsg } from '../../shared/protocol';
import { isEphemeral, reduce, type Action, type Role, type SessionState } from '../../shared/session';
import { navigate } from './router';
import { saveToken } from './storage';

export type ConnStatus = 'connecting' | 'online' | 'reconnecting' | 'failed';

export interface ConnSnapshot {
  status: ConnStatus;
  state: SessionState | null;
  error: { code: string; message: string } | null;
  /** Can change in no-server mode when the roles are swapped. */
  role: Role;
  code: string;
}

export type ActionListener = (a: Action, from: Role | 'server', at: number, state: SessionState) => void;

export interface LinkHandlers {
  /** Ready to talk; `send` goes to the session's authority. */
  open(send: (msg: ClientMsg) => void): void;
  message(msg: ServerMsg): void;
  closed(fatal: boolean): void;
}

export interface Link {
  /** Reconnects by itself (WebSocket). Peer links reopen only after re-pairing. */
  readonly autoRetry: boolean;
  connect(handlers: LinkHandlers): void;
  close(): void;
}

/** Close codes after which retrying makes no sense. */
const FATAL = new Set([4403, 4404, 4409]);
const FATAL_ERRORS = new Set(['room-not-found', 'bad-token', 'replaced']);
const STALE_MS = 12_000;
const CONNECT_TIMEOUT_MS = 8_000;
/** How long an unconfirmed action stays worth (re)sending. "Firmer!" is only useful right away. */
const maxAge = (a: Action) => (a.type === 'feedback' || a.type === 'target' ? 8_000 : 60_000);

/** WebSocket to the relay on the page's own server. */
export function webSocketLink(): Link {
  let ws: WebSocket | null = null;
  return {
    autoRetry: true,
    connect(h) {
      const old = ws;
      ws = null;
      if (old && old.readyState <= WebSocket.OPEN) old.close();
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}${WS_PATH}`);
      ws = sock;
      sock.onopen = () => {
        if (ws === sock) h.open((msg) => sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify(msg)));
      };
      sock.onmessage = (e) => {
        if (ws !== sock) return;
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        h.message(msg);
      };
      sock.onclose = (e) => {
        if (ws !== sock) return;
        ws = null;
        h.closed(FATAL.has(e.code));
      };
    },
    close() {
      const sock = ws;
      ws = null;
      if (sock && sock.readyState <= WebSocket.OPEN) sock.close(1000);
    },
  };
}

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
  private attempt = 0;
  private retryTimer: number | undefined;
  private connectTimer: number | undefined;
  private pingTimer: number | undefined;
  private lastMessageAt = 0;
  private bestRtt = Infinity;
  private started = false;
  /** Authority's clock minus local clock (ms). */
  offset = 0;

  constructor(
    code: string,
    role: Role,
    private readonly token: string,
    private readonly link: Link = webSocketLink(),
  ) {
    this.snap = { status: 'connecting', state: null, error: null, role, code };
  }

  get role() {
    return this.snap.role;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (this.link.autoRetry) {
      document.addEventListener('visibilitychange', this.wake);
      window.addEventListener('online', this.wake);
    }
    this.connect();
  }

  stop() {
    this.started = false;
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('online', this.wake);
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.connectTimer);
    window.clearInterval(this.pingTimer);
    this.sendFn = null;
    this.link.close();
  }

  /** Reconnect after being replaced by another tab/device. */
  reclaim() {
    this.set({ error: null, status: 'connecting' });
    this.attempt = 0;
    if (!this.started) this.start();
    else this.connect();
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

  /** Session time, for timers shared by both phones. */
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

  private connect() {
    if (!this.started) return;
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.connectTimer);
    window.clearInterval(this.pingTimer);
    this.sendFn = null;
    if (this.snap.status === 'online') this.set({ status: 'reconnecting' });
    this.lastMessageAt = Date.now();
    if (this.link.autoRetry) {
      // A stalled handshake (flaky Wi-Fi) should not hang for a minute.
      this.connectTimer = window.setTimeout(() => {
        if (this.snap.status !== 'online') {
          this.link.close();
          this.lost(false);
        }
      }, CONNECT_TIMEOUT_MS);
    }
    this.link.connect({
      open: (send) => {
        if (!this.started) return;
        this.sendFn = send;
        send({ t: 'hello', code: this.snap.code, role: this.snap.role, token: this.token });
      },
      message: (msg) => {
        if (!this.started) return;
        this.lastMessageAt = Date.now();
        this.onMessage(msg);
      },
      closed: (fatal) => {
        if (this.started) this.lost(fatal);
      },
    });
  }

  /** Forget the current connection and either give up, retry, or wait to be re-paired. */
  private lost(fatal: boolean) {
    this.sendFn = null;
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.connectTimer);
    if (fatal) {
      this.set({ status: 'failed' });
      return;
    }
    if (!this.started) return;
    this.set({ status: this.snap.state ? 'reconnecting' : 'connecting' });
    if (!this.link.autoRetry) return;
    const delay = Math.min(4000, 300 * 2 ** this.attempt) * (0.8 + Math.random() * 0.4);
    this.attempt += 1;
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private wake = () => {
    if (document.visibilityState !== 'visible' || !this.started || this.snap.status === 'failed') return;
    if (!this.sendFn || Date.now() - this.lastMessageAt > STALE_MS) {
      this.attempt = 0;
      this.connect();
    } else {
      this.send({ t: 'ping', c: Date.now() });
    }
  };

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        window.clearTimeout(this.connectTimer);
        this.attempt = 0;
        this.seq = msg.seq;
        this.syncing = false;
        this.offset = msg.now - Date.now();
        this.bestRtt = Infinity;
        // A different room (roles swapped in no-server mode): nothing pending belongs there.
        if (msg.code !== this.snap.code) this.pending = [];
        const acked = new Set(msg.acked ?? []);
        this.pending = this.pending.filter((p) => !acked.has(p.id));
        this.set({ status: 'online', state: msg.state, error: null, role: msg.role, code: msg.code });
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
      case 'moved':
        saveToken(msg.code, msg.role, msg.token);
        navigate(`/s/${msg.code}/${msg.role}`, true);
        return;
      case 'error':
        if (FATAL_ERRORS.has(msg.code)) this.set({ error: { code: msg.code, message: msg.message } });
        else console.warn(`[right-there] ${msg.code}: ${msg.message}`);
        return;
    }
  }

  /** After (re)connecting: send what hasn't been confirmed yet, unless it's gone stale. */
  private resend() {
    const now = Date.now();
    this.pending = this.pending.filter((p) => now - p.at <= maxAge(p.a));
    for (const p of this.pending) this.send({ t: 'act', a: p.a, id: p.id });
  }

  private startPing() {
    window.clearInterval(this.pingTimer);
    this.send({ t: 'ping', c: Date.now() });
    this.pingTimer = window.setInterval(() => {
      if (this.link.autoRetry && Date.now() - this.lastMessageAt > STALE_MS) {
        // Half-open socket (typical after a phone sleeps): drop it and reconnect.
        this.link.close();
        this.lost(false);
        return;
      }
      this.send({ t: 'ping', c: Date.now() });
    }, 4000);
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

export function useSessionConnection(code: string, role: Role, token: string): SessionApi {
  return useConnection(() => new SessionConnection(code, role, token));
}

export const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi & { state: SessionState } {
  const api = useContext(SessionContext);
  if (!api?.state) throw new Error('useSession outside of an active session');
  return api as SessionApi & { state: SessionState };
}

/** Subscribe to actions as they arrive (for sounds, speech, haptics). */
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
