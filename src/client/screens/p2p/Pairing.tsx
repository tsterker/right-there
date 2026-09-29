/**
 * Pairing: the host (usually the giver, often on a laptop) shows a first
 * code; the partner's phone scans it with its camera app and answers with a
 * second code, which the host's camera reads. Pasting works as a fallback.
 */
import { useEffect, useRef, useState } from 'react';
import { ROLE_NAME, otherRole, type Role } from '../../../shared/session';
import { cameraAvailable, QrScanner } from '../../components/QrScanner';
import { QR } from '../../components/ui';
import { useLatest } from '../../lib/connection';
import { navigate } from '../../lib/router';
import { usePersisted } from '../../lib/storage';
import { joinLink, p2pSettings } from '../../p2p/address';
import { createAnswer, createOffer, type GuestAnswer, type HostOffer } from '../../p2p/peer';
import { decodeSignal } from '../../p2p/signal';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label = 'Copy code' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn ghost small" onClick={async () => setDone(await copy(text))}>
      {done ? 'Copied ✓' : label}
    </button>
  );
}

const kindOf = (text: string) => {
  try {
    return decodeSignal(text).kind;
  } catch {
    return null;
  }
};

function PasteCode({ onCode, busy, placeholder = 'Paste the code here' }: { onCode: (text: string) => void; busy: boolean; placeholder?: string }) {
  const [text, setText] = useState('');
  return (
    <form
      className="paste-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onCode(text);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button className="btn" type="submit" disabled={busy || !text.trim()}>
        Connect
      </button>
    </form>
  );
}

/** Scan with the camera, or paste. Calls `onCode` with whatever was read. */
function ReadCode({ onCode, scanHint }: { onCode: (text: string) => void; scanHint: string }) {
  const [scanning, setScanning] = useState(false);
  return (
    <div className="read-code">
      {scanning ? (
        <>
          <QrScanner
            hint={scanHint}
            onResult={(t) => {
              setScanning(false);
              onCode(t);
            }}
          />
          <button className="btn ghost small" onClick={() => setScanning(false)}>
            Stop camera
          </button>
        </>
      ) : (
        <>
          {cameraAvailable() && (
            <button className="btn primary block" onClick={() => setScanning(true)}>
              📷 Scan the code
            </button>
          )}
          <PasteCode onCode={onCode} busy={false} placeholder="…or paste the code here" />
        </>
      )}
    </div>
  );
}

function NetworkOptions() {
  const [settings, set] = usePersisted(p2pSettings);
  return (
    <details className="pair-options">
      <summary>Not connecting?</summary>
      <ul>
        <li>Both devices on the same Wi-Fi (or one phone's hotspot). Guest and hotel Wi-Fi often block this.</li>
        <li>
          <label className="toggle">
            <input type="checkbox" checked={settings.stun} onChange={(e) => set({ stun: e.target.checked })} />
            Use a public STUN helper (Google) — for tricky networks. Both devices should have this on.
          </label>
        </li>
      </ul>
    </details>
  );
}

/** Host: ① show the first code, ② read the partner's reply with the camera (or paste it). */
export function HostPairing({
  role,
  onConnected,
  onCancel,
  compact,
}: {
  role: Role;
  onConnected: (channel: RTCDataChannel, dispose: () => void) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [settings] = usePersisted(p2pSettings);
  const [offer, setOffer] = useState<HostOffer | null>(null);
  const [link, setLink] = useState<{ text: string; isLink: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Restarts the camera after a reply that didn't work out. */
  const [scan, setScan] = useState(0);
  const used = useRef(false);
  const connected = useLatest(onConnected);

  useEffect(() => {
    let alive = true;
    let current: HostOffer | null = null;
    setOffer(null);
    setLink(null);
    setError(null);
    used.current = false;
    createOffer(role, { stun: settings.stun }).then(
      (o) => {
        if (!alive) return o.close();
        current = o;
        setOffer(o);
        setLink(joinLink(o.code));
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
      if (current && !used.current) current.close();
    };
  }, [role, settings.stun, attempt]);

  const accept = async (text: string) => {
    if (!offer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const channel = await offer.accept(text);
      used.current = true;
      connected.current(channel, offer.close);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setScan((n) => n + 1);
    }
  };

  const partner = ROLE_NAME[otherRole(role)].toLowerCase();
  const device = role === 'B' ? 'their phone' : 'the giver’s device';
  return (
    <div className={`pairing host-pairing${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <header className="screen-head">
          <p className="eyebrow">You are the {ROLE_NAME[role].toLowerCase()}</p>
          <h1>Connect the {partner}’s {role === 'B' ? 'phone' : 'device'}</h1>
        </header>
      )}
      <div className="pair-flow">
        <section className="pair-card">
          <h2>
            <span className="step-num">1</span> Scan this with {device}’s camera
          </h2>
          {link ? (
            <div className="pair-qr" data-code={offer?.code} data-link={link.text}>
              <QR text={link.text} size={compact ? 200 : 240} ecc="L" />
              <div className="row center-row">
                <CopyButton text={link.text} label={link.isLink ? 'Copy link' : 'Copy code'} />
                <button className="btn ghost small" onClick={() => setAttempt((n) => n + 1)}>
                  New code
                </button>
              </div>
            </div>
          ) : (
            !error && <div className="spinner" aria-label="Preparing" />
          )}
        </section>
        <div className="pair-arrow" aria-hidden>
          →
        </div>
        <section className="pair-card">
          <h2>
            <span className="step-num">2</span> Then hold {device} up to this camera
          </h2>
          {cameraAvailable() && offer && !busy && (
            <QrScanner
              key={scan}
              facing="user"
              hint="Their code goes here"
              onResult={(t) => {
                if (kindOf(t) !== 'answer') return false;
                void accept(t);
              }}
            />
          )}
          {busy && <p className="waiting">Connecting…</p>}
          <details className="pair-paste" open={!cameraAvailable()}>
            <summary>No camera? Paste their code</summary>
            <PasteCode onCode={accept} busy={busy || !offer} />
          </details>
        </section>
      </div>
      {error && <p className="notice">{error}</p>}
      <NetworkOptions />
      {onCancel && (
        <button className="btn link" onClick={onCancel}>
          {compact ? 'Close' : 'Cancel'}
        </button>
      )}
    </div>
  );
}

/** Partner: turn the host's first code into a reply code and wait for the connection. */
export function GuestPairing({
  offerCode,
  onConnected,
  onCancel,
  compact,
}: {
  offerCode: string;
  onConnected: (channel: RTCDataChannel, dispose: () => void, hostRole: Role) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [settings] = usePersisted(p2pSettings);
  const [answer, setAnswer] = useState<GuestAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = useLatest(onConnected);

  useEffect(() => {
    let alive = true;
    let current: GuestAnswer | null = null;
    let used = false;
    setAnswer(null);
    setError(null);
    createAnswer(offerCode, { stun: settings.stun }).then(
      (a) => {
        if (!alive) return a.close();
        current = a;
        setAnswer(a);
        a.opened.then(
          (channel) => {
            if (!alive) return;
            used = true;
            connected.current(channel, a.close, a.offer.role);
          },
          (e: Error) => alive && setError(e.message),
        );
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
      if (current && !used) current.close();
    };
  }, [offerCode, settings.stun, connected]);

  const role = answer ? otherRole(answer.offer.role) : null;
  const host = role ? ROLE_NAME[otherRole(role)].toLowerCase() : 'other';
  return (
    <div className={`pairing guest-pairing${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <header className="screen-head">
          <p className="eyebrow">{role ? `You will be the ${ROLE_NAME[role].toLowerCase()}` : 'Joining'}</p>
          <h1>
            <span className="step-num">2</span> Hold this up to the {host}’s camera
          </h1>
        </header>
      )}
      {error ? (
        <p className="notice">{error}</p>
      ) : answer ? (
        <>
          {compact && <p className="lead">Hold this up to the {host}’s camera.</p>}
          <div className="pair-qr" data-code={answer.code}>
            <QR text={answer.code} size={compact ? 240 : 300} ecc="L" light="#ffffff" />
          </div>
          <p className="waiting">
            <span className="pulse" /> Waiting for their screen to read it…
          </p>
          <details className="pair-options">
            <summary>Their device has no camera?</summary>
            <p className="hint">Copy the code and paste it there (on Apple devices the clipboard syncs).</p>
            <CopyButton text={answer.code} />
          </details>
          {!compact && (
            <button className="btn link" onClick={() => navigate('/p2p/scan', true)}>
              The other device shows a new code? Scan it instead
            </button>
          )}
        </>
      ) : (
        <div className="spinner" aria-label="Preparing" />
      )}
      <NetworkOptions />
      {onCancel && (
        <button className="btn link" onClick={onCancel}>
          {compact ? 'Close' : 'Cancel'}
        </button>
      )}
    </div>
  );
}

/** Read a first code (from the host) by camera or paste. */
export function ScanFirstCode({ onOffer }: { onOffer: (code: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pairing">
      <ReadCode
        scanHint="Point at the code on the giver’s screen"
        onCode={(text) => {
          const kind = kindOf(text);
          if (kind === 'offer') {
            setError(null);
            onOffer(text);
          } else {
            setError(kind === 'answer' ? 'That is a reply code — show it to the other device instead.' : 'That doesn’t look like a Right There code.');
          }
        }}
      />
      {error && <p className="notice">{error}</p>}
    </div>
  );
}
