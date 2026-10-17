import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { AppShell } from './shell/AppShell.tsx';
import { AppStateProvider } from './state/AppState.tsx';
import './styles/index.css';
import { StartupGate } from './migration/StartupGate.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');

createRoot(root).render(
  <StrictMode>
    <StartupGate>
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
    </StartupGate>
  </StrictMode>,
);
