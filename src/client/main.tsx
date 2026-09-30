import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LookTuner } from './components/LookTuner';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <LookTuner />
  </>,
);
