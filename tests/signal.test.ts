import { describe, expect, it } from 'vitest';
import { buildSdp, decodeSignal, encodeSignal, extractCode, parseSdp, SignalError, type Signal } from '../src/client/p2p/signal';

const CHROME_OFFER = [
  'v=0',
  'o=- 7197373442389043224 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 60000 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:2999745851 1 udp 2122260223 d8b1a6f2-3b1c-4a57-9f3e-1a2b3c4d5e6f.local 60000 typ host generation 0 network-id 1 network-cost 10',
  'a=candidate:3480209263 1 udp 2122194687 0b4f2a9e-7c6d-4e1f-8a2b-3c4d5e6f7a8b.local 60001 typ host generation 0 network-id 2 network-cost 10',
  'a=candidate:4234997325 1 tcp 1518280447 d8b1a6f2-3b1c-4a57-9f3e-1a2b3c4d5e6f.local 9 typ host tcptype active generation 0 network-id 1',
  'a=candidate:842163049 1 udp 1686052607 203.0.113.7 60000 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1 network-cost 10',
  'a=ice-ufrag:EsAw',
  'a=ice-pwd:bP+XJMM09aR8AiX1jdukzR6Y',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 D7:C5:9F:C4:8E:8A:47:2B:8B:A8:0A:6A:E6:3D:5A:13:31:2A:6D:AF:2C:19:2E:5B:6D:30:8B:6B:70:AA:C0:56',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

/** Firefox puts the fingerprint at session level and writes UDP in capitals. */
const FIREFOX_ANSWER = [
  'v=0',
  'o=mozilla...THIS_IS_SDPARTA-128.0 5024891937826637357 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
  'a=group:BUNDLE 0',
  'a=ice-options:trickle',
  'a=msid-semantic:WMS *',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:0 1 UDP 2122252543 fd7b7b8f-1e2d-4c3b-9a8f-7e6d5c4b3a29.local 50323 typ host',
  'a=candidate:1 1 UDP 2122187007 2001:db8::1:2 50324 typ host',
  'a=sendrecv',
  'a=end-of-candidates',
  'a=ice-pwd:9f8e7d6c5b4a39281706f5e4d3c2b1a0',
  'a=ice-ufrag:1a2b3c4d',
  'a=mid:0',
  'a=setup:active',
  'a=sctp-port:5000',
  'a=max-message-size:1073741823',
  '',
].join('\r\n');

/** Safari (camera permission granted) shows real LAN addresses instead of mDNS names. */
const SAFARI_ANSWER = [
  'v=0',
  'o=- 3521465464187348541 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:9kQ/',
  'a=ice-pwd:qIoKwD4E0ydwYmX4TRuTQ8y5',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF',
  'a=setup:active',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=candidate:1 1 udp 2113937151 192.168.178.52 61021 typ host generation 0',
  '',
].join('\r\n');

const signalFrom = (sdp: string, extra: Partial<Signal>): Signal => ({
  kind: 'offer',
  role: 'A',
  session: '0a1b2c3d',
  ...parseSdp(sdp),
  ...extra,
});

describe('parseSdp', () => {
  it('keeps what a data channel needs and drops TCP candidates', () => {
    const p = parseSdp(CHROME_OFFER);
    expect(p.ufrag).toBe('EsAw');
    expect(p.pwd).toBe('bP+XJMM09aR8AiX1jdukzR6Y');
    expect(p.setup).toBe('actpass');
    expect(p.fingerprint).toHaveLength(32);
    expect(p.candidates.map((c) => c.type)).toEqual(['host', 'host', 'srflx']);
  });

  it('reads Firefox and Safari flavours', () => {
    const ff = parseSdp(FIREFOX_ANSWER);
    expect(ff.setup).toBe('active');
    expect(ff.candidates.map((c) => c.address)).toEqual(['fd7b7b8f-1e2d-4c3b-9a8f-7e6d5c4b3a29.local', '2001:db8::1:2']);
    expect(parseSdp(SAFARI_ANSWER).candidates[0]).toEqual({ type: 'host', address: '192.168.178.52', port: 61021 });
  });

  it('refuses descriptions without credentials', () => {
    expect(() => parseSdp('v=0\r\n')).toThrow(SignalError);
  });
});

describe('compact codes', () => {
  it('round-trips an offer and stays small enough for an easy QR code', () => {
    const s = signalFrom(CHROME_OFFER, { role: 'B' });
    const code = encodeSignal(s);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(200);
    const back = decodeSignal(code);
    expect(back).toEqual({ ...s, fingerprint: back.fingerprint });
    expect(Array.from(back.fingerprint)).toEqual(Array.from(s.fingerprint));
  });

  it('round-trips answers with IPv6 and plain IPv4 addresses', () => {
    const ff = decodeSignal(encodeSignal(signalFrom(FIREFOX_ANSWER, { kind: 'answer' })));
    expect(ff.kind).toBe('answer');
    expect(ff.candidates[1].address).toBe('2001:db8:0:0:0:0:1:2');
    const sa = decodeSignal(encodeSignal(signalFrom(SAFARI_ANSWER, { kind: 'answer' })));
    expect(sa.ufrag).toBe('9kQ/');
    expect(sa.candidates[0].address).toBe('192.168.178.52');
  });

  it('rebuilds an SDP that carries the same essentials', () => {
    const s = decodeSignal(encodeSignal(signalFrom(CHROME_OFFER, {})));
    const sdp = buildSdp(s);
    const again = parseSdp(sdp);
    expect(again.ufrag).toBe(s.ufrag);
    expect(again.pwd).toBe(s.pwd);
    expect(Array.from(again.fingerprint)).toEqual(Array.from(s.fingerprint));
    expect(again.candidates).toEqual(s.candidates);
    expect(sdp).toContain('m=application 9 UDP/DTLS/SCTP webrtc-datachannel');
    expect(sdp).toContain('a=setup:actpass');
    expect(sdp).toMatch(/typ srflx raddr 0\.0\.0\.0 rport 0/);
  });

  it('detects damaged or foreign codes', () => {
    const code = encodeSignal(signalFrom(CHROME_OFFER, {}));
    const damaged = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
    expect(() => decodeSignal(damaged)).toThrow(/not read completely/);
    expect(() => decodeSignal(code.slice(0, 30))).toThrow(SignalError);
    expect(() => decodeSignal('hello world')).toThrow(SignalError);
  });

  it('finds the code inside a scanned link', () => {
    const code = encodeSignal(signalFrom(CHROME_OFFER, {}));
    expect(extractCode(`https://tsterker.github.io/right-there/#/p2p/join/${code}`)).toBe(code);
    expect(decodeSignal(`https://example.org/#/p2p/join/${code}`).ufrag).toBe('EsAw');
    expect(extractCode(`Here's my code:\n${code}\n👍`)).toBe(code);
    expect(extractCode(`Tap to connect: https://tsterker.github.io/right-there/#/p2p/reply/${code}`)).toBe(code);
    expect(() => extractCode('hello there')).toThrow(SignalError);
  });
});
