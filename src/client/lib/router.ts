import { useSyncExternalStore } from 'react';
import type { Role } from '../../shared/session';
import { DEMO_EXIT, inDemo } from './demo';

const isRole = (v: unknown): v is Role => v === 'A' || v === 'B';

export type Route =
  | { name: 'home' }
  | { name: 'host'; role: Role }
  | { name: 'join'; code: string }
  | { name: 'scan' }
  | { name: 'demo' }
  | { name: 'demo-join' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'p2p') {
    if (parts[1] === 'host' && isRole(parts[2])) return { name: 'host', role: parts[2] };
    if (parts[1] === 'join' && parts[2] && /^[A-Za-z0-9_-]+$/.test(parts[2])) return { name: 'join', code: parts[2] };
    if (parts[1] === 'scan') return { name: 'scan' };
    if (parts[1] === 'demo-join') return { name: 'demo-join' };
  }
  if (parts[0] === 'demo') return { name: 'demo' };
  return { name: 'home' };
}

export function navigate(path: string, replace = false) {
  // Leaving from inside the demo leaves the whole demo.
  if (inDemo && path === '/') {
    window.parent.postMessage(DEMO_EXIT, '*');
    return;
  }
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
