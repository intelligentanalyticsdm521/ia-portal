import {
  InteractionRequiredAuthError,
  BrowserAuthError,
  type AccountInfo,
  type AuthenticationResult
} from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useCallback, useMemo } from 'react';
import { authScopes } from './msalConfig';

export function useAccessToken() {
  const { instance, accounts } = useMsal();

  const activeAccount: AccountInfo | null = useMemo(() => accounts[0] || null, [accounts]);

  const getToken = useCallback(async (): Promise<AuthenticationResult> => {
    if (!activeAccount) {
      throw new Error('No active account. User must sign in.');
    }

    try {
      return await instance.acquireTokenSilent({
        account: activeAccount,
        scopes: authScopes
      });
    } catch (err) {
      // Any silent token failure should redirect to interactive login.
      // This includes InteractionRequiredAuthError, BrowserAuthError
      // (monitor_window_timeout, iframe_closed_prematurely, etc.),
      // and any other MSAL error that prevents silent acquisition.
      if (err instanceof InteractionRequiredAuthError || err instanceof BrowserAuthError) {
        await instance.acquireTokenRedirect({
          account: activeAccount,
          scopes: authScopes
        });
        // acquireTokenRedirect triggers a full page redirect.
        // Return a never-resolving promise so the caller doesn't
        // proceed with error handling before the redirect completes.
        return new Promise<AuthenticationResult>(() => {});
      }
      throw err;
    }
  }, [instance, activeAccount]);

  const login = useCallback(() => {
    return instance.loginRedirect({ scopes: authScopes });
  }, [instance]);

  const logout = useCallback(() => {
    return instance.logoutRedirect();
  }, [instance]);

  return { activeAccount, getToken, login, logout };
}
