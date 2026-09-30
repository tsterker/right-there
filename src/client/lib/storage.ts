import { useSyncExternalStore } from 'react';
import { inDemo } from './demo';

/** The demo keeps its settings in memory, away from this device's own. */
const memoryOnly = inDemo;

export function loadJSON<T>(key: string, fallback: T): T {
  if (memoryOnly) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  if (memoryOnly) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or disabled: the app still works for this session
  }
}

/**
 * A tiny persisted store: localStorage-backed value shared by all components
 * on the page (and kept in sync across tabs via the storage event).
 */
/** `save`: whether a change is saved right now (else it stays in memory). */
export function persisted<T extends object>(key: string, defaults: T, save: () => boolean = () => true) {
  let value = loadJSON<T>(key, defaults);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  window.addEventListener('storage', (e) => {
    if (e.key === key && !memoryOnly) {
      value = loadJSON<T>(key, defaults);
      emit();
    }
  });
  const store = {
    get: () => value,
    set(update: Partial<T> | ((v: T) => T)) {
      value = typeof update === 'function' ? update(value) : { ...value, ...update };
      if (save()) saveJSON(key, value);
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
