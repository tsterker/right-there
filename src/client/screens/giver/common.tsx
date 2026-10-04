import { useGiverSettings, VIEWPOINTS } from '../../lib/settings';
import { say, speechSupported, unlockSpeech } from '../../lib/speech';

export function ViewpointPicker({ onPicked }: { onPicked?: () => void }) {
  const [settings, set] = useGiverSettings();
  return (
    <div className="viewpoints" role="radiogroup" aria-label="Where are you standing?">
      {VIEWPOINTS.map((v) => (
        <button
          key={v.angle}
          role="radio"
          aria-checked={settings.viewAngle === v.angle}
          className={`viewpoint${settings.viewAngle === v.angle ? ' is-on' : ''}`}
          onClick={() => {
            set({ viewAngle: v.angle, viewChosen: true });
            onPicked?.();
          }}
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

export function VoiceToggle() {
  const [settings, set] = useGiverSettings();
  if (!speechSupported) return null;
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={settings.voice}
        onChange={(e) => {
          unlockSpeech();
          set({ voice: e.target.checked });
          if (e.target.checked) say('Voice on. I will tell you where to go.', 'high');
        }}
      />
      Spoken cues (“higher”, “firmer”, “right there”, area names)
    </label>
  );
}
