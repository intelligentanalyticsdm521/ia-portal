import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult
} from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useCallback, useMemo } from 'react';
import { authScopes } from './msalConfig';

export function useAccessToken() {
  const { instance, accounts } = useMsal();

  // Keep the selected account stable unless accounts changes
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
      if (err instanceof InteractionRequiredAuthError) {
        // This triggers a full redirect and returns to /auth/callback
        await instance.acquireTokenRedirect({
          account: activeAccount,
          scopes: authScopes
        });
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
