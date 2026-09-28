import { useSyncExternalStore } from 'react';
import { isCode, isRole } from '../../shared/protocol';
import type { Role } from '../../shared/session';

export type Route =
  | { name: 'home' }
  | { name: 'join'; code: string }
  | { name: 'session'; code: string; role: Role }
  | { name: 'demo' }
  | { name: 'history' }
  | { name: 'p2p-host'; role: Role }
  | { name: 'p2p-join'; code: string }
  | { name: 'p2p-scan' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'join' && isCode(parts[1])) return { name: 'join', code: parts[1] };
  if (parts[0] === 's' && isCode(parts[1]) && isRole(parts[2])) return { name: 'session', code: parts[1], role: parts[2] };
  if (parts[0] === 'p2p') {
    if (parts[1] === 'host' && isRole(parts[2])) return { name: 'p2p-host', role: parts[2] };
    if (parts[1] === 'join' && parts[2] && /^[A-Za-z0-9_-]+$/.test(parts[2])) return { name: 'p2p-join', code: parts[2] };
    if (parts[1] === 'scan') return { name: 'p2p-scan' };
  }
  if (parts[0] === 'demo') return { name: 'demo' };
  if (parts[0] === 'history') return { name: 'history' };
  return { name: 'home' };
}

export function navigate(path: string, replace = false) {
  const hash = `#${path}`;
  if (replace) {
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => location.hash);
}

/** Embedded (demo iframe) views hide some chrome. */
export const isEmbedded = new URLSearchParams(location.search).has('embed');
