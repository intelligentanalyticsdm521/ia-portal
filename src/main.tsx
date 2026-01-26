import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

import { AuthProvider } from './auth/AuthProvider';
import { initMsal } from './auth/pca';

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
