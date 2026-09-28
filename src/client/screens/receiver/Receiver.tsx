/** The receiver's device: the two setup swipes first, then straight to pointing. */
import { useEffect, useState } from 'react';
import { describeOrientation } from '../../../shared/calibration';
import { ReceiverPad, type Notice } from './Pad';
import { ReceiverSetup } from './Setup';
import { useMapLearning } from './sync';

export function Receiver() {
  const [setup, setSetup] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const learned = useMapLearning();
  useEffect(() => {
    if (learned) setNotice({ id: learned, text: 'Map calibration improved ✓' });
  }, [learned]);

  if (setup) {
    return (
      <ReceiverSetup
        onDone={(o) => {
          setSetup(false);
          setNotice({ id: Date.now(), text: `Got it — the ${describeOrientation(o)}` });
        }}
      />
    );
  }
  return <ReceiverPad notice={notice} onRedoSetup={() => setSetup(true)} />;
}
