/**
 * Keep a session on screen: full screen where the browser allows it, and a
 * stray back swipe or tab close doesn't end the session.
 *
 * - Full screen (Android, computers, iPad) needs a tap, so it starts on the
 *   first tap of the session. Phones get it back on the next tap after leaving
 *   it (Android's back gesture leaves full screen first); on a computer,
 *   leaving it (Esc) is a choice and sticks.
 * - iPhone Safari has no full screen for pages; started from the Home Screen,
 *   the app runs without the browser's bars.
 * - Back: an extra history entry with the same address soaks up a back swipe.
 *   Chrome skips entries added without a tap, so it is re-added on the next one.
 * - Closing or reloading the tab asks first (not in dev, which reloads itself).
 */
import { useEffect } from 'react';
import { inDemo } from './demo';
import { deviceSettings } from './settings';

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = document as WebkitDocument;
const current = () => document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

/** The demo's frames can't go full screen (and shouldn't). */
export const fullscreenSupported = !inDemo && !!(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
export const isStandalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Left full screen on a computer: don't push it back on the next click. */
let declined = false;

function enter() {
  if (!fullscreenSupported || current()) return;
  const el = document.documentElement as WebkitElement;
  const asked = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
  // Refused (no tap, or the browser said no): the next tap tries again.
  Promise.resolve(asked).catch(() => {});
}

function leave() {
  if (!current()) return;
  const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document);
  Promise.resolve(exit?.()).catch(() => {});
}

/** The menu's switch: call it from the tap itself, so turning it on goes full screen right away. */
export function setFullscreen(on: boolean) {
  deviceSettings.set({ fullscreen: on });
  declined = false;
  if (on) enter();
  else leave();
}

const GUARD = 'right-there-guard';

/** While a session is on screen. */
export function useStayInSession() {
  useEffect(() => {
    if (inDemo) return;
    const coarse = matchMedia('(pointer: coarse)').matches;
    let guarded = history.state === GUARD;
    const onGesture = () => {
      if (deviceSettings.get().fullscreen && !declined) enter();
      if (!guarded) {
        history.pushState(GUARD, '', location.href);
        guarded = true;
      }
    };
    const onPop = () => {
      guarded = history.state === GUARD;
    };
    const onChange = () => {
      if (!current() && !coarse) declined = true;
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const events = ['click', 'touchend'] as const;
    events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }));
    window.addEventListener('popstate', onPop);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    if (!import.meta.env.DEV) window.addEventListener('beforeunload', onUnload);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onGesture));
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      window.removeEventListener('beforeunload', onUnload);
      declined = false;
      leave();
    };
  }, []);
}
