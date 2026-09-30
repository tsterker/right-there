/**
 * Reply links: the partner sends their reply code as a link (Messages,
 * AirDrop…); tapping it on the host device opens a new tab, which hands the
 * code to the pairing screen waiting in another tab of the same browser.
 *
 * No network: the code goes through localStorage. The waiting tab reads it on
 * the storage event, or when it's shown again, because phones pause
 * background tabs. It only works when the link opens in the browser that shows
 * the pairing screen (not inside a messenger's own browser).
 */
import { appAddress } from './address';

const WAITING = 'mb.pairWaiting';
const REPLY = 'mb.pairReply';
const TAKEN = 'mb.pairTaken';
const FRESH_MS = 30 * 60_000;

interface Entry {
  session: string;
  at: number;
  code?: string;
}

function read(key: string): Entry | null {
  try {
    const e = JSON.parse(localStorage.getItem(key) ?? 'null') as Entry | null;
    return e && typeof e.session === 'string' && Date.now() - e.at < FRESH_MS ? e : null;
  } catch {
    return null;
  }
}

function write(key: string, e: Omit<Entry, 'at'>) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...e, at: Date.now() }));
  } catch {
    // storage disabled: pasting still works
  }
}

const remove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

/** The link to share instead of the bare reply code (null when the app has no public address). */
export function replyLink(code: string): string | null {
  const base = appAddress();
  return base ? `${base}#/p2p/reply/${code}` : null;
}

/** Host: wait for a reply to `session` arriving through a link. Returns a function to stop. */
export function awaitReply(session: string, onReply: (code: string) => void): () => void {
  write(WAITING, { session });
  const check = () => {
    const r = read(REPLY);
    if (r?.session !== session || !r.code) return;
    remove(REPLY);
    onReply(r.code);
  };
  const onStorage = (e: StorageEvent) => e.key === REPLY && check();
  const onShown = () => document.visibilityState === 'visible' && check();
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', onShown);
  check();
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', onShown);
    if (read(WAITING)?.session === session) remove(WAITING);
  };
}

/** Host: the reply connected; lets the link's tab say so. */
export function replyTaken(session: string) {
  write(TAKEN, { session });
}

/** Link tab: hand the code over. False when no pairing screen in this browser waits for it. */
export function handOver(code: string, session: string): boolean {
  if (read(WAITING)?.session !== session) return false;
  write(REPLY, { session, code });
  return true;
}

/** Link tab: `cb` runs once the waiting tab connected with the code. Returns a function to stop. */
export function onTaken(session: string, cb: () => void): () => void {
  const check = () => read(TAKEN)?.session === session && cb();
  const onStorage = (e: StorageEvent) => e.key === TAKEN && check();
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', check);
  check();
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', check);
  };
}
