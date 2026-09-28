import { useEffect, useState } from 'react';
import type { Role } from '../../shared/session';
import { createRoom, relayAvailable } from '../lib/api';
import { loadHistory } from '../lib/history';
import { navigate } from '../lib/router';
import { loadLastSession, loadToken } from '../lib/storage';

export function Landing() {
  const [busy, setBusy] = useState<Role | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const last = loadLastSession();
  const canResume =
    last.code && last.role && Date.now() - last.at < 3 * 60 * 60 * 1000 && loadToken(last.code, last.role) != null;
  const historyCount = loadHistory().length;
  // Served by the Right There server → 4-digit codes; opened as a file / from static hosting → direct pairing.
  const [relay, setRelay] = useState<boolean | null>(null);
  const [direct, setDirect] = useState(false);
  useEffect(() => {
    void relayAvailable().then(setRelay);
  }, []);
  const serverless = relay === false;

  const start = async (role: Role) => {
    if (serverless || direct || !(await relayAvailable())) {
      navigate(`/p2p/host/${role}`, true);
      return;
    }
    setBusy(role);
    setError(null);
    try {
      const r = await createRoom(role);
      navigate(`/s/${r.code}/${r.role}`, true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^\d{4}$/.test(code)) navigate(`/join/${code}`, true);
    else setError('The code has 4 digits.');
  };

  return (
    <div className="screen landing">
      <div className="scroll center-col">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◉
          </span>
          <h1>Right There</h1>
          <p className="tagline">Show where it feels good — without saying a word.</p>
        </div>

        <ol className="how-it-works">
          <li>
            <b>Receiver</b> lies down, phone beside them, and moves a finger to guide.
          </li>
          <li>
            <b>Giver</b> sees a map of the back with a dot — plus what to do there.
          </li>
          <li>“Firmer”, “softer”, “that’s the spot ♥” with a tap. It learns your aim over time.</li>
        </ol>

        <div className="role-cards">
          <button className="role-card role-a" disabled={busy != null} onClick={() => start('A')}>
            <span className="role-emoji">🛏</span>
            <strong>I'm getting the massage</strong>
            <small>This phone becomes the touch pad</small>
          </button>
          <button className="role-card role-b" disabled={busy != null} onClick={() => start('B')}>
            <span className="role-emoji">👐</span>
            <strong>I'm giving the massage</strong>
            <small>This phone shows the back map</small>
          </button>
        </div>

        {serverless ? (
          <div className="join">
            <label>Joining the other device?</label>
            <button className="btn primary" onClick={() => navigate('/p2p/scan', true)}>
              📷 Scan their code
            </button>
            <p className="hint">No server needed: the two devices connect directly on the same Wi-Fi.</p>
          </div>
        ) : (
        <form className="join" onSubmit={join}>
          <label htmlFor="code">Have a code?</label>
          <div className="join-row">
            <input
              id="code"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4}"
              maxLength={4}
              placeholder="1234"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <button className="btn primary" type="submit" disabled={code.length !== 4}>
              Join
            </button>
          </div>
        </form>
        )}

        {relay && (
          <label className="toggle direct-toggle">
            <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
            Pair directly with QR codes instead (no server in between)
          </label>
        )}
        {relay && direct && (
          <button className="btn ghost small" onClick={() => navigate('/p2p/scan', true)}>
            📷 Scan the other device’s code
          </button>
        )}

        {error && <p className="notice">{error}</p>}

        <div className="landing-links">
          {canResume && (
            <button className="btn ghost small" onClick={() => navigate(`/s/${last.code}/${last.role}`, true)}>
              ↩ Back to session {last.code}
            </button>
          )}
          {relay && (
            <button className="btn ghost small" onClick={() => navigate('/demo')}>
              Try both screens side by side
            </button>
          )}
          {historyCount > 0 && (
            <button className="btn ghost small" onClick={() => navigate('/history')}>
              Past sessions ({historyCount})
            </button>
          )}
        </div>

        <p className="fineprint">
          Prototype (working title). Friendly home-massage tips, not medical advice. Stop if anything causes sharp pain,
          numbness or tingling.
        </p>
      </div>
    </div>
  );
}
