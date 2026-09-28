import { useSyncExternalStore } from 'react';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
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
