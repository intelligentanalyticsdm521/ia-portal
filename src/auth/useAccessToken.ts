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
    // Clear all MSAL accounts from cache before redirecting to Azure end-session
    const allAccounts = instance.getAllAccounts();
    for (const acct of allAccounts) {
      instance.setActiveAccount(null);
    }
    // Also clear any portal-specific cached state
    localStorage.removeItem('iadm.portal.activeTenantId');

    return instance.logoutRedirect({
      account: activeAccount,
      postLogoutRedirectUri: window.location.origin + '/',
    });
  }, [instance, activeAccount]);

  const switchAccount = useCallback(async () => {
    // Clear all cached accounts so Azure shows a fresh account picker
    const allAccounts = instance.getAllAccounts();
    for (const acct of allAccounts) {
      instance.setActiveAccount(null);
    }
    localStorage.removeItem('iadm.portal.activeTenantId');

    // Logout first to end the Azure CIAM session, then re-login with account picker
    await instance.logoutRedirect({
      account: activeAccount,
      postLogoutRedirectUri: window.location.origin + '/',
    });
  }, [instance, activeAccount]);

  return { activeAccount, getToken, login, logout, switchAccount };
}
