import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if (new URLSearchParams(location.search).has('demo')) document.documentElement.classList.add('is-embedded');

createRoot(document.getElementById('root')!).render(<App />);
