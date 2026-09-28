/**
 * Session relay: rooms keyed by a 4-digit code, one seat per role.
 *
 * Every action from a phone is validated, reduced into the room state and
 * broadcast with a sequence number, so both phones apply the same actions in
 * the same order. Phones that reconnect get a snapshot. Rooms live in memory.
 */
import { randomBytes, randomInt } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  isCode,
  isRole,
  WS_PATH,
  type ClaimError,
  type ClaimResponse,
  type ClientMsg,
  type RoomInfo,
  type ServerInfo,
  type ServerMsg,
} from '../src/shared/protocol.ts';
import { Room as SessionRoom } from '../src/shared/room.ts';
import type { Role } from '../src/shared/session.ts';

interface Seat {
  token: string | null;
  ws: WebSocket | null;
}

interface Room {
  code: string;
  /** Session state, sequencing and dedupe (shared with the no-server host). */
  core: SessionRoom;
  seats: Record<Role, Seat>;
  /** After "swap roles": where each seat continues. Resent to a phone that reconnects late. */
  moved: Partial<Record<Role, ClaimResponse>> | null;
}

interface Conn {
  alive: boolean;
  room: Room | null;
  role: Role | null;
  bucket: number;
  bucketAt: number;
}

export interface RelayOptions {
  /** Remove rooms without connected phones after this long (ms). */
  roomTtlMs?: number;
  heartbeatMs?: number;
  now?: () => number;
  info?: () => ServerInfo;
  log?: (msg: string) => void;
}

const MAX_MSGS_PER_SEC = 120;

export function createRelay(options: RelayOptions = {}) {
  const now = options.now ?? Date.now;
  const ttl = options.roomTtlMs ?? 6 * 60 * 60 * 1000;
  const log = options.log ?? (() => {});
  const rooms = new Map<string, Room>();
  const conns = new WeakMap<WebSocket, Conn>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  const send = (ws: WebSocket | null, msg: ServerMsg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (room: Room, msg: ServerMsg, except?: WebSocket) => {
    for (const role of ['A', 'B'] as Role[]) {
      const ws = room.seats[role].ws;
      if (ws && ws !== except) send(ws, msg);
    }
  };

  function createRoom(): Room {
    let code = '';
    for (let i = 0; i < 1000; i++) {
      code = String(randomInt(0, 10000)).padStart(4, '0');
      if (!rooms.has(code)) break;
    }
    if (rooms.has(code)) throw new Error('No free room codes');
    const room: Room = {
      code,
      core: new SessionRoom(code, now),
      seats: { A: { token: null, ws: null }, B: { token: null, ws: null } },
      moved: null,
    };
    rooms.set(code, room);
    log(`room ${code} created`);
    return room;
  }

  function claim(room: Room, wanted: Role | null, takeover: boolean): ClaimResponse | { error: ClaimError } {
    let role: Role | null = null;
    if (wanted) {
      const seat = room.seats[wanted];
      if (seat.token == null || (takeover && seat.ws == null)) role = wanted;
      else return { error: 'role-taken' };
    } else {
      role = room.seats.A.token == null ? 'A' : room.seats.B.token == null ? 'B' : null;
      if (!role) return { error: 'room-full' };
    }
    const token = randomBytes(16).toString('hex');
    room.seats[role].token = token;
    room.core.lastActivity = now();
    return { code: room.code, role, token };
  }

  function roomInfo(room: Room): RoomInfo {
    return {
      code: room.code,
      phase: room.core.state.phase,
      seats: {
        A: { claimed: room.seats.A.token != null, connected: room.seats.A.ws != null },
        B: { claimed: room.seats.B.token != null, connected: room.seats.B.ws != null },
      },
    };
  }

  function detach(ws: WebSocket) {
    const conn = conns.get(ws);
    if (!conn?.room || !conn.role) return;
    const { room, role } = conn;
    conn.room = null;
    if (room.seats[role].ws !== ws) return;
    room.seats[role].ws = null;
    const msg = room.core.presence(role, false);
    if (msg) broadcast(room, msg);
    log(`room ${room.code}: ${role} left`);
  }

  function onHello(ws: WebSocket, conn: Conn, msg: Extract<ClientMsg, { t: 'hello' }>) {
    const room = isCode(msg.code) ? rooms.get(msg.code) : undefined;
    if (!room) {
      send(ws, { t: 'error', code: 'room-not-found', message: 'This session does not exist (any more).' });
      ws.close(4404, 'room-not-found');
      return;
    }
    if (!isRole(msg.role) || typeof msg.token !== 'string' || room.seats[msg.role].token !== msg.token) {
      send(ws, { t: 'error', code: 'bad-token', message: 'This device is not part of that session.' });
      ws.close(4403, 'bad-token');
      return;
    }
    const seat = room.seats[msg.role];
    if (seat.ws && seat.ws !== ws) {
      const old = seat.ws;
      const oldConn = conns.get(old);
      if (oldConn) oldConn.room = null;
      send(old, { t: 'error', code: 'replaced', message: 'Opened on another tab or device.' });
      old.close(4409, 'replaced');
    }
    seat.ws = ws;
    conn.room = room;
    conn.role = msg.role;
    const joined = room.core.presence(msg.role, true);
    if (joined) broadcast(room, joined, ws);
    send(ws, room.core.welcome(msg.role));
    const moved = room.moved?.[msg.role];
    if (moved) send(ws, { t: 'moved', ...moved });
    log(`room ${room.code}: ${msg.role} joined`);
  }

  wss.on('connection', (ws) => {
    const conn: Conn = { alive: true, room: null, role: null, bucket: MAX_MSGS_PER_SEC, bucketAt: now() };
    conns.set(ws, conn);
    const helloTimer = setTimeout(() => {
      if (!conn.room) ws.close(4408, 'hello-timeout');
    }, 10_000);
    ws.on('pong', () => (conn.alive = true));
    ws.on('close', () => {
      clearTimeout(helloTimer);
      detach(ws);
    });
    ws.on('error', () => ws.terminate());
    ws.on('message', (data) => {
      conn.alive = true;
      const t = now();
      conn.bucket = Math.min(MAX_MSGS_PER_SEC, conn.bucket + ((t - conn.bucketAt) / 1000) * MAX_MSGS_PER_SEC);
      conn.bucketAt = t;
      if (conn.bucket < 1) return;
      conn.bucket -= 1;

      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      try {
        handle(msg);
      } catch (err) {
        log(`message failed: ${(err as Error).message}`);
        send(ws, { t: 'error', code: 'bad-request', message: 'Server could not handle that.' });
      }
    });

    function handle(msg: ClientMsg) {
      switch (msg.t) {
        case 'hello':
          onHello(ws, conn, msg);
          return;
        case 'ping':
          send(ws, { t: 'pong', c: Number(msg.c) || 0, now: now() });
          return;
        case 'sync':
          if (conn.room) send(ws, conn.room.core.snapshot());
          return;
        case 'swap': {
          const room = conn.room;
          const wsA = room?.seats.A.ws;
          const wsB = room?.seats.B.ws;
          if (!room || !wsA || !wsB) {
            send(ws, { t: 'error', code: 'bad-request', message: 'Both phones need to be connected to swap.' });
            return;
          }
          if (!room.moved) {
            const next = createRoom();
            room.moved = { B: claim(next, 'A', false) as ClaimResponse, A: claim(next, 'B', false) as ClaimResponse };
            log(`room ${room.code}: swapped roles into ${next.code}`);
          }
          send(wsB, { t: 'moved', ...room.moved.B! });
          send(wsA, { t: 'moved', ...room.moved.A! });
          return;
        }
        case 'act': {
          if (!conn.room || !conn.role) return;
          const result = conn.room.core.act(msg.a, conn.role, msg.id);
          if (result.kind === 'broadcast') broadcast(conn.room, result.msg);
          else if (result.kind === 'reply') send(ws, result.msg);
          return;
        }
      }
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const conn = conns.get(ws);
      if (!conn) continue;
      if (!conn.alive) {
        ws.terminate();
        continue;
      }
      conn.alive = false;
      ws.ping();
    }
    const t = now();
    for (const [code, room] of rooms) {
      const empty = !room.seats.A.ws && !room.seats.B.ws;
      if (empty && t - room.core.lastActivity > ttl) {
        rooms.delete(code);
        log(`room ${code} expired`);
      }
    }
  }, options.heartbeatMs ?? 20_000);
  heartbeat.unref?.();

  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) return false;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    return true;
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 4096) req.destroy();
      });
      req.on('end', () => {
        try {
          const v = raw ? JSON.parse(raw) : {};
          resolve(v && typeof v === 'object' ? v : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });

  /** Handles /api/* requests. Returns false for everything else. */
  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      await handleApi(req, res, url);
    } catch (err) {
      log(`api failed: ${(err as Error).message}`);
      if (!res.headersSent) json(res, 503, { error: 'unavailable' });
    }
    return true;
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    if (req.method === 'GET' && parts[1] === 'info') {
      json(res, 200, options.info?.() ?? { lan: [], httpPort: null, httpsPort: null });
      return;
    }
    if (parts[1] === 'rooms') {
      if (req.method === 'POST' && parts.length === 2) {
        const body = await readBody(req);
        const role = isRole(body.role) ? body.role : 'A';
        const room = createRoom();
        json(res, 201, claim(room, role, false));
        return;
      }
      const code = parts[2];
      const room = isCode(code) ? rooms.get(code) : undefined;
      if (!room) {
        json(res, 404, { error: 'room-not-found' });
        return;
      }
      if (req.method === 'GET' && parts.length === 3) {
        json(res, 200, roomInfo(room));
        return;
      }
      if (req.method === 'POST' && parts[3] === 'claim') {
        const body = await readBody(req);
        const result = claim(room, isRole(body.role) ? body.role : null, body.takeover === true);
        json(res, 'error' in result ? 409 : 200, result);
        return;
      }
    }
    json(res, 404, { error: 'not-found' });
  }

  return {
    rooms,
    handleUpgrade,
    handleHttp,
    /** Attach to a standalone http(s) server: serves the WebSocket endpoint on the same port. */
    attach(server: { on(event: 'upgrade', cb: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown }) {
      server.on('upgrade', (req, socket, head) => {
        if (!handleUpgrade(req, socket, head)) socket.destroy();
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}

export type Relay = ReturnType<typeof createRelay>;
