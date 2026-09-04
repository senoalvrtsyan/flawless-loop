// Client entry point (B08). Mounts React and nothing else — no store, no cache, no persistence.
//
// DESIGN §3: the client owns NOTHING durable. No localStorage, no IndexedDB, no service worker.
// Everything on screen came from `/api/snapshot` on this page load, which is what makes the
// refresh test (HR1) a test of the server rather than of the browser.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
