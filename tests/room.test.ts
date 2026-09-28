import { afterEach, describe, expect, it } from 'vitest';
import { Room } from '../src/shared/room';
import { SessionConnection } from '../src/client/lib/connection';
import { ChannelLink, PeerHost } from '../src/client/p2p/host';

describe('Room', () => {
  it('numbers actions and rejects what a role may not send', () => {
    const room = new Room('1234', () => 100);
    const ok = room.act({ type: 'good' }, 'A');
    expect(ok).toMatchObject({ kind: 'broadcast', msg: { t: 'act', seq: 1, from: 'A', at: 100 } });
    expect(room.act({ type: 'good' }, 'B')).toMatchObject({ kind: 'reply', msg: { t: 'error' } });
    expect(room.seq).toBe(1);
  });

  it('applies a resent action only once and reports it in the welcome', () => {
    const room = new Room('1234', () => 0);
    room.act({ type: 'good' }, 'A', 'x-1');
    expect(room.act({ type: 'good' }, 'A', 'x-1')).toEqual({ kind: 'none' });
    expect(room.state.good?.id).toBe('g1');
    expect(room.welcome('A')).toMatchObject({ t: 'welcome', acked: ['x-1'], seq: 1 });
  });

  it('reports presence changes once', () => {
    const room = new Room('1234', () => 0);
    expect(room.presence('B', true)).not.toBeNull();
    expect(room.presence('B', true)).toBeNull();
  });
});

/** In-memory stand-in for the two ends of an RTCDataChannel. */
class FakeChannel {
  readyState: RTCDataChannelState = 'open';
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  peer!: FakeChannel;
  send(data: string) {
    const peer = this.peer;
    queueMicrotask(() => peer.readyState === 'open' && peer.onmessage?.({ data }));
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    queueMicrotask(() => {
      this.onclose?.();
      if (this.peer.readyState !== 'closed') {
        this.peer.readyState = 'closed';
        this.peer.onclose?.();
      }
    });
  }
}

const channelPair = () => {
  const a = new FakeChannel();
  const b = new FakeChannel();
  a.peer = b;
  b.peer = a;
  return [a as unknown as RTCDataChannel, b as unknown as RTCDataChannel] as const;
};

const settle = () => new Promise((r) => setTimeout(r, 5));

describe('PeerHost + SessionConnection', () => {
  const open: SessionConnection[] = [];
  afterEach(() => {
    open.splice(0).forEach((c) => c.stop());
  });

  /** The giver's device hosts; the receiver's joins over a (fake) data channel. */
  async function pair() {
    const host = new PeerHost('B');
    const giver = new SessionConnection(host.code, host.role, host.localLink());
    const link = new ChannelLink();
    const receiver = new SessionConnection('', 'A', link);
    open.push(giver, receiver);
    giver.start();
    const connect = () => {
      const [h, g] = channelPair();
      host.attachPartner(h);
      link.use(g);
      return g;
    };
    const channel = connect();
    receiver.start();
    await settle();
    return { host, giver, receiver, channel, connect };
  }

  it('connects both devices and keeps their copies equal', async () => {
    const { giver, receiver } = await pair();
    expect(receiver.getSnapshot()).toMatchObject({ status: 'online', role: 'A' });
    expect(giver.getSnapshot().state!.members).toEqual({ A: { connected: true, joined: true }, B: { connected: true, joined: true } });

    receiver.dispatch({ type: 'target', pos: { x: 5, y: 20 }, active: false, source: 'nudge', from: { x: 0, y: 18 } });
    receiver.dispatch({ type: 'good' });
    await settle();
    giver.dispatch({ type: 'target', pos: { x: 6, y: 21 }, active: false, source: 'anchor', from: null });
    await settle();
    expect(giver.getSnapshot().state!.good?.pos).toEqual({ x: 5, y: 20 });
    expect(receiver.getSnapshot().state!.target).toMatchObject({ pos: { x: 6, y: 21 }, by: 'B' });
    expect(receiver.getSnapshot().state).toEqual(giver.getSnapshot().state);
  });

  it('delivers a "right there" made while disconnected once the devices re-pair', async () => {
    const { giver, receiver, channel, connect } = await pair();
    channel.close();
    await settle();
    expect(receiver.getSnapshot().status).toBe('reconnecting');
    expect(giver.getSnapshot().state!.members.A.connected).toBe(false);

    receiver.dispatch({ type: 'good' });
    connect();
    await settle();
    expect(receiver.getSnapshot().status).toBe('online');
    expect(giver.getSnapshot().state!.good?.id).toBe('g1');
    expect(receiver.getSnapshot().state).toEqual(giver.getSnapshot().state);
  });

  it('does not apply an action twice when only its confirmation was lost', async () => {
    const { giver, receiver, channel, connect } = await pair();
    receiver.dispatch({ type: 'good' });
    channel.close(); // the host gets the action, the echo never arrives
    await settle();
    connect();
    await settle();
    expect(giver.getSnapshot().state!.nextId).toBe(2);
    expect(receiver.getSnapshot().state!.good?.id).toBe('g1');
  });

  it('swaps roles on the same link with a fresh session', async () => {
    const { host, giver, receiver } = await pair();
    receiver.dispatch({ type: 'target', pos: { x: 5, y: 20 }, active: false, source: 'map' });
    await settle();
    receiver.swapRoles();
    await settle();
    expect(host.role).toBe('A');
    expect(giver.getSnapshot()).toMatchObject({ role: 'A', status: 'online' });
    expect(receiver.getSnapshot()).toMatchObject({ role: 'B', status: 'online' });
    expect(giver.getSnapshot().state!.target).toBeNull();

    giver.dispatch({ type: 'target', pos: { x: -4, y: 30 }, active: false, source: 'nudge' });
    await settle();
    expect(receiver.getSnapshot().state!.target).toMatchObject({ pos: { x: -4, y: 30 }, by: 'A' });
  });
});
