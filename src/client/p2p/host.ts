/**
 * No-server mode, hosting side. This device runs the session's Room (the
 * same code the relay server runs) and serves two seats: its own screen via
 * an in-page link, and the partner's device via the WebRTC data channel.
 */
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { Room } from '../../shared/room';
import { otherRole, type Role } from '../../shared/session';
import type { Link, LinkHandlers } from '../lib/connection';

type Seat = 'local' | 'remote';

const randomCode = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

export class PeerHost {
  private room: Room;
  private hostRole: Role;
  private toLocal: ((msg: ServerMsg) => void) | null = null;
  private channel: RTCDataChannel | null = null;
  private dispose: (() => void) | null = null;

  constructor(role: Role) {
    this.hostRole = role;
    this.room = new Room(randomCode(), Date.now);
  }

  get code() {
    return this.room.code;
  }

  get role(): Role {
    return this.hostRole;
  }

  get partnerRole(): Role {
    return otherRole(this.hostRole);
  }

  get partnerConnected() {
    return this.channel?.readyState === 'open';
  }

  /** In-page link for this device's own screens. */
  localLink(): Link {
    return {
      autoRetry: false,
      connect: (h: LinkHandlers) => {
        // Asynchronous delivery, like a real connection: avoids re-entrancy in React handlers.
        this.toLocal = (msg) => queueMicrotask(() => h.message(msg));
        queueMicrotask(() => h.open((msg) => this.handle(msg, 'local')));
      },
      close: () => {
        this.toLocal = null;
      },
    };
  }

  /** Use (or replace) the data channel to the partner, after (re-)pairing. `dispose` closes its peer connection. */
  attachPartner(channel: RTCDataChannel, dispose?: () => void) {
    const old = this.channel;
    const oldDispose = this.dispose;
    this.channel = channel;
    this.dispose = dispose ?? null;
    if (old && old !== channel) {
      old.close();
      oldDispose?.();
    }
    channel.onmessage = (e) => {
      if (this.channel !== channel) return;
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.handle(msg, 'remote');
    };
    channel.onclose = () => {
      if (this.channel !== channel) return;
      this.channel = null;
      const left = this.room.presence(this.partnerRole, false);
      if (left) this.send('local', left);
    };
  }

  close() {
    this.channel?.close();
    this.dispose?.();
    this.channel = null;
    this.dispose = null;
  }

  private roleOf(seat: Seat): Role {
    return seat === 'local' ? this.hostRole : this.partnerRole;
  }

  private send(seat: Seat, msg: ServerMsg) {
    if (seat === 'local') this.toLocal?.(msg);
    else if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(msg));
  }

  private both(msg: ServerMsg) {
    this.send('local', msg);
    this.send('remote', msg);
  }

  private handle(msg: ClientMsg, seat: Seat) {
    if (!msg || typeof msg !== 'object') return;
    const role = this.roleOf(seat);
    switch (msg.t) {
      case 'hello': {
        const joined = this.room.presence(role, true);
        if (joined) this.send(seat === 'local' ? 'remote' : 'local', joined);
        this.send(seat, this.room.welcome(role));
        return;
      }
      case 'act': {
        const result = this.room.act(msg.a, role, msg.id);
        if (result.kind === 'broadcast') this.both(result.msg);
        else if (result.kind === 'reply') this.send(seat, result.msg);
        return;
      }
      case 'sync':
        this.send(seat, this.room.snapshot());
        return;
      case 'ping':
        this.send(seat, this.room.pong(msg.c));
        return;
      case 'swap':
        this.swap();
        return;
    }
  }

  /** Same devices, roles reversed, fresh session (each device keeps its own calibration). */
  private swap() {
    if (!this.partnerConnected) return;
    this.hostRole = otherRole(this.hostRole);
    this.room = new Room(randomCode(), Date.now);
    this.room.presence('A', true);
    this.room.presence('B', true);
    this.send('local', this.room.welcome(this.roleOf('local')));
    this.send('remote', this.room.welcome(this.roleOf('remote')));
  }
}

/** Partner side: the session over a data channel that can be replaced after re-pairing. */
export class ChannelLink implements Link {
  readonly autoRetry = false;
  private channel: RTCDataChannel | null = null;
  private dispose: (() => void) | null = null;
  private handlers: LinkHandlers | null = null;

  /** Use (or replace) the data channel to the host. `dispose` closes its peer connection. */
  use(channel: RTCDataChannel, dispose?: () => void) {
    const old = this.channel;
    const oldDispose = this.dispose;
    this.channel = channel;
    this.dispose = dispose ?? null;
    if (old && old !== channel) {
      old.close();
      oldDispose?.();
    }
    channel.onmessage = (e) => {
      if (this.channel !== channel) return;
      try {
        this.handlers?.message(JSON.parse(String(e.data)));
      } catch {
        // ignore malformed messages
      }
    };
    channel.onclose = () => {
      if (this.channel !== channel) return;
      this.channel = null;
      this.handlers?.closed(false);
    };
    if (channel.readyState === 'open') this.announce();
    else channel.onopen = () => this.announce();
  }

  connect(handlers: LinkHandlers) {
    this.handlers = handlers;
    this.announce();
  }

  close() {
    const ch = this.channel;
    this.channel = null;
    ch?.close();
    this.dispose?.();
    this.dispose = null;
  }

  private announce() {
    const ch = this.channel;
    if (!ch || ch.readyState !== 'open' || !this.handlers) return;
    this.handlers.open((msg) => {
      if (ch.readyState === 'open') ch.send(JSON.stringify(msg));
    });
  }
}
