import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

import { AuthProvider } from './auth/AuthProvider';
import { initMsal } from './auth/pca';
import { installDevAuthFetch } from './lib/devAuth';

// LOCAL DEV ONLY — attach x-dev-tenant to loopback API calls so the Portal can
// run without CIAM. No-op unless VITE_DEV_AUTH=1, and Vite compiles it out of a
// production build entirely. Must run before anything issues a fetch.
installDevAuthFetch();

// 2026-06-13 — Stale-chunk recovery. When the Portal redeploys, the JS chunk
// hashes in the new build don't match the chunks the user's already-loaded
// SPA shell knows about. Any lazy-imported page (Vite code-splits each route)
// fails to fetch its chunk and the page renders blank. Vite emits a
// `vite:preloadError` event for exactly this case — reload to pick up the
// fresh index.html + new chunk names.
//
// `preventDefault()` stops React's error boundary from showing the
// "Something went wrong" screen during the half-second before the reload
// fires. One-shot: only reload once per session to avoid loops if the
// reload itself triggers another preload error.
let preloadReloaded = false;
window.addEventListener('vite:preloadError', (e) => {
  if (preloadReloaded) return;
  preloadReloaded = true;
  e.preventDefault();
  console.warn('[portal] stale chunk after deploy — reloading');
  window.location.reload();
});

async function bootstrap() {
  await initMsal();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error('MSAL bootstrap failed:', err);
});
