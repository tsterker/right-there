/**
 * Where the other device can open this app, so that scanning the first QR
 * code with its camera opens Right There straight into pairing.
 */
import { getServerInfo } from '../lib/api';
import { persisted } from '../lib/storage';

export interface P2PSettings {
  /** App address for pages opened from a file (file://), e.g. the GitHub Pages URL. */
  appUrl: string;
  /** Use a public STUN server (helps across some networks; it is a hosted service). */
  stun: boolean;
}

export const p2pSettings = persisted<P2PSettings>('mb.p2p', { appUrl: '', stun: false });

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const BUILT_IN = (import.meta.env.VITE_APP_URL as string | undefined) ?? '';

const clean = (url: string) => url.trim().split('#')[0];

export const openedFromFile = () => location.protocol === 'file:';

export async function appAddress(): Promise<string | null> {
  const web = location.protocol === 'https:' || location.protocol === 'http:';
  if (web && !LOCAL.has(location.hostname)) return `${location.origin}${location.pathname}`;
  if (web) {
    // Local dev server: phones need the computer's LAN address, not "localhost".
    const info = await getServerInfo();
    if (info?.lan[0]) return `${location.protocol}//${info.lan[0]}${location.port ? `:${location.port}` : ''}${location.pathname}`;
  }
  const configured = clean(p2pSettings.get().appUrl) || clean(BUILT_IN);
  return configured || null;
}

/** What the first QR code contains: a link that opens the app, or just the code. */
export async function joinLink(code: string): Promise<{ text: string; isLink: boolean }> {
  const base = await appAddress();
  return base ? { text: `${base}#/p2p/join/${code}`, isLink: true } : { text: code, isLink: false };
}
