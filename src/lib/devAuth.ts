/**
 * devAuth.ts — LOCAL-DEV ONLY front-end auth seam.
 *
 * WHY
 * ---
 * The backends already have a dev-auth seam: send `x-dev-tenant: <guid>` and
 * they skip CIAM (platform-api/lib/devAuth.js, arion-api/lib/devAuth.js,
 * oliver-api/lib/devAuth.js, LUMEN-API/src/middleware/devAuth.js). The Portal
 * had no equivalent — it is pure MSAL — so local dev could only work by
 * authenticating against the PRODUCTION CIAM, which is how "local dev" ended up
 * being production with a localhost URL.
 *
 * Brandon, 2026-07-16: "local dev doesn't need to run against CIAM."
 *
 * HOW
 * ---
 * A fetch interceptor, not a patch to every api client. `platformApi.ts` alone
 * builds the Authorization header in ~6 places, and there are five more clients
 * (oliver/lumen/arion/spark/…). Patching each is invasive and one WILL get
 * missed — and a missed one silently falls back to prod. One interceptor cannot
 * be missed.
 *
 * SAFETY — why this cannot touch production:
 *   1. Vite statically replaces import.meta.env at BUILD time. A production
 *      build has no VITE_DEV_AUTH set, so DEV_AUTH is the literal `false` and
 *      the whole module tree-shakes out. This code cannot ship.
 *   2. It only rewrites requests to loopback origins. A request to any
 *      *.azurewebsites.net is passed through untouched — the header is never
 *      attached to a prod URL even if someone forces the flag on.
 *   3. The header is only an ASK. Every backend independently re-checks:
 *      DEV_AUTH=1, NODE_ENV !== production, and the tenant allowlist — and
 *      refuses the founder tenant outright. Prod sets no DEV_AUTH, so a prod
 *      backend ignores this header entirely.
 *
 * Three independent locks. Any one of them alone is sufficient.
 */

export const DEV_AUTH = String(import.meta.env.VITE_DEV_AUTH || '') === '1';
export const DEV_TENANT = String(import.meta.env.VITE_DEV_TENANT || '').trim();

/** Loopback only. Anything else — notably *.azurewebsites.net — is left alone. */
function isLocalApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Wrap window.fetch so every call to a LOCAL api carries `x-dev-tenant`.
 * Idempotent; no-op unless VITE_DEV_AUTH=1. Called once from main.tsx.
 */
export function installDevAuthFetch(): void {
  if (!DEV_AUTH || installed) return;
  if (!DEV_TENANT) {
    console.error('[devAuth] VITE_DEV_AUTH=1 but VITE_DEV_TENANT is empty — every API call will 401.');
    return;
  }
  installed = true;

  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

    if (!isLocalApi(url)) return original(input as any, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-dev-tenant', DEV_TENANT);
    // Some clients send `Authorization: Bearer undefined` when MSAL is absent;
    // the backend would try to verify it as a real token and 401 before the
    // dev seam is consulted. Strip it — devAuth runs first only if no Bearer
    // parsing has already failed.
    headers.delete('Authorization');
    return original(input as any, { ...init, headers });
  };

  console.info(
    `%c[devAuth] LOCAL DEV — MSAL bypassed. x-dev-tenant: ${DEV_TENANT}. Loopback requests only.`,
    'color:#ef6c33;font-weight:bold'
  );
}

/** A stand-in for MSAL's AuthenticationResult. The token is never validated —
 *  the backend authenticates on the x-dev-tenant header instead. */
export const DEV_TOKEN_RESULT = {
  accessToken: 'dev-auth-no-token',
  account: {
    homeAccountId: 'dev',
    environment: 'local',
    tenantId: DEV_TENANT,
    username: 'dev-tester@local.test',
    localAccountId: 'dev',
    name: 'Dev Tester',
  },
} as const;
