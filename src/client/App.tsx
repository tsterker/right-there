import { parseHash, useHash } from './lib/router';
import { Demo } from './screens/Demo';
import { History } from './screens/History';
import { JoinRoute } from './screens/Join';
import { Landing } from './screens/Landing';
import { SessionRoute } from './screens/Session';
import { P2PHostRoute, P2PJoinRoute, P2PScanRoute } from './screens/p2p/P2PRoutes';

export function App() {
  const route = parseHash(useHash());
  switch (route.name) {
    case 'join':
      return <JoinRoute key={route.code} code={route.code} />;
    case 'session':
      return <SessionRoute key={`${route.code}-${route.role}`} code={route.code} role={route.role} />;
    case 'demo':
      return <Demo />;
    case 'history':
      return <History />;
    case 'p2p-host':
      return <P2PHostRoute key={route.role} role={route.role} />;
    case 'p2p-join':
      return <P2PJoinRoute key={route.code} code={route.code} />;
    case 'p2p-scan':
      return <P2PScanRoute />;
    default:
      return <Landing />;
  }
}
