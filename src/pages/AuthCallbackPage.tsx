import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { initMsal } from '../auth/pca';

export function AuthCallbackPage() {
  // Ensure MSAL init runs (it processes redirect globally).
  useEffect(() => {
    void initMsal();
  }, []);

  // After init, we can go into the app.
  return <Navigate to="/app/overview" replace />;
}
