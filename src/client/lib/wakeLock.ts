/**
 * Keep the screen on during a session: both phones lie or stand around
 * untouched for minutes. Uses the Wake Lock API where available (HTTPS or
 * localhost) and NoSleep's silent-video trick elsewhere.
 */
import NoSleep from 'nosleep.js';
import { useEffect, useSyncExternalStore } from 'react';

export type AwakeState = 'off' | 'on' | 'unsupported';

let noSleep: NoSleep | null = null;
let state: AwakeState = 'off';
const listeners = new Set<() => void>();
const setState = (s: AwakeState) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Must be called from a user gesture (tap/click). */
export async function keepAwake(): Promise<AwakeState> {
  if (state === 'on' && noSleep?.isEnabled) return state;
  try {
    noSleep ??= new NoSleep();
    await noSleep.enable();
    setState('on');
  } catch {
    setState('unsupported');
  }
  return state;
}

export function releaseAwake() {
  noSleep?.disable();
  setState('off');
}

export function useAwakeState(): AwakeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Enable the wake lock on the next user gesture while mounted. */
export function useKeepAwake() {
  useEffect(() => {
    const onGesture = () => {
      if (state !== 'on') void keepAwake();
    };
    const events = ['click', 'touchend'] as const;
    events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }));
    // NoSleep re-acquires native wake locks by itself; its video fallback gets paused while the
    // page is hidden, so re-arm it on the next tap.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !('wakeLock' in navigator) && state === 'on') setState('off');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onGesture));
      document.removeEventListener('visibilitychange', onVisible);
      releaseAwake();
    };
  }, []);
}

export const secureContextHint = () =>
  window.isSecureContext
    ? null
    : 'This page is not on HTTPS, so the browser may not keep the screen on. Use the https:// link from the server output, or set Auto-Lock to "Never" for this session.';
