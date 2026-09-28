import { useEffect, useState } from 'react';
import { otherRole, ROLE_NAME } from '../../shared/session';
import { QR } from '../components/ui';
import { shareableUrl } from '../lib/api';
import { useSession } from '../lib/connection';
import { navigate } from '../lib/router';

export function Lobby() {
  const { code, role } = useSession();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void shareableUrl(`/join/${code}`).then(setUrl);
  }, [code]);
  const partner = otherRole(role);
  const canShare = typeof navigator.share === 'function';

  const share = async () => {
    if (!url) return;
    if (canShare) {
      await navigator.share({ title: 'Right There', text: `Join my massage session — code ${code}`, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
    }
  };

  return (
    <div className="screen lobby">
      <div className="scroll center-col">
        <p className="eyebrow">
          You are the {ROLE_NAME[role].toLowerCase()} · {role === 'A' ? 'getting the massage' : 'giving the massage'}
        </p>
        <h1>Connect the other phone</h1>
        <div className="code-digits" aria-label={`Session code ${code}`}>
          {code.split('').map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <p className="lead">
          On the {ROLE_NAME[partner].toLowerCase()}’s phone open Right There and enter this code — or scan with the camera:
        </p>
        {url && <QR text={url} size={196} />}
        {url && (
          <button className="btn ghost small" onClick={share}>
            {copied ? 'Link copied ✓' : canShare ? 'Share link…' : 'Copy link'}
          </button>
        )}
        {url && <p className="link-text">{url}</p>}
        <p className="waiting">
          <span className="pulse" /> Waiting for the {ROLE_NAME[partner].toLowerCase()}…
        </p>
        <button className="btn link" onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
