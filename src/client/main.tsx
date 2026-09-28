import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isEmbedded } from './lib/router';
import './styles.css';

if (isEmbedded) document.documentElement.classList.add('is-embedded');

createRoot(document.getElementById('root')!).render(<App />);
