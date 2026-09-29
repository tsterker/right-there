/** Receiver during the massage: move a finger to show where; double-tap for "right there". */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ORIENTATION } from '../../../shared/calibration';
import { classify, regionName } from '../../../shared/regions';
import { StatusBar } from '../../components/StatusBar';
import { TouchPad } from '../../components/TouchPad';
import { Segmented, Sheet, Toast } from '../../components/ui';
import { useActions, useSession } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { useCorrection, useProfile } from '../../lib/profile';
import { navigate } from '../../lib/router';
import { useReceiverSettings } from '../../lib/settings';
import { say, speechSupported, unlockSpeech } from '../../lib/speech';
import { MODE_OPTIONS } from './modes';

export interface Notice {
  id: number;
  text: string;
}

export function ReceiverPad({ notice, onRedoSetup }: { notice: Notice | null; onRedoSetup: () => void }) {
  const { state, dispatch, conn } = useSession();
  const [profile, setProfile] = useProfile();
  const [settings, setSettings] = useReceiverSettings();
  const model = useCorrection(profile.points);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const note = (text: string) => setToast({ id: Date.now(), text });
  useEffect(() => {
    if (notice) setToast(notice);
  }, [notice]);

  const rightThere = () => {
    dispatch({ type: 'good' });
    haptic('double');
    note('♥ Right there');
  };
  const setBothSides = (on: boolean) => {
    dispatch({ type: 'bothSides', on });
    haptic('confirm');
    note(on ? '⇆ Both sides' : 'One side');
  };

  // Eyes-free: quietly name the area when the spot settles somewhere new.
  const spokenRegion = useRef<string | null>(null);
  useActions((a, _from, _at, next) => {
    if (!settings.speak || a.type !== 'target' || a.active || !next.target) return;
    const region = classify(next.target.pos);
    if (region === spokenRegion.current) return;
    spokenRegion.current = region;
    say(regionName(region), 'normal', 0.45);
  });

  return (
    <div className={`screen receiver-pad${settings.dim ? ' is-dim' : ''}`}>
      <StatusBar compact>
        <Segmented value={profile.mode} options={MODE_OPTIONS} onChange={(mode) => setProfile({ mode })} className="small" />
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More">
          ⋯
        </button>
      </StatusBar>

      <TouchPad
        mode={profile.mode}
        orientation={profile.orientation ?? DEFAULT_ORIENTATION}
        sensitivity={profile.sensitivity}
        tune={profile.tune}
        autoTune={profile.autoTune}
        model={model}
        target={state.target}
        dispatch={dispatch}
        dim={settings.dim}
        bothSides={state.bothSides}
        onRightThere={rightThere}
        onTwoFingerTap={() => setBothSides(state.bothSides == null)}
        onTune={(tune) => setProfile({ tune })}
      >
        <div className="pad-hint">
          {profile.mode === 'nudge' ? 'Drag to move' : 'Touch the spot'} · double-tap = right there · two fingers = both sides
        </div>
        <Toast id={toast?.id ?? null}>{toast?.text}</Toast>
      </TouchPad>

      <nav className="pad-actions">
        <button className="act act-good" onClick={rightThere}>
          ♥ Right there
        </button>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} title="More">
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
              Learn from my corrections (×{profile.tune.toFixed(2)})
            </label>
          </>
        )}
        <h4>Massage</h4>
        <label className="toggle">
          <input type="checkbox" checked={state.bothSides != null} onChange={(e) => setBothSides(e.target.checked)} />
          Both sides at once (two-finger tap) · experimental
        </label>
        <h4>This device</h4>
        <label className="toggle">
          <input type="checkbox" checked={settings.dim} onChange={(e) => setSettings({ dim: e.target.checked })} />
          Extra dim screen
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.haptics} onChange={(e) => setSettings({ haptics: e.target.checked })} />
          Vibrate when the spot enters a new area
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
            Quietly say where the spot is
          </label>
        )}
        <div className="sheet-grid">
          <button className="btn" onClick={() => (setMenu(false), onRedoSetup())}>
            ↺ Redo the two swipes
          </button>
          <button className="btn" onClick={() => (setMenu(false), conn.swapRoles())}>
            ⇄ Swap roles
          </button>
          <button className="btn" onClick={() => navigate('/')}>
            Leave
          </button>
        </div>
      </Sheet>
    </div>
  );
}
