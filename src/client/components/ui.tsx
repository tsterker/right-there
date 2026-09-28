/** Small shared UI pieces. */
import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { PRESSURE } from '../../shared/techniques';

export function PressureMeter({ level, compact }: { level: number; compact?: boolean }) {
  return (
    <div className={`pressure${compact ? ' is-compact' : ''}`} aria-label={`Pressure ${level} of 5`}>
      <div className="pressure-bars">
        {PRESSURE.map((p) => (
          <span key={p.level} className={p.level <= level ? 'on' : ''} style={{ height: `${30 + p.level * 14}%` }} />
        ))}
      </div>
      {!compact && <span className="pressure-label">{PRESSURE[level - 1]?.label}</span>}
    </div>
  );
}

export function QR({ text, size = 180, ecc = 'M' }: { text: string; size?: number; ecc?: 'L' | 'M' }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: ecc, color: { dark: '#0e1116', light: '#f4efe9' } }).then(
      (s) => alive && setSvg(s),
    );
    return () => {
      alive = false;
    };
  }, [text, ecc]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
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
