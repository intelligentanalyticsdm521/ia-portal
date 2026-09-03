import {
  InteractionRequiredAuthError,
  BrowserAuthError,
  type AccountInfo,
  type AuthenticationResult
} from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useCallback, useMemo } from 'react';
import { authScopes } from './msalConfig';
import { clearStaleInteractionFlags, hardLogout } from './pca';
import { DEV_AUTH, DEV_TOKEN_RESULT } from '../lib/devAuth';

/**
 * The signed-in account, or the dev stand-in under VITE_DEV_AUTH=1.
 *
 * ALWAYS use this instead of reading `useMsal().accounts[0]` directly.
 *
 * Under dev auth there is no MSAL session and never will be, so `accounts` is
 * permanently empty. Any hook that derives readiness from `accounts[0]` is
 * therefore dead in local dev: useSparkApi returned `ready: false` forever,
 * SparkCampaignsPage's `if (!ready) return` never fired its fetch, and every
 * SPARK page sat on "Still loading…" with no network request and no error.
 *
 * Compiled out of production builds — Vite inlines import.meta.env at build
 * time, so DEV_AUTH is the literal `false` there and this collapses to
 * `accounts[0]`.
 *
 * Typed `AccountInfo` rather than `AccountInfo | null` so it is a drop-in
 * replacement for the `accounts[0]` reads it supersedes. That matches the
 * existing typing exactly: TypeScript types array index access as `AccountInfo`
 * (noUncheckedIndexedAccess is off), while it is `undefined` at runtime when no
 * one is signed in. This hook neither adds nor removes that risk — the callers
 * that already guarded on it (`ready: !!account`) still work unchanged. Use
 * useAccessToken().activeAccount where you need the honest `| null`.
 */
export function useActiveAccount(): AccountInfo {
  const { accounts } = useMsal();
  const first = accounts[0];
  // Memoize on the account KEY, never on `accounts` (or the object) — MSAL
  // rebuilds the accounts array with fresh AccountInfo instances on its own
  // events, including the acquireTokenSilent calls our fetches make. Keyed on
  // identity, every api hook's `get` was recreated per event, every
  // `useEffect([load])` refired, and that fetch raised the next MSAL event —
  // a self-sustaining fetch loop. One stuck tab produced 3,226 /auth/verify
  // 404s on 2026-08-26 evening this way (and the argus-credits 403 bursts are
  // the same loop through the HeaderBar badge). A stale object is safe here:
  // consumers only pass it back to MSAL to select the account for token calls.
  const accountKey = first?.homeAccountId ?? first?.localAccountId ?? null;
  return useMemo(
    () => (DEV_AUTH ? (DEV_TOKEN_RESULT.account as unknown as AccountInfo) : first),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountKey]
  );
}

export function useAccessToken() {
  const { instance, accounts } = useMsal();

  // Same key-based memo as useActiveAccount above — see the loop note there.
  const firstAccount = accounts[0];
  const firstAccountKey = firstAccount?.homeAccountId ?? firstAccount?.localAccountId ?? null;
  const activeAccount: AccountInfo | null = useMemo(
    // Under dev auth there is no MSAL account and never will be. Hand back a
    // stand-in so AppGate's `if (!activeAccount)` guards don't dead-end.
    () => (DEV_AUTH ? (DEV_TOKEN_RESULT.account as unknown as AccountInfo) : firstAccount || null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firstAccountKey]
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
    // Self-heal a stuck session: if a PRIOR interaction (e.g. an aborted
    // logout where the user closed the "pick an account" page) left
    // `interaction_in_progress` in localStorage, loginRedirect throws and the
    // button appears dead. Clear the stale flag and retry once so the user is
    // never wedged out of signing in.
    return instance.loginRedirect(req).catch((err) => {
      if (err instanceof BrowserAuthError && err.errorCode === 'interaction_in_progress') {
        clearStaleInteractionFlags();
        return instance.loginRedirect(req);
      }
      throw err;
    });
  }, [instance]);

  const logout = useCallback(() => {
    // Sign out means sign out — no "pick an account" chooser. Shared with the
    // idle auto-logout via hardLogout() so the two paths can never diverge.
    // It sends `logoutHint` (not just `account`), which is what actually tells
    // Entra to skip the server-side account picker. See pca.ts.
    return hardLogout(instance);
  }, [instance]);

  return { activeAccount, getToken, login, logout };
}
