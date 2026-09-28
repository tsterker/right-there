import { useSyncExternalStore } from 'react';
import type { Role } from '../../shared/session';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or disabled: the app still works for this session
  }
}

const tokenKey = (code: string, role: Role) => `mb.tok.${code}.${role}`;
export const saveToken = (code: string, role: Role, token: string) => {
  saveJSON(tokenKey(code, role), { token, at: Date.now() });
  saveJSON('mb.last', { code, role, at: Date.now() });
};
export const loadToken = (code: string, role: Role): string | null =>
  loadJSON<{ token: string | null }>(tokenKey(code, role), { token: null }).token;

export interface LastSession {
  code: string | null;
  role: Role | null;
  at: number;
}
export const loadLastSession = () => loadJSON<LastSession>('mb.last', { code: null, role: null, at: 0 });

/**
 * A tiny persisted store: localStorage-backed value shared by all components
 * on the page (and kept in sync across tabs via the storage event).
 */
export function persisted<T extends object>(key: string, defaults: T) {
  let value = loadJSON<T>(key, defaults);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  window.addEventListener('storage', (e) => {
    if (e.key === key) {
      value = loadJSON<T>(key, defaults);
      emit();
    }
  });
  const store = {
    get: () => value,
    set(update: Partial<T> | ((v: T) => T)) {
      value = typeof update === 'function' ? update(value) : { ...value, ...update };
      saveJSON(key, value);
      emit();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
  return store;
}

export type Persisted<T extends object> = ReturnType<typeof persisted<T>>;

export function usePersisted<T extends object>(store: Persisted<T>): [T, Persisted<T>['set']] {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return [value, store.set];
}
