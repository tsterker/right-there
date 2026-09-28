import { navigate } from '../lib/router';

export function Landing() {
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
            <b>Receiver</b> lies down, phone beside them, and moves a finger to show where.
          </li>
          <li>
            <b>Giver</b> sees the spot on a map of the back.
          </li>
          <li>
            Double-tap when it’s <b>right there</b>.
          </li>
        </ol>

        <div className="role-cards">
          <button className="role-card role-a" onClick={() => navigate('/p2p/host/A', true)}>
            <span className="role-emoji">🛏</span>
            <strong>I'm getting the massage</strong>
            <small>This device becomes the touch pad</small>
          </button>
          <button className="role-card role-b" onClick={() => navigate('/p2p/host/B', true)}>
            <span className="role-emoji">👐</span>
            <strong>I'm giving the massage</strong>
            <small>This device shows the back map</small>
          </button>
        </div>

        <div className="join">
          <label>The other device already shows a code?</label>
          <button className="btn primary" onClick={() => navigate('/p2p/scan', true)}>
            📷 Scan their code
          </button>
        </div>

        {import.meta.env.DEV && (
          <button className="btn ghost small" onClick={() => navigate('/demo')}>
            Both screens side by side (dev)
          </button>
        )}

        <p className="fineprint">Both devices on the same Wi-Fi. They connect directly — nothing goes through a server.</p>
      </div>
    </div>
  );
}
