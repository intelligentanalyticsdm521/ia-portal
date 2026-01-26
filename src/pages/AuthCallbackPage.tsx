import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getMsalInitialized } from '../auth/pca';

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // React.StrictMode in dev runs effects twice; this prevents double-processing.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const pca = await getMsalInitialized();
        await pca.handleRedirectPromise();
        setDone(true);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    };

    void run();
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Sign-in failed</h2>
        <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    );
  }

  if (!done) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Signing you in…</h2>
      </div>
    );
  }

  return <Navigate to="/app/overview" replace />;
}
