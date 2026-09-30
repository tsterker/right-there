/**
 * Compact WebRTC signaling for QR codes.
 *
 * A browser's SDP is ~1–2 KB, too dense for a comfortable QR code. For a
 * single data channel only a few fields matter: ICE credentials, the DTLS
 * certificate fingerprint, the DTLS role and the candidates. We pack those
 * into ~100–180 bytes (base64url) and rebuild a standard SDP on the other side.
 *
 * Binary layout (version 1), all integers big-endian:
 *   u8   version<<4 | kind<<3 | role<<2 | setup
 *   u32  session id
 *   u8+  ice-ufrag (length + ASCII)
 *   u8+  ice-pwd   (length + ASCII)
 *   32   sha-256 fingerprint
 *   u8   candidate count, then per candidate:
 *        u8 type<<6 | family<<3, address bytes, u16 port
 *   u16  checksum (Fletcher-16 over everything before it)
 */
import type { Role } from '../../shared/session';

export type SignalKind = 'offer' | 'answer';
export type Setup = 'actpass' | 'active' | 'passive';
export type CandidateType = 'host' | 'srflx' | 'relay' | 'prflx';

export interface Candidate {
  type: CandidateType;
  address: string;
  port: number;
}

export interface Signal {
  kind: SignalKind;
  /** Offers: the host's role (the partner takes the other one). */
  role: Role;
  /** Identifies one pairing attempt (8 hex chars); the answer echoes it. */
  session: string;
  setup: Setup;
  ufrag: string;
  pwd: string;
  /** sha-256 fingerprint as 32 bytes. */
  fingerprint: Uint8Array;
  candidates: Candidate[];
}

export class SignalError extends Error {}

const VERSION = 1;
const MAX_CANDIDATES = 6;
const SETUPS: Setup[] = ['actpass', 'active', 'passive'];
const TYPES: CandidateType[] = ['host', 'srflx', 'relay', 'prflx'];
const FAMILY = { mdns: 0, ipv4: 1, ipv6: 2, name: 3 } as const;
const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// ---------------------------------------------------------------------------
// SDP → fields

export function parseSdp(sdp: string): Pick<Signal, 'setup' | 'ufrag' | 'pwd' | 'fingerprint' | 'candidates'> {
  let ufrag = '';
  let pwd = '';
  let setup: Setup = 'actpass';
  let fingerprint: Uint8Array | null = null;
  const candidates: (Candidate & { priority: number })[] = [];
  for (const raw of sdp.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('a=ice-ufrag:')) ufrag = line.slice(12);
    else if (line.startsWith('a=ice-pwd:')) pwd = line.slice(10);
    else if (line.startsWith('a=setup:')) {
      const v = line.slice(8) as Setup;
      if (SETUPS.includes(v)) setup = v;
    } else if (line.toLowerCase().startsWith('a=fingerprint:sha-256 ')) {
      fingerprint = hexToBytes(line.slice(22).trim());
    } else if (line.startsWith('a=candidate:')) {
      const parts = line.slice(2).split(/\s+/);
      // candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> ...
      if (parts.length < 8 || parts[1] !== '1' || parts[2].toLowerCase() !== 'udp' || parts[6] !== 'typ') continue;
      const type = parts[7] as CandidateType;
      if (!TYPES.includes(type)) continue;
      const port = Number(parts[5]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      candidates.push({ type, address: parts[4], port, priority: Number(parts[3]) || 0 });
    }
  }
  if (!ufrag || !pwd) throw new SignalError('Connection details are incomplete (no ICE credentials).');
  if (!fingerprint || fingerprint.length !== 32) throw new SignalError('Connection details are incomplete (no sha-256 fingerprint).');
  const seen = new Set<string>();
  const unique = candidates
    .sort((a, b) => b.priority - a.priority)
    .filter((c) => {
      const key = `${c.address}:${c.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES)
    .map(({ type, address, port }) => ({ type, address, port }));
  return { ufrag, pwd, setup, fingerprint, candidates: unique };
}

// ---------------------------------------------------------------------------
// fields → SDP (a minimal, standard data-channel description)

const TYPE_PREF: Record<CandidateType, number> = { host: 126, prflx: 110, srflx: 100, relay: 0 };

export function buildSdp(s: Signal): string {
  const lines = [
    'v=0',
    `o=- ${parseInt(s.session, 16) || 1} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${s.ufrag}`,
    `a=ice-pwd:${s.pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${bytesToHex(s.fingerprint)}`,
    `a=setup:${s.setup}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    ...s.candidates.map((c, i) => {
      const priority = TYPE_PREF[c.type] * 2 ** 24 + (65535 - i) * 256 + 255;
      const rel = c.type === 'host' ? '' : ' raddr 0.0.0.0 rport 0';
      return `a=candidate:${i + 1} 1 udp ${priority} ${c.address} ${c.port} typ ${c.type}${rel} generation 0`;
    }),
    'a=end-of-candidates',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// fields ⇄ compact text

export function encodeSignal(s: Signal): string {
  const out: number[] = [];
  const u8 = (v: number) => out.push(v & 0xff);
  const u16 = (v: number) => out.push((v >> 8) & 0xff, v & 0xff);
  const str = (v: string) => {
    const bytes = new TextEncoder().encode(v);
    if (bytes.length > 255) throw new SignalError('Field too long.');
    u8(bytes.length);
    out.push(...bytes);
  };
  u8((VERSION << 4) | ((s.kind === 'answer' ? 1 : 0) << 3) | ((s.role === 'B' ? 1 : 0) << 2) | SETUPS.indexOf(s.setup));
  const session = hexToBytes(s.session.padStart(8, '0').slice(-8));
  out.push(...session);
  str(s.ufrag);
  str(s.pwd);
  out.push(...s.fingerprint);
  const cands = s.candidates.slice(0, MAX_CANDIDATES);
  u8(cands.length);
  for (const c of cands) {
    const address = addressBytes(c.address);
    u8((TYPES.indexOf(c.type) << 6) | (address.family << 3));
    if (address.family === FAMILY.name) u8(address.bytes.length);
    out.push(...address.bytes);
    u16(c.port);
  }
  u16(fletcher16(out));
  return toBase64Url(Uint8Array.from(out));
}

export function decodeSignal(input: string): Signal {
  const code = extractCode(input);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(code);
  } catch {
    throw new SignalError('That is not a Right There code.');
  }
  if (bytes.length < 44) throw new SignalError('That code is incomplete.');
  const body = bytes.subarray(0, bytes.length - 2);
  const sum = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  if (fletcher16(Array.from(body)) !== sum) throw new SignalError('That code was not read completely — try again.');
  let i = 0;
  const need = (n: number) => {
    if (i + n > body.length) throw new SignalError('That code is incomplete.');
  };
  const u8 = () => (need(1), body[i++]);
  const take = (n: number) => (need(n), body.slice(i, (i += n)));
  const str = () => new TextDecoder().decode(take(u8()));
  const head = u8();
  if (head >> 4 !== VERSION) throw new SignalError('This code is from a different version of Right There.');
  const kind: SignalKind = (head >> 3) & 1 ? 'answer' : 'offer';
  const role: Role = (head >> 2) & 1 ? 'B' : 'A';
  const setup = SETUPS[head & 3] ?? 'actpass';
  const session = bytesToHex(take(4), '').toLowerCase();
  const ufrag = str();
  const pwd = str();
  const fingerprint = take(32);
  const count = u8();
  const candidates: Candidate[] = [];
  for (let n = 0; n < count; n++) {
    const h = u8();
    const type = TYPES[h >> 6];
    const family = (h >> 3) & 3;
    const address =
      family === FAMILY.mdns
        ? mdnsFromBytes(take(16))
        : family === FAMILY.ipv4
          ? Array.from(take(4)).join('.')
          : family === FAMILY.ipv6
            ? ipv6FromBytes(take(16))
            : new TextDecoder().decode(take(u8()));
    const port = (u8() << 8) | u8();
    candidates.push({ type, address, port });
  }
  return { kind, role, session, setup, ufrag, pwd, fingerprint, candidates };
}

/** Accepts a raw code or a URL that contains one (e.g. from a scanned QR code). */
export function extractCode(input: string): string {
  const text = input.trim();
  const m = /\/p2p\/(?:join|reply)\/([A-Za-z0-9_-]+)/.exec(text);
  if (m) return m[1];
  const bare = /^[A-Za-z0-9_-]+$/.exec(text);
  if (bare) return text;
  // Pasted from a message: the longest code-like run of characters.
  const runs = text.match(/[A-Za-z0-9_-]{40,}/g);
  if (runs) return runs.reduce((a, b) => (b.length > a.length ? b : a));
  throw new SignalError('That is not a Right There code.');
}

// ---------------------------------------------------------------------------
// helpers

function addressBytes(address: string): { family: number; bytes: number[] } {
  const mdns = MDNS.exec(address);
  if (mdns) return { family: FAMILY.mdns, bytes: Array.from(hexToBytes(mdns.slice(1).join(''))) };
  const v4 = IPV4.exec(address);
  if (v4) return { family: FAMILY.ipv4, bytes: v4.slice(1).map(Number) };
  const v6 = address.includes(':') ? ipv6ToBytes(address) : null;
  if (v6) return { family: FAMILY.ipv6, bytes: v6 };
  return { family: FAMILY.name, bytes: Array.from(new TextEncoder().encode(address)) };
}

function mdnsFromBytes(b: Uint8Array): string {
  const h = bytesToHex(b, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`;
}

function ipv6ToBytes(address: string): number[] | null {
  const plain = address.split('%')[0];
  const halves = plain.split('::');
  if (halves.length > 2) return null;
  const groups = (part: string) => (part ? part.split(':') : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const all = [...head, ...Array<string>(missing).fill('0'), ...tail];
  const bytes: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push(v >> 8, v & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function ipv6FromBytes(b: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((b[i] << 8) | b[i + 1]).toString(16));
  return groups.join(':');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array, sep = ':'): string {
  return Array.from(b, (v) => v.toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

function fletcher16(data: ArrayLike<number>): number {
  let a = 0;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 255;
    b = (b + a) % 255;
  }
  return (b << 8) | a;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((v) => (bin += String.fromCharCode(v)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomSession(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return bytesToHex(b, '').toLowerCase();
}
