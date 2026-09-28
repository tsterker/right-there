import { parseHash, useHash } from './lib/router';
import { Demo } from './screens/Demo';
import { Landing } from './screens/Landing';
import { P2PHostRoute, P2PJoinRoute, P2PScanRoute } from './screens/p2p/P2PRoutes';
import { DemoJoin } from './screens/p2p/Pairing';

export function App() {
  const route = parseHash(useHash());
  switch (route.name) {
    case 'host':
      return <P2PHostRoute key={route.role} role={route.role} />;
    case 'join':
      return <P2PJoinRoute key={route.code} code={route.code} />;
    case 'scan':
      return <P2PScanRoute />;
    case 'demo':
      return <Demo />;
    case 'demo-join':
      return <DemoJoin />;
    default:
      return <Landing />;
  }
}
