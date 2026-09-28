/** Giver while the receiver sets up their phone. */
import { useState } from 'react';
import { describeOrientation } from '../../../shared/calibration';
import { BackMap } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { useSession } from '../../lib/connection';
import { useGiverSettings } from '../../lib/settings';
import { secureContextHint } from '../../lib/wakeLock';
import { ViewpointPicker, VoiceControls } from './common';
import { ProbeFlow } from './ProbeFlow';
import { useTrail } from '../../lib/trail';

const STEP_TEXT: Record<string, string> = {
  intro: 'is getting comfortable…',
  'swipe-down': 'is doing swipe 1 of 2…',
  'swipe-right': 'is doing swipe 2 of 2…',
  practice: 'is trying out pointing — watch the dot.',
  done: 'is ready.',
};

export function GiverSetup() {
  const { state, dispatch } = useSession();
  const [settings] = useGiverSettings();
  const [probing, setProbing] = useState(false);
  const trail = useTrail(state.target);
  const calib = state.calib;
  const warning = secureContextHint();

  if (probing) {
    return (
      <div className="screen giver-setup is-probing">
        <StatusBar />
        <ProbeFlow onClose={() => setProbing(false)} />
      </div>
    );
  }

  return (
    <div className="screen giver-setup">
      <StatusBar />
      <div className="scroll">
        <header className="screen-head">
          <p className="eyebrow">Step 2 of 3 · Setup</p>
          <h1>Your partner {STEP_TEXT[state.setupStep] ?? '…'}</h1>
          {calib && state.setupStep === 'practice' && (
            <p className="lead">
              The {describeOrientation(calib.orientation, 'they')} · {calib.mode === 'nudge' ? 'nudge mode' : 'map mode'}. Ask
              them to move the dot to their left shoulder blade — does it end up there?
            </p>
          )}
        </header>

        <div className="setup-map">
          <BackMap angle={settings.viewAngle} crop="torso" target={state.target} smooth trail={trail} markers={state.markers} />
        </div>

        <section className="field">
          <h3>Where will you stand?</h3>
          <p className="hint">The map turns so it matches what you see. Left and right always mean their left and right.</p>
          <ViewpointPicker />
        </section>

        <section className="field">
          <h3>Hands busy? Let the phone talk</h3>
          <VoiceControls />
        </section>

        <section className="field">
          <h3>Optional: precision calibration</h3>
          <p className="hint">
            Useful for map mode. You press a few landmarks, they tap where they feel it — their phone learns how their sense of
            touch maps onto the back and keeps improving over time.
          </p>
          <button className="btn" onClick={() => setProbing(true)}>
            Calibrate ({calib?.points ?? 0} point{calib?.points === 1 ? '' : 's'} so far)
          </button>
        </section>

        {warning && <p className="notice small">☾ {warning}</p>}
      </div>
      <footer className="screen-foot">
        <button className="btn primary block" onClick={() => dispatch({ type: 'phase', phase: 'live' })}>
          Start massage ▶
        </button>
      </footer>
    </div>
  );
}
