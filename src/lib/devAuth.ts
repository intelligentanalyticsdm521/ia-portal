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
import { FOUNDER_TENANT_ID_DEFAULT } from "./founderTenant";

export const DEV_AUTH = String(import.meta.env.VITE_DEV_AUTH || '') === '1';
export const DEV_TENANT = String(import.meta.env.VITE_DEV_TENANT || '').trim();

// The backend dev seam hard-blocks the founder tenant; sending it would 401
// every call, so the resolver skips it and falls back to the env pin.
//
// SEAMS PACK 4B — the id lives in ONE module (lib/founderTenant.ts). The
// DEFAULT rather than founderTenantId(), matching every backend's devAuth: what
// the seam refuses is the PRODUCTION founder tenant, whose GUID the shared CIAM
// directory shares. A configured override may legitimately point at a fixture
// agency that IS an allowed dev tenant (oliver-api's dev env does exactly
// that), and refusing it here would break the seam it is configured for.
const FOUNDER_TENANT = FOUNDER_TENANT_ID_DEFAULT;

/**
 * 2026-07-26 (Brandon: "cross tenant leakage") — the dev tenant now FOLLOWS
 * the tenant switcher instead of being pinned per Vite run. The switcher
 * persists AppState.activeTenantId to localStorage; each intercepted request
 * reads it fresh, so switching tenants in the UI switches the data too.
 * Falls back to VITE_DEV_TENANT when unset or when the founder tenant is
 * selected (the seam refuses it by design).
 */
function resolveDevTenant(): string {
  try {
    // 1) Founder act-as session targets a client tenant while activeTenantId
    //    stays the founder's own — honor the TARGET so acting-as works in dev.
    const raw = sessionStorage.getItem('iadm.portal.emergencyActAs.v1');
    if (raw) {
      const s = JSON.parse(raw) as { tenantId?: string; expiresAt?: string };
      const t = (s.tenantId || '').trim().toLowerCase();
      if (t && t !== FOUNDER_TENANT && s.expiresAt && Date.parse(s.expiresAt) > Date.now()) return t;
    }
  } catch { /* fall through */ }
  try {
    const active = (localStorage.getItem('iadm.portal.activeTenantId') || '').trim().toLowerCase();
    if (active && active !== FOUNDER_TENANT) return active;
  } catch { /* storage denied — env pin still works */ }
  return DEV_TENANT;
}

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
    const devTenant = resolveDevTenant();
    headers.set('x-dev-tenant', devTenant);
    // Keep the scope headers in lockstep with the dev identity — the backend
    // seams reject a request whose x-tenant-key disagrees with the dev
    // tenant, and the app computes those from AppState (which can lag the
    // act-as flow in dev). Dev-only, loopback-only, same as everything here.
    if (headers.has('x-tenant-key')) headers.set('x-tenant-key', devTenant);
    if (headers.has('x-tenant-id')) headers.set('x-tenant-id', devTenant);
    // Emergency act-as can't work end-to-end against the dev seam (the
    // middleware demands a real founder JWT). resolveDevTenant() already
    // scopes requests to the act-as TARGET, so drop the mode header rather
    // than let every LUMEN/oliver call 401 for the whole 30-minute session.
    headers.delete('x-actas-mode');
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
