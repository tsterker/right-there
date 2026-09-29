/**
 * The giver's screen: where the hands should be. Glanceable (the map fills
 * the screen, each nudge replays a cue), hands-free (spoken cues), touchable
 * with a knuckle (one big button).
 */
import { useMemo, useRef, useState } from 'react';
import { apply, sub } from '../../../shared/geometry';
import { arrowFor, describeNudge } from '../../../shared/nudge';
import { classify, regionName } from '../../../shared/regions';
import { BackMap, viewMatrix, type MapHandle } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { Sheet, Toast } from '../../components/ui';
import { useActions, useSession } from '../../lib/connection';
import { inDemo } from '../../lib/demo';
import { navigate } from '../../lib/router';
import { useGiverSettings } from '../../lib/settings';
import { say, unlockSpeech } from '../../lib/speech';
import { useNow } from '../../lib/time';
import { useTrail } from '../../lib/trail';
import { ViewpointPicker, VoiceToggle } from './common';

const NUDGE_MS = 8000;

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

  // A nudge shows while the finger moves and for a while after, fading, so a fresh one looks fresh.
  const nudge =
    target?.source === 'nudge' && target.from && (target.active || t - target.at < NUDGE_MS)
      ? { from: target.from, to: target.pos, id: `${target.from.x},${target.from.y},${target.active}`, live: target.active }
      : null;
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
          <BackMap angle={settings.viewAngle} crop="torso" handle={mapRef} target={target} smooth trail={trail} heading={nudge} />
          {!target && <div className="map-overlay-hint soft">Waiting for them to point…</div>}
          {anchoring && <div className="map-overlay-hint">Tap where your hands are now</div>}
          {nudgeText && nudge && !anchoring && (
            <div key={nudge.id} className={`nudge-chip${nudge.live ? ' is-live' : ''}`}>
              <span className="nudge-arrow">{arrowFor(apply(m, sub(nudge.to, nudge.from)))}</span> {nudgeText}
            </div>
          )}
          <Toast id={toast?.id ?? null}>{toast?.text}</Toast>
        </div>
        {/* The map shows the area; its name is for screen readers (and spoken cues). */}
        <p className="region-name sr-only" aria-live="polite">
          {region ? regionName(region) : 'No spot yet'}
        </p>
      </div>

      <nav className="giver-actions">
        <button
          className={`act${teach ? ' act-teach' : ''}${anchoring ? ' is-on' : ''}`}
          onClick={() => setAnchoring(anchoring ? null : { learn: teach })}
        >
          📍 {teach ? 'I’m here — teach map' : 'I’m here'}
        </button>
      </nav>

      {!settings.viewChosen && !inDemo && (
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
