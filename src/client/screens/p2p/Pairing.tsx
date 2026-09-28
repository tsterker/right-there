/**
 * Pairing without a server: the host shows a first code, the partner answers
 * with a second one. Codes travel as QR codes (camera) or copy/paste.
 */
import { useEffect, useRef, useState } from 'react';
import { ROLE_NAME, otherRole, type Role } from '../../../shared/session';
import { cameraAvailable, QrScanner } from '../../components/QrScanner';
import { QR } from '../../components/ui';
import { useLatest } from '../../lib/connection';
import { navigate } from '../../lib/router';
import { usePersisted } from '../../lib/storage';
import { joinLink, openedFromFile, p2pSettings } from '../../p2p/address';
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

/** Scan with the camera, or paste. Calls `onCode` with whatever was read. */
function ReadCode({ onCode, busy, scanHint }: { onCode: (text: string) => void; busy: boolean; scanHint: string }) {
  const [scanning, setScanning] = useState(false);
  const [text, setText] = useState('');
  const hasCamera = cameraAvailable();
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
          {hasCamera && (
            <button className="btn primary block" disabled={busy} onClick={() => setScanning(true)}>
              📷 Scan their code
            </button>
          )}
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
              placeholder="…or paste the code here"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn" type="submit" disabled={busy || !text.trim()}>
              Connect
            </button>
          </form>
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

function AppAddress() {
  const [settings, set] = usePersisted(p2pSettings);
  const [draft, setDraft] = useState(settings.appUrl);
  if (!openedFromFile()) return null;
  return (
    <details className="pair-options" open={!settings.appUrl && !import.meta.env.VITE_APP_URL}>
      <summary>Where does the other device open Right There?</summary>
      <p className="hint">
        This page runs from a file. If the app is also online (e.g. GitHub Pages), enter its address and the QR code will
        open it directly on the phone.
      </p>
      <form
        className="paste-row"
        onSubmit={(e) => {
          e.preventDefault();
          set({ appUrl: draft.trim() });
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://you.github.io/right-there/" />
        <button className="btn" type="submit">
          Save
        </button>
      </form>
    </details>
  );
}

/** Host: show the first code, then read the partner's reply. */
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
      async (o) => {
        if (!alive) return o.close();
        current = o;
        setOffer(o);
        setLink(await joinLink(o.code));
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
      if (current && !used.current) current.close();
    };
  }, [role, settings.stun, settings.appUrl, attempt]);

  const accept = async (text: string) => {
    if (!offer) return;
    setBusy(true);
    setError(null);
    try {
      const channel = await offer.accept(text);
      used.current = true;
      connected.current(channel, offer.close);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const partner = ROLE_NAME[otherRole(role)].toLowerCase();
  return (
    <div className={`pairing${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <header className="screen-head">
          <p className="eyebrow">
            No server · you are the {ROLE_NAME[role].toLowerCase()}
          </p>
          <h1>Connect the other device</h1>
        </header>
      )}
      <ol className="pair-steps">
        <li>
          <strong>
            {link && !link.isLink
              ? `On the ${partner}’s device, open Right There, tap “Scan their code” and point it here.`
              : `On the ${partner}’s device, scan this with the camera.`}
          </strong>
          {link && !link.isLink && (
            <p className="notice small">
              The phone’s normal camera app can’t open this code — it would only search the web for it. Once the app is online
              (e.g. on GitHub Pages) or its address is set below, this becomes a link the camera opens directly.
            </p>
          )}
          {link ? (
            <div className="pair-qr" data-code={offer?.code}>
              <QR text={link.text} size={compact ? 220 : 260} ecc="L" />
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
        </li>
        <li>
          <strong>Then read the code it shows.</strong>
          <ReadCode onCode={accept} busy={busy || !offer} scanHint="Point at the code on the other screen" />
          {busy && <p className="hint">Connecting…</p>}
        </li>
      </ol>
      {error && <p className="notice">{error}</p>}
      <AppAddress />
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
  return (
    <div className={`pairing${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <header className="screen-head">
          <p className="eyebrow">No server{role && ` · you will be the ${ROLE_NAME[role].toLowerCase()}`}</p>
          <h1>Almost there</h1>
        </header>
      )}
      {error ? (
        <p className="notice">{error}</p>
      ) : answer ? (
        <>
          <p className="lead">Show this to the other device — hold it in front of its camera (on a laptop: the webcam).</p>
          <div className="pair-qr" data-code={answer.code}>
            <QR text={answer.code} size={compact ? 240 : 300} ecc="L" />
            <CopyButton text={answer.code} />
          </div>
          <p className="waiting">
            <span className="pulse" /> Waiting for the other device…
          </p>
          <p className="hint">No camera there? Copy the code and paste it on the other device (on Apple devices the clipboard syncs).</p>
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
        busy={false}
        scanHint="Point at the code on the other device"
        onCode={(text) => {
          try {
            const s = decodeSignal(text);
            if (s.kind !== 'offer') throw new Error('That is a reply code — show it to the other device instead.');
            setError(null);
            onOffer(text);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {error && <p className="notice">{error}</p>}
    </div>
  );
}
