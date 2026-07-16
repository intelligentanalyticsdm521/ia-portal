// src/lib/msalToken.ts
//
// The single place the Portal acquires an access token for a backend call.
//
// WHY THIS EXISTS
// ---------------
// sparkApi.ts, lumenApi.ts, oliverApi.ts and founderApi.ts each carried a
// byte-identical private `getToken()`:
//
//     async function getToken(msal, account) {
//       const r = await msal.acquireTokenSilent({ scopes: authScopes, account });
//       return r.accessToken;
//     }
//
// Four copies means four places to keep in step, and under VITE_DEV_AUTH=1 all
// four threw before a request was ever made:
//
//     authority_mismatch: Authority provided in login request or
//     PublicClientApplication config does not match the environment of the
//     provided account.
//
// Local dev has no MSAL session, so the account handed to acquireTokenSilent is
// the dev stand-in (environment: 'local'), which MSAL rightly refuses. The
// failure happened during token acquisition — BEFORE fetch — so the devAuth
// fetch interceptor never got a chance to strip the Authorization header. Every
// SPARK/OLIVER page died with an authority error that looked like broken auth
// rather than "there is no auth here by design".
//
// One seam, not four. Backends authenticate local dev on the x-dev-tenant header
// that lib/devAuth.ts attaches (and independently re-verify DEV_AUTH=1,
// NODE_ENV !== production, and a tenant allowlist), so the token value is never
// read in dev.
//
// Compiled out of production builds: Vite inlines import.meta.env at build time,
// so DEV_AUTH is the literal `false` and this collapses to the plain MSAL call.

import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";
import { DEV_AUTH, DEV_TOKEN_RESULT } from "./devAuth";

/**
 * Acquire an access token for a backend API call.
 *
 * @returns the raw access token string. Under dev auth this is a placeholder
 *          that is never validated — see the module comment.
 */
export async function acquireApiToken(
  msal: IPublicClientApplication,
  account: AccountInfo
): Promise<string> {
  if (DEV_AUTH) return DEV_TOKEN_RESULT.accessToken;

  const r = await msal.acquireTokenSilent({ scopes: authScopes, account });
  return r.accessToken;
}
