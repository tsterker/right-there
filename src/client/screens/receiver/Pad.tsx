/** Receiver during the massage: point, and say how it feels, without talking. */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ORIENTATION } from '../../../shared/calibration';
import { isPaused, type FeedbackKind } from '../../../shared/session';
import { SYMPTOM_ORDER, SYMPTOMS } from '../../../shared/techniques';
import { StatusBar } from '../../components/StatusBar';
import { TouchPad } from '../../components/TouchPad';
import { PressureMeter, Segmented, Sheet, Toast } from '../../components/ui';
import { useActions, useSession } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { useCorrection, useProfile } from '../../lib/profile';
import { useReceiverSettings } from '../../lib/settings';
import { play, unlockAudio, type Cue } from '../../lib/sound';
import { say, speechSupported, unlockSpeech } from '../../lib/speech';
import { classify, regionInfo } from '../../../shared/regions';
import { MODE_OPTIONS } from './modes';

const SENT: Record<FeedbackKind, string> = {
  firmer: 'Firmer ↑',
  softer: 'Softer ↓',
  good: '♥ That’s the spot',
  ouch: 'Ouch — they’ll ease off',
  slower: 'Slower',
  faster: 'Faster',
  change: 'Asked for something different',
};

const CUE: Partial<Record<FeedbackKind, Cue>> = { firmer: 'firmer', softer: 'softer', good: 'good', ouch: 'ouch' };

export function ReceiverPad({ learned }: { learned: string | null }) {
  const { state, dispatch } = useSession();
  const [profile, setProfile] = useProfile();
  const [settings, setSettings] = useReceiverSettings();
  const model = useCorrection(profile.points);
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const o = profile.orientation ?? DEFAULT_ORIENTATION;
  const paused = isPaused(state);

  const note = (text: string) => setToast({ id: Date.now(), text });
  useEffect(() => {
    if (learned) setToast({ id: Date.now(), text: 'Calibration improved ✓' });
  }, [learned]);

  // Eyes-free: quietly name the area when the spot settles somewhere new.
  const spokenRegion = useRef<string | null>(null);
  useActions((a, _from, _at, next) => {
    if (!settings.speak || a.type !== 'target' || a.active || !next.target) return;
    const region = classify(next.target.pos);
    if (region === spokenRegion.current) return;
    spokenRegion.current = region;
    say(regionInfo(region).name, 'normal', 0.45);
  });

  const feedback = (kind: FeedbackKind) => {
    dispatch({ type: 'feedback', kind });
    haptic(kind === 'ouch' ? 'alert' : kind === 'good' ? 'double' : 'tap');
    if (settings.sounds) {
      unlockAudio();
      const cue = CUE[kind];
      if (cue) play(cue, 0.08);
    }
    const level = kind === 'firmer' ? Math.min(5, state.pressure + 1) : kind === 'softer' || kind === 'ouch' ? Math.max(1, state.pressure - 1) : null;
    note(level ? `${SENT[kind]} · ${level}/5` : SENT[kind]);
  };

  const mark = (kind: (typeof SYMPTOM_ORDER)[number]) => {
    if (!state.target) return;
    dispatch({ type: 'marker.add', kind, pos: state.target.pos });
    note(`Marked: ${SYMPTOMS[kind].label}`);
    setMore(false);
  };

  return (
    <div className={`screen receiver-pad${settings.dim ? ' is-dim' : ''}`}>
      <StatusBar timer compact>
        <Segmented value={profile.mode} options={MODE_OPTIONS} onChange={(mode) => setProfile({ mode })} className="small" />
        <button className="icon-btn" onClick={() => setMore(true)} aria-label="More">
          ⋯
        </button>
      </StatusBar>

      <TouchPad
        mode={profile.mode}
        orientation={o}
        sensitivity={profile.sensitivity}
        tune={profile.tune}
        autoTune={profile.autoTune}
        model={model}
        target={state.target}
        markers={state.markers}
        dispatch={dispatch}
        dim={settings.dim}
        onGesture={feedback}
        onTune={(tune, reason) => {
          setProfile({ tune });
          note(reason === 'overshoot' ? 'Sensitivity tuned down a little' : 'Sensitivity tuned up a little');
        }}
      >
        <div className="pad-hint">
          {profile.mode === 'nudge' ? 'Drag anywhere to move the spot' : 'Touch where you want it'} · double-tap = ♥ · two
          fingers ↑↓ = firmer/softer
        </div>
        <Toast id={toast?.id ?? null}>{toast?.text}</Toast>
      </TouchPad>

      <div className="pad-pressure">
        <PressureMeter level={state.pressure} />
      </div>
      <nav className="pad-actions">
        <button className="act act-ouch" onClick={() => feedback('ouch')}>
          Ouch
        </button>
        <button className="act act-softer" onClick={() => feedback('softer')}>
          <span>−</span>Softer
        </button>
        <button className="act act-good" onClick={() => feedback('good')} aria-label="That's the spot">
          ♥
        </button>
        <button className="act act-firmer" onClick={() => feedback('firmer')}>
          <span>+</span>Firmer
        </button>
      </nav>

      {paused && (
        <div className="overlay paused-overlay">
          <h2>Paused</h2>
          <button className="btn primary" onClick={() => dispatch({ type: 'pause', paused: false })}>
            Continue
          </button>
        </div>
      )}

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="sheet-grid">
          <button className="btn" onClick={() => (feedback('slower'), setMore(false))}>
            🐢 Slower
          </button>
          <button className="btn" onClick={() => (feedback('faster'), setMore(false))}>
            🐇 Faster
          </button>
          <button className="btn" onClick={() => (feedback('change'), setMore(false))}>
            🔄 Something different
          </button>
          <button className="btn" onClick={() => (dispatch({ type: 'pause', paused: !paused }), setMore(false))}>
            {paused ? '▶ Continue' : '⏸ Pause'}
          </button>
        </div>

        <h4>Mark the current spot as…</h4>
        <div className="chips">
          {SYMPTOM_ORDER.map((k) => (
            <button
              key={k}
              className="chip"
              style={{ ['--chip' as string]: SYMPTOMS[k].color }}
              disabled={!state.target}
              onClick={() => mark(k)}
            >
              <span className="chip-dot">{SYMPTOMS[k].glyph}</span>
              {SYMPTOMS[k].label}
            </button>
          ))}
        </div>

        {profile.mode === 'nudge' && (
          <>
            <h4>Sensitivity</h4>
            <label className="slider">
              <span>Precise</span>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={profile.sensitivity}
                onChange={(e) => setProfile({ sensitivity: Number(e.target.value) })}
              />
              <span>Fast</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={profile.autoTune} onChange={(e) => setProfile({ autoTune: e.target.checked })} />
              Learn from my corrections (currently ×{profile.tune.toFixed(2)})
            </label>
          </>
        )}

        <h4>This phone</h4>
        <label className="toggle">
          <input type="checkbox" checked={settings.dim} onChange={(e) => setSettings({ dim: e.target.checked })} />
          Extra dim screen
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.haptics} onChange={(e) => setSettings({ haptics: e.target.checked })} />
          Vibrate on actions (Android, some iPhones)
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.sounds} onChange={(e) => setSettings({ sounds: e.target.checked })} />
          Soft sounds on actions
        </label>
        {speechSupported && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.speak}
              onChange={(e) => {
                unlockSpeech();
                setSettings({ speak: e.target.checked });
              }}
            />
            Quietly say where the spot is (eyes-free)
          </label>
        )}

        <div className="sheet-grid">
          <button className="btn" onClick={() => (dispatch({ type: 'phase', phase: 'setup' }), setMore(false))}>
            ↺ Redo phone setup
          </button>
          {confirmEnd ? (
            <button className="btn danger" onClick={() => dispatch({ type: 'end', round: state.round })}>
              Yes, end session
            </button>
          ) : (
            <button className="btn" onClick={() => setConfirmEnd(true)}>
              ⏹ End session
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
