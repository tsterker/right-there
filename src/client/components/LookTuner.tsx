/**
 * Tune the blob live: a floating panel over the map. T toggles it anywhere;
 * while open, 1/2/3 pick a preset, R resets, Esc closes. Inside the demo's
 * phones, keys and the menu button go to the page around them, whose panel
 * tunes both phones.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { inDemo } from '../lib/demo';
import { DEFAULT_LOOK, LOOK_PRESETS, LOOK_RANGES, lookStore, useLook } from '../lib/look';

/** Demo frame → demo page: a tuner key was pressed (or the menu asked for the panel). */
export const DEMO_KEY = 'right-there-demo-key';

let open = false;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  open = v;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** Handle a tuner key; true if it was one. */
function press(key: string): boolean {
  const k = key.toLowerCase();
  if (inDemo) {
    if (k !== 't' && !(open && ['1', '2', '3', 'r', 'escape'].includes(k))) return false;
    window.parent.postMessage({ type: DEMO_KEY, key: k }, '*');
    return true;
  }
  if (k === 't') setOpen(!open);
  else if (!open) return false;
  else if (k === 'escape') setOpen(false);
  else if (k === 'r') lookStore.set(DEFAULT_LOOK);
  else if (LOOK_PRESETS[Number(k) - 1]) lookStore.set(LOOK_PRESETS[Number(k) - 1].look);
  else return false;
  return true;
}

/** Open the panel (from a menu). */
export const openTuner = () => (inDemo ? press('t') : setOpen(true));

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Mount once per page: listens for the shortcuts, and (outside demo frames) shows the panel. */
export function LookTuner() {
  const isOpen = useSyncExternalStore(subscribe, () => open);
  const [look, set] = useLook();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (press(e.key)) e.preventDefault();
    };
    const onMessage = (e: MessageEvent) => {
      if (!inDemo && e.data?.type === DEMO_KEY && typeof e.data.key === 'string') press(e.data.key);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  if (inDemo || !isOpen) return null;
  return (
    <aside className="tuner" aria-label="Tune the blob">
      <header className="tuner-head">
        <strong>Tune the blob</strong>
        <button className="icon-btn small" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="tuner-presets">
        {LOOK_PRESETS.map((p, i) => (
          <button key={p.name} className="btn small" onClick={() => set(p.look)}>
            <kbd>{i + 1}</kbd> {p.name}
          </button>
        ))}
      </div>
      {LOOK_RANGES.map((r) => (
        <label key={r.key} className="tuner-row" title={r.hint}>
          <span>{r.label}</span>
          <input type="range" min={r.min} max={r.max} step={r.step} value={look[r.key]} onChange={(e) => set({ [r.key]: Number(e.target.value) })} />
          <output>{look[r.key]}</output>
        </label>
      ))}
      <p className="tuner-keys">
        <kbd>T</kbd> show/hide · <kbd>1</kbd>–<kbd>3</kbd> presets · <kbd>R</kbd> reset · <kbd>Esc</kbd> close
      </p>
    </aside>
  );
}
