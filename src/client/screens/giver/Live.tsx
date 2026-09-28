/**
 * The giver's screen: where the hands should be. Glanceable (big dot, big
 * words), hands-free (spoken cues), touchable with a knuckle (two buttons).
 */
import { useMemo, useRef, useState } from 'react';
import { apply, sub } from '../../../shared/geometry';
import { arrowFor, describeNudge } from '../../../shared/nudge';
import { classify, regionName } from '../../../shared/regions';
import { BackMap, viewMatrix, type MapHandle } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { Sheet, Toast } from '../../components/ui';
import { useActions, useSession } from '../../lib/connection';
import { navigate } from '../../lib/router';
import { useGiverSettings } from '../../lib/settings';
import { say, unlockSpeech } from '../../lib/speech';
import { useNow } from '../../lib/time';
import { useTrail } from '../../lib/trail';
import { ViewpointPicker, VoiceToggle } from './common';

export function GiverLive() {
  const { state, dispatch, now, conn } = useSession();
  const [settings] = useGiverSettings();
  const [anchoring, setAnchoring] = useState<null | { learn: boolean }>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const mapRef = useRef<MapHandle>(null);
  const t = useNow(500, now);
  const target = state.target;
  const trail = useTrail(target);
  const m = useMemo(() => viewMatrix(settings.viewAngle), [settings.viewAngle]);

  const nudge = target?.source === 'nudge' && target.from && (target.active || t - target.at < 6000) ? { from: target.from, to: target.pos } : null;
  const nudgeText = nudge ? describeNudge(sub(nudge.to, nudge.from)) : null;
  const region = target ? classify(target.pos) : null;
  const good = state.good && t - state.good.at < 4000 ? state.good : null;
  // A "right there" on a spot the receiver touched in map mode can teach their map.
  const teach =
    state.good != null && t - state.good.at < 25_000 && target?.by === 'A' && target.source === 'map' && !target.active;

  useGiverVoice(settings.voice);

  const onMap = (e: React.PointerEvent) => {
    if (!anchoring) return;
    const p = mapRef.current?.toBody(e.clientX, e.clientY);
    if (!p) return;
    dispatch({ type: 'target', pos: p, active: false, source: 'anchor', from: null, learn: anchoring.learn || undefined });
    setToast({ id: Date.now(), text: anchoring.learn ? 'Thanks — their map just got more precise' : 'Dot moved to your hands' });
    setAnchoring(null);
  };

  return (
    <div className="screen giver-live" onClickCapture={() => settings.voice && unlockSpeech()}>
      <StatusBar>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More">
          ⋯
        </button>
      </StatusBar>

      <div className="banner-slot">
        {good && (
          <div key={good.id} className="banner banner-good" role="status">
            <strong>♥ Right there</strong>
            <span>That’s the spot — stay here</span>
          </div>
        )}
      </div>

      <div className="live-body">
        <div className={`live-map${anchoring ? ' is-picking' : ''}`} onPointerUp={onMap}>
            <BackMap angle={settings.viewAngle} crop="torso" handle={mapRef} target={target} smooth trail={trail} arrow={nudge} highlight={region} />
          {!target && <div className="map-overlay-hint soft">Waiting for them to point…</div>}
          {anchoring && <div className="map-overlay-hint">Tap where your hands are now</div>}
          {nudgeText && nudge && (
            <div className="nudge-chip">
              <span className="nudge-arrow">{arrowFor(apply(m, sub(nudge.to, nudge.from)))}</span> {nudgeText}
            </div>
          )}
          <Toast id={toast?.id ?? null}>{toast?.text}</Toast>
        </div>

        <div className="live-panel">
          <h2 className="region-name">{region ? regionName(region) : 'No spot yet'}</h2>
          <p className="region-meta">
            {!target ? 'The dot appears when they move a finger.' : target.active ? 'They’re pointing…' : 'Settled — work here'}
          </p>
        </div>
      </div>

      <nav className="giver-actions">
        <button
          className={`act${teach ? ' act-teach' : ''}${anchoring ? ' is-on' : ''}`}
          onClick={() => setAnchoring(anchoring ? null : { learn: teach })}
        >
          📍 {teach ? 'I’m here — teach map' : 'I’m here'}
        </button>
      </nav>

      {!settings.viewChosen && (
        <div className="overlay first-view">
          <h2>Where are you standing?</h2>
          <p className="lead">The map turns to match what you see. Left and right always mean their left and right.</p>
          <ViewpointPicker />
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="More">
        <h4>Where are you standing?</h4>
        <ViewpointPicker onPicked={() => setMenu(false)} />
        <h4>Cues</h4>
        <VoiceToggle />
        <div className="sheet-grid">
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

/** Speak where to go, so the giver never has to look. */
function useGiverVoice(voice: boolean) {
  const lastRegion = useRef<string | null>(null);
  useActions((a, _from, _at, state) => {
    if (!voice) return;
    if (a.type === 'good') {
      say('Right there.', 'high');
      return;
    }
    if (a.type === 'target' && !a.active && state.target) {
      const pos = state.target.pos;
      const region = classify(pos);
      if (region !== lastRegion.current) {
        lastRegion.current = region;
        say(regionName(region), 'normal');
      } else if (a.source === 'nudge' && a.from) {
        const text = describeNudge(sub(pos, a.from));
        if (text) say(text, 'low');
      }
      return;
    }
    if (a.type === 'presence' && a.role === 'A' && !a.connected) say('Their phone disconnected', 'normal');
  });
}
