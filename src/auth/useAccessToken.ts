import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult
} from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useCallback, useMemo } from 'react';
import { authScopes } from './msalConfig';
import { DEV_AUTH, DEV_TOKEN_RESULT } from '../lib/devAuth';

export function useAccessToken() {
  const { instance, accounts } = useMsal();

  const activeAccount: AccountInfo | null = useMemo(
    // Under dev auth there is no MSAL account and never will be. Hand back a
    // stand-in so AppGate's `if (!activeAccount)` guards don't dead-end.
    () => (DEV_AUTH ? (DEV_TOKEN_RESULT.account as unknown as AccountInfo) : accounts[0] || null),
    [accounts]
  );

  const getToken = useCallback(async (): Promise<AuthenticationResult> => {
    // The returned token is never validated — the backend authenticates on the
    // x-dev-tenant header the fetch interceptor attaches (see lib/devAuth.ts).
    if (DEV_AUTH) return DEV_TOKEN_RESULT as unknown as AuthenticationResult;

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
        await instance.acquireTokenRedirect({
          account: activeAccount,
          scopes: authScopes
        });
      }
      throw err;
    }
  }, [instance, activeAccount]);

  const login = useCallback((opts?: { create?: boolean; loginHint?: string }) => {
    // Welcome/activation links land on /app/...?welcome=1&prefill_email=... —
    // a first-time client. Send them straight to Entra's Create-account page
    // (prompt=create) pre-filled with their email, instead of the sign-in
    // screen where they'd have to hunt for "No account? Create one". Returning
    // users (no welcome context) get the normal sign-in.
    const params = new URLSearchParams(window.location.search);
    const wantCreate = opts?.create ?? (params.get('welcome') === '1');
    const loginHint = opts?.loginHint ?? (params.get('prefill_email') || undefined);
    const req: Parameters<typeof instance.loginRedirect>[0] = { scopes: authScopes };
    if (wantCreate) {
      req.prompt = 'create';
      if (loginHint) req.loginHint = loginHint;
    }
    return instance.loginRedirect(req);
  }, [instance]);

  const logout = useCallback(() => {
    return instance.logoutRedirect();
  }, [instance]);

  return { activeAccount, getToken, login, logout };
}
