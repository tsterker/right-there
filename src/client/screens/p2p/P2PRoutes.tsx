/**
 * Sessions. The host device runs the session; the partner connects over a
 * direct WebRTC link. After pairing: the receiver's pad or the giver's map.
 */
import { useEffect, useState } from 'react';
import { otherRole, ROLE_NAME, type Role } from '../../../shared/session';
import { Loading, Sheet } from '../../components/ui';
import { SessionConnection, SessionContext, useConnection, useSession } from '../../lib/connection';
import { navigate } from '../../lib/router';
import { useKeepAwake } from '../../lib/wakeLock';
import { ChannelLink, PeerHost } from '../../p2p/host';
import { extractCode } from '../../p2p/signal';
import { GiverLive } from '../giver/Live';
import { Receiver } from '../receiver/Receiver';
import { GuestPairing, HostPairing, ScanFirstCode } from './Pairing';

function SessionScreens() {
  const { role } = useSession();
  return role === 'A' ? <Receiver /> : <GiverLive />;
}

/** `#/p2p/host/A`: this device hosts; show pairing until the partner is connected. */
export function P2PHostRoute({ role }: { role: Role }) {
  const [host] = useState(() => new PeerHost(role));
  const api = useConnection(() => new SessionConnection(host.code, host.role, host.localLink()));
  useKeepAwake();
  useEffect(() => () => host.close(), [host]);
  const [repair, setRepair] = useState(false);

  if (!api.state) return <Loading text="Starting…" />;
  const partner = api.state.members[otherRole(api.role)];
  const partnerHere = partner.connected;
  const attach = (channel: RTCDataChannel, dispose: () => void) => {
    host.attachPartner(channel, dispose);
    setRepair(false);
  };
  return (
    <SessionContext.Provider value={api}>
      {!partner.joined ? (
        <div className="screen p2p">
          <div className="scroll">
            <HostPairing role={api.role} onConnected={attach} onCancel={() => navigate('/')} />
          </div>
        </div>
      ) : (
        <>
          <SessionScreens />
          {!partnerHere && (
            <div className="conn-notice with-action">
              The {ROLE_NAME[otherRole(api.role)].toLowerCase()}’s device is disconnected.
              <button className="btn small" onClick={() => setRepair(true)}>
                Reconnect
              </button>
            </div>
          )}
          <Sheet open={repair && !partnerHere} onClose={() => setRepair(false)} title="Reconnect the other device">
            <HostPairing role={api.role} compact onConnected={attach} onCancel={() => setRepair(false)} />
          </Sheet>
        </>
      )}
    </SessionContext.Provider>
  );
}

/** `#/p2p/join/<code>`: answer the host's code, then join its session. */
export function P2PJoinRoute({ code }: { code: string }) {
  const [link] = useState(() => new ChannelLink());
  const [joined, setJoined] = useState<{ role: Role } | null>(null);
  useEffect(() => () => link.close(), [link]);
  if (!joined) {
    return (
      <div className="screen p2p">
        <div className="scroll">
          <GuestPairing
            offerCode={code}
            onConnected={(channel, dispose, hostRole) => {
              link.use(channel, dispose);
              setJoined({ role: otherRole(hostRole) });
            }}
            onCancel={() => navigate('/')}
          />
        </div>
      </div>
    );
  }
  return <GuestSession link={link} role={joined.role} />;
}

function GuestSession({ link, role }: { link: ChannelLink; role: Role }) {
  const api = useConnection(() => new SessionConnection('', role, link));
  useKeepAwake();
  if (!api.state) return <Loading text="Joining the session…" />;
  return (
    <SessionContext.Provider value={api}>
      <SessionScreens />
      {api.status !== 'online' && <GuestReconnect link={link} />}
    </SessionContext.Provider>
  );
}

/** The link to the host dropped: read the host's new code to continue where we were. */
function GuestReconnect({ link }: { link: ChannelLink }) {
  const { role } = useSession();
  const [offer, setOffer] = useState<string | null>(null);
  const host = ROLE_NAME[otherRole(role)].toLowerCase();
  return (
    <div className="overlay p2p-reconnect">
      <div className="scroll">
        <h2>Connection lost</h2>
        {offer ? (
          <GuestPairing
            compact
            offerCode={offer}
            onConnected={(channel, dispose) => link.use(channel, dispose)}
            onCancel={() => setOffer(null)}
          />
        ) : (
          <>
            <p className="lead">
              Ask the {host} to tap <b>Reconnect</b> on their device, then scan the new code here.
            </p>
            <ScanFirstCode onOffer={(c) => setOffer(extractCode(c))} />
          </>
        )}
        <button className="btn link" onClick={() => navigate('/')}>
          Leave the session
        </button>
      </div>
    </div>
  );
}

/** `#/p2p/scan`: join by scanning the host's code inside the app. */
export function P2PScanRoute() {
  return (
    <div className="screen p2p">
      <div className="scroll">
        <header className="screen-head">
          <p className="eyebrow">Join</p>
          <h1>Scan the other device’s code</h1>
          <p className="lead">The one who started shows a QR code. Point this camera at it — or paste the code.</p>
        </header>
        <ScanFirstCode onOffer={(c) => navigate(`/p2p/join/${extractCode(c)}`, true)} />
        <button className="btn link" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </div>
  );
}
