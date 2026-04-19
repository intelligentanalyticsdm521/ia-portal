/**
 * AuthProvider — thin wrapper around MSAL's React provider that uses the
 * SAME PublicClientApplication instance as pca.ts (the singleton).
 *
 * Bug history (fixed 2026-04-19):
 * Previous version constructed its own `new PublicClientApplication(msalConfig)`
 * at module top-level. Meanwhile main.tsx called initMsal() which constructed
 * a DIFFERENT instance in pca.ts. Both instances shared localStorage but had
 * separate in-memory state and both tried to process the redirect hash. One
 * would win (clearing the hash) and the other would throw
 * `BrowserAuthError: hash_empty_error` when it tried to read the already-
 * consumed hash.
 *
 * Fix: use ONE instance from pca.ts. Gate rendering on initMsal() resolving
 * so MsalProvider always receives a post-init instance with valid state.
 */
import { MsalProvider } from '@azure/msal-react';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import type { IPublicClientApplication } from '@azure/msal-browser';
import { initMsal, getMsal } from './pca';

export function AuthProvider({ children }: PropsWithChildren) {
  const [msal, setMsal] = useState<IPublicClientApplication | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    initMsal()
      .then(() => {
        if (!cancelled) setMsal(getMsal());
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#dc2626' }}>
        <h2 style={{ marginBottom: 8 }}>Authentication service unavailable</h2>
        <p style={{ marginBottom: 12 }}>
          [{error.name}] {error.message}
        </p>
        <p>Hard-refresh (Ctrl+Shift+R) to retry. If this persists, contact support.</p>
      </div>
    );
  }

  if (!msal) {
    // Brief splash while MSAL is initializing. Usually <100ms.
    return null;
  }

  return <MsalProvider instance={msal}>{children}</MsalProvider>;
}
