import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import { getMsalInitialized } from '../auth/pca';

type CallbackState =
  | { status: 'working' }
  | { status: 'ok' }
  | { status: 'no_account'; message: string }
  | { status: 'error'; message: string };

export function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>({ status: 'working' });

  // Prevent double-processing under React.StrictMode
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const pca = await getMsalInitialized();

        // IMPORTANT: capture the result and set the active account
        const result: AuthenticationResult | null = await pca.handleRedirectPromise();

        let account: AccountInfo | null = result?.account ?? null;

        // Some flows return null result but still populate the cache.
        // Try to recover from cache if needed.
        if (!account) {
          const accounts = pca.getAllAccounts();
          if (accounts.length > 0) {
            account = accounts[0];
          }
        }

        if (!account) {
          setState({
            status: 'no_account',
            message:
              'Sign-in completed but no account was stored. Please try signing in again. ' +
              'If this persists, we will inspect MSAL cache and redirect handling.'
          });
          return;
        }

        // Set active account so subsequent token calls work reliably.
        pca.setActiveAccount(account);

        setState({ status: 'ok' });
      } catch (e: any) {
        setState({ status: 'error', message: e?.message || String(e) });
      }
    };

    void run();
  }, []);

  if (state.status === 'error') {
    return (
      <div style={{ padding: 24 }}>
        <h2>Sign-in failed</h2>
        <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{state.message}</pre>
      </div>
    );
  }

  if (state.status === 'no_account') {
    return (
      <div style={{ padding: 24 }}>
        <h2>Sign-in incomplete</h2>
        <p style={{ marginTop: 12 }}>{state.message}</p>
        <p style={{ marginTop: 12 }}>
          <a href="/" style={{ textDecoration: 'underline' }}>
            Return to sign-in
          </a>
        </p>
      </div>
    );
  }

  if (state.status !== 'ok') {
    return (
      <div style={{ padding: 24 }}>
        <h2>Signing you in…</h2>
      </div>
    );
  }

  // Now that an account is active, proceed into the app.
  return <Navigate to="/app/overview" replace />;
}
