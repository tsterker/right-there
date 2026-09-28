/**
 * WebRTC plumbing for no-server mode: one data channel between two devices,
 * set up by exchanging two compact codes (QR or copy/paste) instead of going
 * through a signaling server.
 *
 * By default no STUN/TURN servers are used: on the same Wi-Fi (or a phone's
 * hotspot) the devices reach each other via their local addresses. `stun`
 * adds a public STUN server, which helps some networks but is a hosted service.
 */
import type { Role } from '../../shared/session';
import { buildSdp, decodeSignal, encodeSignal, parseSdp, randomSession, SignalError, type Signal } from './signal';

export interface PeerOptions {
  stun?: boolean;
}

const PUBLIC_STUN: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const createPc = (opts: PeerOptions) => new RTCPeerConnection({ iceServers: opts.stun ? PUBLIC_STUN : [] });

/** Pre-negotiated channel: both sides create it with the same id, no in-band setup needed. */
const createChannel = (pc: RTCPeerConnection) => pc.createDataChannel('right-there', { negotiated: true, id: 0, ordered: true });

/** Codes carry all candidates at once (no trickling), so wait for gathering to finish. */
function gathered(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export class PairingError extends Error {}

function whenOpen(channel: RTCDataChannel, pc: RTCPeerConnection, timeoutMs: number): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    if (channel.readyState === 'open') return resolve(channel);
    const cleanup = () => {
      clearTimeout(timer);
      channel.removeEventListener('open', onOpen);
      pc.removeEventListener('connectionstatechange', onState);
    };
    const fail = (message: string) => {
      cleanup();
      reject(new PairingError(message));
    };
    const onOpen = () => {
      cleanup();
      resolve(channel);
    };
    const onState = () => {
      if (pc.connectionState === 'failed') {
        fail('The devices could not reach each other. Are both on the same Wi-Fi?');
      }
    };
    const timer = setTimeout(() => fail('No connection yet. Are both devices on the same Wi-Fi?'), timeoutMs);
    channel.addEventListener('open', onOpen);
    pc.addEventListener('connectionstatechange', onState);
  });
}

function describe(pc: RTCPeerConnection) {
  const sdp = pc.localDescription?.sdp;
  if (!sdp) throw new PairingError('Could not prepare the connection.');
  const parsed = parseSdp(sdp);
  if (parsed.candidates.length === 0) throw new PairingError('No network found — connect this device to Wi-Fi.');
  return parsed;
}

export interface HostOffer {
  /** Show this to the partner (QR code or copy/paste). */
  code: string;
  session: string;
  channel: RTCDataChannel;
  /** Apply the partner's reply code. Resolves once the devices are connected. */
  accept(reply: string): Promise<RTCDataChannel>;
  close(): void;
}

export async function createOffer(role: Role, opts: PeerOptions = {}): Promise<HostOffer> {
  const pc = createPc(opts);
  const channel = createChannel(pc);
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc, opts.stun ? 3000 : 1500);
  const session = randomSession();
  const code = encodeSignal({ kind: 'offer', role, session, ...describe(pc) });
  let accepted = false;
  return {
    code,
    session,
    channel,
    async accept(reply) {
      const s = decodeSignal(reply);
      if (s.kind !== 'answer') throw new SignalError('That is a first code. Scan the code the other device shows after it scanned yours.');
      if (s.session !== session) throw new SignalError('That code belongs to an older pairing — scan the one on screen now.');
      if (!accepted) {
        accepted = true;
        await pc.setRemoteDescription({ type: 'answer', sdp: buildSdp(s) });
      }
      return whenOpen(channel, pc, 20_000);
    },
    close() {
      channel.close();
      pc.close();
    },
  };
}

export interface GuestAnswer {
  /** Show this back to the host. */
  code: string;
  offer: Signal;
  channel: RTCDataChannel;
  opened: Promise<RTCDataChannel>;
  close(): void;
}

export async function createAnswer(offerCode: string, opts: PeerOptions = {}): Promise<GuestAnswer> {
  const offer = decodeSignal(offerCode);
  if (offer.kind !== 'offer') throw new SignalError('This code is meant for the other device — scan the first code instead.');
  const pc = createPc(opts);
  const channel = createChannel(pc);
  await pc.setRemoteDescription({ type: 'offer', sdp: buildSdp(offer) });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc, opts.stun ? 3000 : 1500);
  const code = encodeSignal({ kind: 'answer', role: offer.role, session: offer.session, ...describe(pc) });
  return {
    code,
    offer,
    channel,
    opened: whenOpen(channel, pc, 5 * 60_000),
    close() {
      channel.close();
      pc.close();
    },
  };
}

export const peerSupported = () => typeof RTCPeerConnection === 'function';
