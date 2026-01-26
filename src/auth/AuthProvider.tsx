import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import type { PropsWithChildren } from 'react';
import { msalConfig } from './msalConfig';

const msalInstance = new PublicClientApplication(msalConfig);

export function AuthProvider({ children }: PropsWithChildren) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
