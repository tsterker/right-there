/** Small shared UI pieces. */
import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { PRESSURE_LEVELS } from '../../shared/session';
import { fullscreenSupported, isStandalone, setFullscreen } from '../lib/fullscreen';
import { inDemo } from '../lib/demo';
import { useDeviceSettings } from '../lib/settings';

export function QR({ text, size = 180, ecc = 'M', light = '#f4efe9' }: { text: string; size?: number; ecc?: 'L' | 'M'; light?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: ecc, color: { dark: '#0e1116', light } }).then(
      (s) => alive && setSvg(s),
    );
    return () => {
      alive = false;
    };
  }, [text, ecc, light]);
  return <div className="qr" style={{ width: size, height: size, background: light }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          {title && <h3>{title}</h3>}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number | null>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Transient message that fades out. `id` changes retrigger it. */
export function Toast({ id, children }: { id: string | number | null; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (id == null) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 1800);
    return () => window.clearTimeout(t);
  }, [id]);
  if (!visible || id == null) return null;
  return (
    <div className="toast" key={id}>
      {children}
    </div>
  );
}

/** The menu's full-screen switch; where pages can't go full screen (iPhone), how to get it anyway. */
export function FullscreenToggle() {
  const [settings] = useDeviceSettings();
  if (inDemo || isStandalone) return null;
  if (!fullscreenSupported) {
    return (
      <p className="hint">
        No full screen in this browser. Add Right There to your Home Screen (Share → Add to Home Screen) and start it from
        there.
      </p>
    );
  }
  return (
    <label className="toggle">
      <input type="checkbox" checked={settings.fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />
      Full screen (no browser bars to bump)
    </label>
  );
}

/** How firmly to press: rising bars, lit up to the level. */
export function PressureMeter({ level }: { level: number }) {
  return (
    <span className="pressure-meter" role="img" aria-label={`Pressure ${level} of ${PRESSURE_LEVELS}`}>
      {Array.from({ length: PRESSURE_LEVELS }, (_, i) => (
        <i key={i} className={i < level ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="screen center-screen">
      <div className="spinner" aria-hidden />
      <p>{text}</p>
    </div>
  );
}
