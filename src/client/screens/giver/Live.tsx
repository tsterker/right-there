/**
 * The giver's screen: where the hands should be, and how firmly. Glanceable
 * (the map fills the screen, the spot points and pings with each nudge),
 * hands-free (spoken cues), touchable with a knuckle (one big button).
 */
import { useRef, useState } from 'react';
import { sub } from '../../../shared/geometry';
import { describeNudge } from '../../../shared/nudge';
import { classify, regionName } from '../../../shared/regions';
import { BackMap, type MapHandle } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { openTuner } from '../../components/LookTuner';
import { FullscreenToggle, PressureMeter, Sheet, Toast } from '../../components/ui';
import { useActions, useSession } from '../../lib/connection';
import { inDemo } from '../../lib/demo';
import { navigate } from '../../lib/router';
import { useGiverSettings } from '../../lib/settings';
import { say, unlockSpeech } from '../../lib/speech';
import { useNow } from '../../lib/time';
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
  // Each nudge stroke (one per start point) pings once as it starts.
  const stroke = target?.source === 'nudge' && target.active && target.from ? `${target.from.x},${target.from.y}` : null;
  const region = target ? classify(target.pos) : null;
  // One banner at a time: the receiver's latest "right there", "firmer" or "softer".
  const asked = state.pressure.last;
  const latest = asked && (!state.good || asked.at >= state.good.at) ? asked : state.good;
  const banner = latest && t - latest.at < 4000 ? latest : null;
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
        {banner && 'change' in banner ? (
          <div key={banner.id} className={`banner banner-${banner.change}`} role="status">
            <strong>{banner.change === 'firmer' ? '▲ Firmer' : '▼ Softer'}</strong>
            <span>{banner.change === 'firmer' ? 'Press a little harder' : 'Ease off a little'}</span>
          </div>
        ) : (
          banner && (
            <div key={banner.id} className="banner banner-good" role="status">
              <strong>♥ Right there</strong>
              <span>That’s the spot — stay here</span>
            </div>
          )
        )}
      </div>

      <div className="live-body">
        <div className={`live-map${anchoring ? ' is-picking' : ''}`} onPointerUp={onMap}>
          <BackMap
            angle={settings.viewAngle}
            crop="torso"
            handle={mapRef}
            target={target}
            smooth
            ping={stroke}
            bothSides={state.bothSides != null}
          />
          {!target && <div className="map-overlay-hint soft">Waiting for them to point…</div>}
          {anchoring && <div className="map-overlay-hint">Tap where your hands are now</div>}
          {state.bothSides && <div className="map-mode-chip">⇆ Both sides</div>}
          <div key={asked?.id} className={`map-pressure-chip${asked ? ' is-new' : ''}`}>
            <PressureMeter level={state.pressure.level} />
          </div>
          <Toast id={toast?.id ?? null}>{toast?.text}</Toast>
        </div>
        {/* The map shows the area; its name is for screen readers (and spoken cues). */}
        <p className="region-name sr-only" aria-live="polite">
          {region ? regionName(region, state.bothSides != null) : 'No spot yet'}
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
        <h4>This device</h4>
        <FullscreenToggle />
        <div className="sheet-grid">
          <button className="btn" onClick={() => (setMenu(false), openTuner())}>
            ✦ Tune the blob (T)
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

/** Speak where to go, so the giver never has to look. */
function useGiverVoice(voice: boolean) {
  const lastRegion = useRef<string | null>(null);
  useActions((a, _from, _at, state) => {
    if (!voice) return;
    if (a.type === 'good') {
      say('Right there.', 'high');
      return;
    }
    if (a.type === 'pressure') {
      say(a.change === 'firmer' ? 'Firmer.' : 'Softer.', 'high');
      return;
    }
    if (a.type === 'target' && !a.active && state.target) {
      const pos = state.target.pos;
      const region = classify(pos);
      if (region !== lastRegion.current) {
        lastRegion.current = region;
        say(regionName(region, state.bothSides != null), 'normal');
      } else if (a.source === 'nudge' && a.from) {
        const text = describeNudge(sub(pos, a.from), state.bothSides ? pos.x : undefined);
        if (text) say(text, 'low');
      }
      return;
    }
    if (a.type === 'bothSides' && !a.side) {
      lastRegion.current = null;
      say(a.on ? 'Both sides' : 'One side', 'normal');
      return;
    }
    if (a.type === 'presence' && a.role === 'A' && !a.connected) say('Their phone disconnected', 'normal');
  });
}
