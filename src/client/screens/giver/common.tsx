import { speechSupported, say, unlockSpeech } from '../../lib/speech';
import { unlockAudio } from '../../lib/sound';
import { useGiverSettings, VIEWPOINTS } from '../../lib/settings';
import type { Hint, Plan } from '../../../shared/techniques';
import { SYMPTOMS } from '../../../shared/techniques';

export function TechniqueCard({ hint, compact, onToggle }: { hint: Hint; compact?: boolean; onToggle?: () => void }) {
  return (
    <div
      className={`technique${hint.avoid ? ' is-avoid' : ''}${compact ? ' is-compact' : ''}${onToggle ? ' is-toggle' : ''}`}
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
      aria-expanded={onToggle ? !compact : undefined}
    >
      {hint.avoid && <div className="warn big">⊘ They marked this spot AVOID — move away</div>}
      {hint.symptom && (
        <div className="symptom-tag" style={{ color: hint.symptom.color }}>
          {hint.symptom.glyph} {hint.symptom.label} spot
        </div>
      )}
      {hint.technique && (
        <>
          <h3>
            {hint.technique.name}
            {onToggle && <span className="toggle-caret">{compact ? '▾ more' : '▴ less'}</span>}
          </h3>
          <p className="how">{hint.technique.how}</p>
          {!compact && <p className="why">{hint.technique.why}</p>}
        </>
      )}
      {(!compact || !hint.technique) && <p className="tip">💡 {hint.tip}</p>}
      {hint.cautions.map((c) => (
        <p key={c} className="caution">
          ⚠ {c}
        </p>
      ))}
      {hint.alternatives.length > 0 && !compact && (
        <p className="alts">Also good here: {hint.alternatives.map((t) => t.name).join(' · ')}</p>
      )}
    </div>
  );
}

export function ViewpointPicker() {
  const [settings, set] = useGiverSettings();
  return (
    <div className="viewpoints" role="radiogroup" aria-label="Where are you standing?">
      {VIEWPOINTS.map((v) => (
        <button
          key={v.angle}
          role="radio"
          aria-checked={settings.viewAngle === v.angle}
          className={`viewpoint${settings.viewAngle === v.angle ? ' is-on' : ''}`}
          onClick={() => set({ viewAngle: v.angle })}
        >
          <span className="viewpoint-icon" style={{ transform: `rotate(${v.angle}deg)` }}>
            ⬆
          </span>
          <strong>{v.label}</strong>
          <small>{v.hint}</small>
        </button>
      ))}
    </div>
  );
}

export function VoiceControls() {
  const [settings, set] = useGiverSettings();
  return (
    <div className="voice-controls">
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.voice}
          disabled={!speechSupported}
          onChange={(e) => {
            unlockSpeech();
            unlockAudio();
            set({ voice: e.target.checked });
            if (e.target.checked) say('Voice cues on. I will tell you where to go.', 'high');
          }}
        />
        Spoken cues (“higher”, “firmer”, area names){!speechSupported && ' — not supported in this browser'}
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.sounds}
          onChange={(e) => {
            unlockAudio();
            set({ sounds: e.target.checked });
          }}
        />
        Sound signals for feedback
      </label>
    </div>
  );
}

export function PlanList({
  plan,
  current,
  onGo,
}: {
  plan: Plan;
  current?: number;
  onGo?: (pos: { x: number; y: number }) => void;
}) {
  return (
    <div className="plan">
      <ol>
        {plan.steps.map((s, i) => (
          <li key={s.id} className={`plan-step kind-${s.kind}${i === current ? ' is-current' : ''}`}>
            <div className="plan-step-head">
              <span className="plan-min">{s.minutes}′</span>
              <strong>{s.title}</strong>
              {s.symptoms?.map((k) => (
                <span key={k} className="plan-sym" style={{ color: SYMPTOMS[k].color }} title={SYMPTOMS[k].label}>
                  {SYMPTOMS[k].glyph}
                </span>
              ))}
              {onGo && s.pos && (
                <button className="btn tiny" onClick={() => onGo(s.pos!)}>
                  Go here
                </button>
              )}
            </div>
            <p>{s.detail}</p>
          </li>
        ))}
      </ol>
      {plan.avoid.length > 0 && (
        <p className="caution">⊘ Stay clear of: {[...new Set(plan.avoid.map((a) => a.name))].join(', ')}</p>
      )}
    </div>
  );
}
