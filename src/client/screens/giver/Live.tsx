/**
 * Giver during the massage. Glanceable (big dot, big words), hands-free
 * (spoken cues), touchable with a knuckle (few, large buttons).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { apply, sub } from '../../../shared/geometry';
import { arrowFor, describeNudge } from '../../../shared/nudge';
import { classify, regionInfo } from '../../../shared/regions';
import { elapsedMs, isPaused, type FeedbackEvent, type FeedbackKind } from '../../../shared/session';
import { buildPlan, currentStepIndex, hintFor, SYMPTOMS, type SymptomKind } from '../../../shared/techniques';
import { BackMap, viewMatrix, type MapHandle } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { PressureMeter, Sheet, Toast } from '../../components/ui';
import { formatClock, useNow } from '../../lib/time';
import { useActions, useSession } from '../../lib/connection';
import { useTrail } from '../../lib/trail';
import { useGiverSettings } from '../../lib/settings';
import { play, unlockAudio, type Cue } from '../../lib/sound';
import { say, unlockSpeech } from '../../lib/speech';
import { PlanList, TechniqueCard, ViewpointPicker, VoiceControls } from './common';
import { ProbeFlow } from './ProbeFlow';

const BANNER: Record<FeedbackKind, { title: string; sub: string }> = {
  firmer: { title: 'Firmer', sub: 'More pressure' },
  softer: { title: 'Softer', sub: 'Less pressure' },
  good: { title: '♥ Perfect', sub: 'Right there — keep going' },
  ouch: { title: 'Ouch!', sub: 'Ease off right away' },
  slower: { title: 'Slower', sub: 'Slow the rhythm down' },
  faster: { title: 'Faster', sub: 'Pick up the pace a little' },
  change: { title: 'Something different', sub: 'Try another technique' },
};

const SPOKEN: Record<FeedbackKind, string> = {
  firmer: 'Firmer',
  softer: 'Softer',
  good: 'Perfect. Right there.',
  ouch: 'Ouch! Ease off.',
  slower: 'Slower',
  faster: 'A bit faster',
  change: 'Try something different',
};

const CUE: Record<FeedbackKind, Cue> = {
  firmer: 'firmer',
  softer: 'softer',
  good: 'good',
  ouch: 'ouch',
  slower: 'tempo',
  faster: 'tempo',
  change: 'attention',
};

const TEMPO = ['Much slower', 'Slower', '', 'Faster', 'Much faster'];

export function GiverLive() {
  const { state, dispatch, now } = useSession();
  const [settings, setSettings] = useGiverSettings();
  const [anchoring, setAnchoring] = useState<null | { learn: boolean }>(null);
  const [marking, setMarking] = useState<SymptomKind | null>(null);
  const [sheet, setSheet] = useState<null | 'plan' | 'more' | 'calibrate'>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const mapRef = useRef<MapHandle>(null);
  const t = useNow(500, now);
  const target = state.target;
  const trail = useTrail(target);
  const paused = isPaused(state);
  const m = useMemo(() => viewMatrix(settings.viewAngle), [settings.viewAngle]);

  const hint = useMemo(
    () =>
      target
        ? hintFor({ pos: target.pos, markers: state.markers, pressure: state.pressure, likes: state.prefs.likes, change: state.change })
        : null,
    [target, state.markers, state.pressure, state.prefs.likes, state.change],
  );
  const plan = useMemo(
    () => buildPlan(state.markers, state.prefs.durationMin, state.prefs.likes),
    [state.markers, state.prefs.durationMin, state.prefs.likes],
  );
  const elapsed = elapsedMs(state, t);
  const stepIndex = currentStepIndex(plan, elapsed / 60000);
  const step = plan.steps[stepIndex];
  const nextStep = plan.steps[stepIndex + 1];
  const totalMs = state.prefs.durationMin ? state.prefs.durationMin * 60000 : null;

  const lastFeedback: FeedbackEvent | undefined = state.feedback[state.feedback.length - 1];
  const recentGood = lastFeedback?.kind === 'good' && t - lastFeedback.at < 25_000;
  // Only a spot the receiver pointed at in map mode can teach their map.
  const teach = recentGood && state.calib?.mode === 'map' && target?.by === 'A' && target.source === 'map';

  const nudge = target?.source === 'nudge' && target.from && (target.active || t - target.at < 6000) ? { from: target.from, to: target.pos } : null;
  const nudgeText = nudge ? describeNudge(sub(nudge.to, nudge.from)) : null;
  const nudgeArrow = nudge ? arrowFor(apply(m, sub(nudge.to, nudge.from))) : null;
  const settledMs = target && !target.active ? Math.max(0, t - target.at) : 0;

  useGiverVoice(settings.voice, settings.sounds);
  usePlanAnnouncements(settings.voice, stepIndex, plan.steps.map((s) => s.title), elapsed, totalMs);

  const onMap = (e: React.PointerEvent) => {
    if (!anchoring && !marking) return;
    const p = mapRef.current?.toBody(e.clientX, e.clientY);
    if (!p) return;
    if (marking) {
      dispatch({ type: 'marker.add', kind: marking, pos: p });
      setToast({ id: Date.now(), text: `Marked: ${SYMPTOMS[marking].label}` });
      setMarking(null);
      return;
    }
    if (!anchoring) return;
    dispatch({ type: 'target', pos: p, active: false, source: 'anchor', from: null, learn: anchoring.learn || undefined });
    setToast({ id: Date.now(), text: anchoring.learn ? 'Thanks — their map just got more precise' : 'Dot moved to your hands' });
    setAnchoring(null);
  };

  const unlock = () => {
    unlockAudio();
    if (settings.voice) unlockSpeech();
  };

  return (
    <div className="screen giver-live" onClickCapture={unlock}>
      <StatusBar timer>
        <button className="icon-btn" onClick={() => dispatch({ type: 'pause', paused: !paused })} aria-label={paused ? 'Continue' : 'Pause'}>
          {paused ? '▶' : '⏸'}
        </button>
      </StatusBar>

      <FeedbackBanner event={lastFeedback} now={now} />

      <div className="live-body">
        <div className={`live-map${anchoring || marking ? ' is-picking' : ''}`} onPointerUp={onMap}>
          <BackMap
            angle={settings.viewAngle}
            crop="torso"
            handle={mapRef}
            target={target}
            smooth
            trail={trail}
            arrow={nudge}
            markers={state.markers}
            highlight={target ? classify(target.pos) : null}
          />
          <button className="plan-chip" onClick={() => setSheet('plan')}>
            <span className={`plan-kind kind-${step?.kind}`}>{step?.kind === 'warmup' ? 'Warm-up' : step?.kind === 'cooldown' ? 'Cool-down' : 'Focus'}</span>
            {step?.kind === 'focus' ? step.title : nextStep ? `next: ${nextStep.title}` : step?.title}
          </button>
          {!target && <div className="map-overlay-hint soft">Warm up the whole back — they'll point when ready</div>}
          {anchoring && <div className="map-overlay-hint">Tap where your hands are now</div>}
          {marking && (
            <div className="map-overlay-hint">
              Tap where you found it ({SYMPTOMS[marking].label.toLowerCase()})
            </div>
          )}
          {nudgeText && (
            <div className="nudge-chip">
              <span className="nudge-arrow">{nudgeArrow}</span> {nudgeText}
            </div>
          )}
          <Toast id={toast?.id ?? null}>{toast?.text}</Toast>
        </div>

        <aside className={`live-panel${settings.details ? ' is-expanded' : ''}`}>
          {hint && target ? (
            <>
              <div className="region">
                <h2 className="region-name">{hint.regionName}</h2>
                <p className="region-meta">
                  {hint.muscle}
                  {target.active ? ' · they are pointing…' : ` · here for ${formatClock(settledMs)}`}
                </p>
              </div>
              <div className="live-chips">
                <PressureMeter level={state.pressure} />
                <span className="pressure-how">{hint.pressure.how}</span>
                {state.tempo !== 0 && <span className="chip is-on tempo">{TEMPO[state.tempo + 2]}</span>}
              </div>
              <TechniqueCard hint={hint} compact={!settings.details} onToggle={() => setSettings({ details: !settings.details })} />
            </>
          ) : (
            <div className="region">
              <h2 className="region-name">Warm-up</h2>
              <p className="region-meta">Long gliding strokes over the whole back.</p>
              <PressureMeter level={state.pressure} />
            </div>
          )}
        </aside>
      </div>

      <nav className="giver-actions">
        <button
          className={`act${teach ? ' act-teach' : ''}${anchoring ? ' is-on' : ''}`}
          onClick={() => {
            setMarking(null);
            setAnchoring(anchoring ? null : { learn: teach });
          }}
        >
          📍 {teach ? 'I’m here — teach map' : 'I’m here'}
        </button>
        <button className="act" onClick={() => setSheet('plan')}>
          🗺 Plan
        </button>
        <button className="act" onClick={() => setSheet('more')}>
          ⋯ More
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

      <Sheet open={sheet === 'plan'} onClose={() => setSheet(null)} title="Plan">
        <PlanList
          plan={plan}
          current={stepIndex}
          onGo={(pos) => {
            dispatch({ type: 'target', pos, active: false, source: 'plan', from: null });
            setSheet(null);
          }}
        />
        {state.prefs.notes && <p className="notes-text">Their note: “{state.prefs.notes}”</p>}
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="More">
        <h4>Found something with your hands?</h4>
        <div className="chips">
          {(['knot', 'tight', 'tender'] as SymptomKind[]).map((k) => (
            <button
              key={k}
              className="chip"
              style={{ ['--chip' as string]: SYMPTOMS[k].color }}
              onClick={() => {
                setAnchoring(null);
                setMarking(k);
                setSheet(null);
              }}
            >
              <span className="chip-dot">{SYMPTOMS[k].glyph}</span>
              Mark a {SYMPTOMS[k].label.toLowerCase()} spot
            </button>
          ))}
        </div>
        <h4>Where are you standing?</h4>
        <ViewpointPicker />
        <h4>Cues</h4>
        <VoiceControls />
        {state.calib && (
          <p className="hint">
            Their pointing: {state.calib.mode === 'nudge' ? `nudge, sensitivity ×${(state.calib.sensitivity * state.calib.tune).toFixed(2)}` : 'map'}
            {state.calib.errorCm != null && ` · map precision ±${state.calib.errorCm.toFixed(1)} cm`}
          </p>
        )}
        <div className="sheet-grid">
          <button className="btn" onClick={() => setSheet('calibrate')}>
            🎯 Calibrate a point
          </button>
          <button className="btn" onClick={() => (dispatch({ type: 'phase', phase: 'setup' }), setSheet(null))}>
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

      {sheet === 'calibrate' && (
        <div className="overlay calibrate-overlay">
          <ProbeFlow onClose={() => setSheet(null)} />
        </div>
      )}
    </div>
  );
}

function FeedbackBanner({ event, now }: { event: FeedbackEvent | undefined; now: () => number }) {
  // Only animate events that are new when they arrive (not stale ones after a reconnect).
  const fresh = event && now() - event.at < 6000;
  if (!event || !fresh) return <div className="banner-slot" />;
  const b = BANNER[event.kind];
  return (
    <div className="banner-slot">
      <div key={event.id} className={`banner banner-${event.kind}`} role="status">
        <strong>{b.title}</strong>
        <span>
          {b.sub}
          {(event.kind === 'firmer' || event.kind === 'softer' || event.kind === 'ouch') && ` · pressure ${event.pressure}/5`}
        </span>
      </div>
    </div>
  );
}

/** Speak where to go and what they said, so the giver never has to look. */
function useGiverVoice(voice: boolean, sounds: boolean) {
  const lastRegion = useRef<string | null>(null);
  useActions((a, _from, _at, state) => {
    if (a.type === 'feedback') {
      if (sounds) play(CUE[a.kind]);
      if (!voice) return;
      if (a.kind === 'change' && state.target) {
        const h = hintFor({ pos: state.target.pos, markers: state.markers, pressure: state.pressure, likes: state.prefs.likes, change: state.change });
        say(`Try something different: ${h.technique?.name ?? 'change it up'}`, 'high');
      } else {
        say(SPOKEN[a.kind], 'high');
      }
      return;
    }
    if (!voice) return;
    if (a.type === 'target' && !a.active && state.target) {
      const pos = state.target.pos;
      const region = classify(pos);
      if (region !== lastRegion.current) {
        lastRegion.current = region;
        say(regionInfo(region).name, 'normal');
      } else if (a.source === 'nudge' && a.from) {
        const text = describeNudge(sub(pos, a.from));
        if (text) say(text, 'low');
      }
      return;
    }
    if (a.type === 'pause') say(a.paused ? 'Paused' : 'Carry on', 'high');
    if (a.type === 'presence' && a.role === 'A' && !a.connected) say('Their phone disconnected', 'normal');
  });
}

function usePlanAnnouncements(voice: boolean, stepIndex: number, titles: string[], elapsed: number, totalMs: number | null) {
  const lastStep = useRef(stepIndex);
  const timeUp = useRef(false);
  useEffect(() => {
    if (stepIndex !== lastStep.current) {
      lastStep.current = stepIndex;
      if (voice) say(`Next: ${titles[stepIndex]}`, 'low');
    }
  }, [stepIndex, titles, voice]);
  useEffect(() => {
    if (totalMs && elapsed >= totalMs && !timeUp.current) {
      timeUp.current = true;
      if (voice) say('Time is up. Finish with a few slow strokes.', 'normal');
    }
  }, [elapsed, totalMs, voice]);
}
