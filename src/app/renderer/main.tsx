import { createRoot } from 'react-dom/client';
import { App } from './app/index';
import './styles/tokens.css';
import './styles/base.css';
createRoot(document.getElementById('root')!).render(<App />);
