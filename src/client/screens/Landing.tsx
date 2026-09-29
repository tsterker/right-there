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
            <span aria-hidden>💻</span>
            <span>
              The <b>giver</b> starts here. This screen shows the map — a laptop is perfect.
            </span>
          </li>
          <li>
            <span aria-hidden>📱</span>
            <span>
              The <b>receiver</b> scans the code with their phone and lies down, phone beside them.
            </span>
          </li>
          <li>
            <span aria-hidden>☝️</span>
            <span>
              They move a finger to show where. Double-tap when it’s <b>right there</b>.
            </span>
          </li>
        </ol>

        <div className="landing-actions">
          <button className="btn primary big" onClick={() => navigate('/p2p/host/B', true)}>
            Start as the giver
          </button>
          <button className="btn big" onClick={() => navigate('/demo')}>
            ▶ Try the demo
          </button>
        </div>

        <p className="landing-receiver">
          Getting the massage? Scan the giver’s code with your phone’s camera,{' '}
          <button className="btn link inline" onClick={() => navigate('/p2p/scan', true)}>
            or scan it here
          </button>
          .
        </p>

        <p className="fineprint">Both devices on the same Wi-Fi. They connect directly — nothing goes through a server.</p>
      </div>
    </div>
  );
}
