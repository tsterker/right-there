import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createRelay } from '../server/relay';
import type { ClaimResponse, ServerMsg } from '../src/shared/protocol';
import { reduce, type SessionState } from '../src/shared/session';

let server: http.Server;
let base: string;
const relay = createRelay({ heartbeatMs: 60_000 });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    relay.handleHttp(req, res).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.end();
      }
    });
  });
  relay.attach(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  relay.close();
  server.close();
});

const post = async (path: string, body: unknown) => {
  const res = await fetch(`http://${base}${path}`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as ClaimResponse & { error?: string } };
};

/** A phone: keeps its own replica of the state exactly like the real client does. */
class Phone {
  ws: WebSocket;
  state: SessionState | null = null;
  seq = 0;
  errors: string[] = [];
  moved: ClaimResponse | null = null;
  private waiters: { pred: () => boolean; resolve: () => void }[] = [];

  constructor(claim: ClaimResponse) {
    this.ws = new WebSocket(`ws://${base}/ws`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'hello', code: claim.code, role: claim.role, token: claim.token })));
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as ServerMsg;
      if (msg.t === 'welcome' || msg.t === 'snapshot') {
        this.state = msg.state;
        this.seq = msg.seq;
      } else if (msg.t === 'act' && this.state) {
        expect(msg.seq).toBe(this.seq + 1);
        this.state = reduce(this.state, msg.a, { from: msg.from, at: msg.at });
        this.seq = msg.seq;
      } else if (msg.t === 'error') {
        this.errors.push(msg.code);
      } else if (msg.t === 'moved') {
        this.moved = msg;
      }
      this.check();
    });
    this.ws.on('close', () => this.check());
  }

  private check() {
    this.waiters = this.waiters.filter((w) => {
      if (!w.pred()) return true;
      w.resolve();
      return false;
    });
  }

  until(pred: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 3000);
      this.waiters.push({
        pred,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
      this.check();
    });
  }

  act(a: unknown) {
    this.ws.send(JSON.stringify({ t: 'act', a }));
  }

  close() {
    this.ws.close();
  }
}

describe('relay', () => {
  it('pairs two phones by code and keeps their state identical', async () => {
    const created = await post('/api/rooms', { role: 'B' });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^\d{4}$/);
    expect(created.body.role).toBe('B');
    const joined = await post(`/api/rooms/${created.body.code}/claim`, {});
    expect(joined.body.role).toBe('A');
    expect((await post(`/api/rooms/${created.body.code}/claim`, {})).status).toBe(409);

    const b = new Phone(created.body);
    const a = new Phone(joined.body);
    await a.until(() => a.state?.phase === 'checkin');
    await b.until(() => b.state?.phase === 'checkin');

    a.act({ type: 'marker.add', kind: 'knot', pos: { x: 12, y: 2 } });
    b.act({ type: 'phase', phase: 'live' });
    a.act({ type: 'target', pos: { x: 10, y: 5 }, active: true, source: 'nudge', from: { x: 8, y: 5 } });
    a.act({ type: 'feedback', kind: 'firmer' });
    b.act({ type: 'feedback', kind: 'softer' }); // not allowed for the giver
    await a.until(() => a.state?.feedback.length === 1);
    await b.until(() => b.state?.feedback.length === 1 && b.errors.includes('bad-request'));

    expect(a.state).toEqual(b.state);
    expect(a.state).toEqual(relay.rooms.get(created.body.code)!.core.state);
    expect(a.state!.target?.pos).toEqual({ x: 10, y: 5 });
    expect(a.state!.pressure).toBe(4);
    a.close();
    b.close();
  });

  it('lets a phone reconnect with its token and sends a fresh snapshot', async () => {
    const created = await post('/api/rooms', { role: 'A' });
    const joined = await post(`/api/rooms/${created.body.code}/claim`, { role: 'B' });
    const a = new Phone(created.body);
    const b = new Phone(joined.body);
    await a.until(() => a.state?.members.B.connected === true);

    b.close();
    await a.until(() => a.state?.members.B.connected === false);
    a.act({ type: 'marker.add', kind: 'sore', pos: { x: 5, y: 40 } });

    const b2 = new Phone(joined.body);
    await b2.until(() => b2.state?.markers.length === 1);
    await a.until(() => a.state?.members.B.connected === true);
    expect(b2.state).toEqual(a.state);
    a.close();
    b2.close();
  });

  it('applies a resent action only once and reports what was applied', async () => {
    const created = await post('/api/rooms', { role: 'A' });
    const joined = await post(`/api/rooms/${created.body.code}/claim`, { role: 'B' });
    const a = new Phone(created.body);
    const b = new Phone(joined.body);
    await b.until(() => b.state?.phase === 'checkin');
    const feedback = { type: 'feedback', kind: 'firmer' };
    a.ws.send(JSON.stringify({ t: 'act', a: feedback, id: 'x-1' }));
    a.ws.send(JSON.stringify({ t: 'act', a: feedback, id: 'x-1' })); // resend after a flaky moment
    a.ws.send(JSON.stringify({ t: 'act', a: feedback, id: 'x-2' }));
    await b.until(() => b.state?.feedback.length === 2);
    await new Promise((r) => setTimeout(r, 50));
    expect(b.state!.feedback).toHaveLength(2);
    a.close();
    // On reconnect the welcome lists what this seat already got through.
    const welcome = await new Promise<ServerMsg>((resolve) => {
      const ws = new WebSocket(`ws://${base}/ws`);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', code: created.body.code, role: 'A', token: created.body.token })));
      ws.on('message', (d) => {
        resolve(JSON.parse(String(d)));
        ws.close();
      });
    });
    expect(welcome.t === 'welcome' && welcome.acked).toEqual(['x-1', 'x-2']);
    b.close();
  });

  it('moves a phone that reconnects after a swap it missed', async () => {
    const created = await post('/api/rooms', { role: 'A' });
    const joined = await post(`/api/rooms/${created.body.code}/claim`, {});
    const a = new Phone(created.body);
    const b = new Phone(joined.body);
    await a.until(() => a.state?.phase === 'checkin');
    await b.until(() => b.state?.phase === 'checkin');
    b.ws.send(JSON.stringify({ t: 'swap' }));
    await b.until(() => b.moved != null);
    // A's phone was asleep and missed it; when it reconnects to the old room it is sent along.
    a.close();
    const again = new Phone(created.body);
    await again.until(() => again.moved != null);
    expect(again.moved!.code).toBe(b.moved!.code);
    expect(again.moved!.role).toBe('B');
    b.close();
    again.close();
  });

  it('rejects unknown rooms and wrong tokens', async () => {
    const created = await post('/api/rooms', { role: 'A' });
    const bad = new Phone({ ...created.body, token: 'nope' });
    await bad.until(() => bad.errors.includes('bad-token'));
    const missing = new Phone({ code: '0000' === created.body.code ? '0001' : '0000', role: 'A', token: 'x' });
    await missing.until(() => missing.errors.length > 0);
    expect(missing.errors[0]).toBe('room-not-found');
    expect((await fetch(`http://${base}/api/rooms/abcd`)).status).toBe(404);
  });

  it('swaps roles into a fresh session', async () => {
    const created = await post('/api/rooms', { role: 'A' });
    const joined = await post(`/api/rooms/${created.body.code}/claim`, {});
    const a = new Phone(created.body);
    const b = new Phone(joined.body);
    await a.until(() => a.state?.phase === 'checkin');
    await b.until(() => b.state?.phase === 'checkin');
    a.ws.send(JSON.stringify({ t: 'swap' }));
    await a.until(() => a.moved != null);
    await b.until(() => b.moved != null);
    expect(a.moved!.code).toBe(b.moved!.code);
    expect(a.moved!.code).not.toBe(created.body.code);
    expect(a.moved!.role).toBe('B');
    expect(b.moved!.role).toBe('A');
    const a2 = new Phone(a.moved!);
    const b2 = new Phone(b.moved!);
    await a2.until(() => a2.state?.phase === 'checkin');
    await b2.until(() => b2.state?.phase === 'checkin');
    [a, b, a2, b2].forEach((p) => p.close());
  });

  it('allows taking over a disconnected seat, not a connected one', async () => {
    const created = await post('/api/rooms', { role: 'A' });
    const code = created.body.code;
    const a = new Phone(created.body);
    await a.until(() => a.state?.members.A.connected === true);
    expect((await post(`/api/rooms/${code}/claim`, { role: 'A', takeover: true })).status).toBe(409);
    a.close();
    await new Promise((r) => setTimeout(r, 50));
    const again = await post(`/api/rooms/${code}/claim`, { role: 'A', takeover: true });
    expect(again.status).toBe(200);
    const info = await (await fetch(`http://${base}/api/rooms/${code}`)).json();
    expect(info.seats.A.claimed).toBe(true);
  });
});
