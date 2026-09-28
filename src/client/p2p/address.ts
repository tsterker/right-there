/**
 * Where the other device can open this app, so that scanning the first QR
 * code with its camera opens Right There straight into pairing.
 */
import { persisted } from '../lib/storage';

export interface P2PSettings {
  /** Use a public STUN server (helps on some networks; it is a hosted service). */
  stun: boolean;
}

export const p2pSettings = persisted<P2PSettings>('mb.p2p', { stun: false });

/** Set by the dev server: its address on the Wi-Fi, or the tunnel of `npm run dev:phone`. */
declare const __DEV_APP_URL__: string | undefined;

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Baked into builds, for pages opened from disk (file://). */
const BUILT_IN = ((import.meta.env.VITE_APP_URL as string | undefined) ?? '').trim();

export function appAddress(): string | null {
  const web = location.protocol === 'https:' || location.protocol === 'http:';
  if (web && !LOCAL.has(location.hostname)) return `${location.origin}${location.pathname}`;
  if (web && typeof __DEV_APP_URL__ === 'string' && __DEV_APP_URL__) return __DEV_APP_URL__;
  return BUILT_IN || null;
}

/** What the first QR code contains: a link that opens the app, or just the code. */
export function joinLink(code: string): { text: string; isLink: boolean } {
  const base = appAddress();
  return base ? { text: `${base}#/p2p/join/${code}`, isLink: true } : { text: code, isLink: false };
}
