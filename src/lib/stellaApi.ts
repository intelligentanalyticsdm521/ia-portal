/**
 * stellaApi.ts — STELLA (Ledger + Unit Economics) API client for the Portal.
 *
 * A byte-for-byte mirror of oliverApi.ts, pointed at the stella-api service.
 * Uses the portal's MSAL auth (via the shared acquireApiToken seam, so the
 * VITE_DEV_AUTH=1 short-circuit lives in exactly one place). All responses
 * unwrap the { data: ... } envelope automatically.
 *
 * DEV-AUTH SEAM: this client sends `x-tenant-key` like oliverApi. The
 * `x-dev-tenant` header used by the backend dev-auth seam is attached by the
 * global window.fetch interceptor in lib/devAuth.ts for ANY loopback origin —
 * so pointing STELLA_API_BASE at localhost is all that's needed for local dev.
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { acquireApiToken } from "./msalToken";
import { emergencyActAsHeaders } from "./emergencyActAs";
import { getCurrentTenantOverride } from "./tenantContext";

const STELLA_API_BASE =
  (import.meta.env.VITE_STELLA_API_BASE as string) ||
  // Local-dev default — stella-api runs on loopback until the prod service is
  // provisioned. devAuth.ts attaches x-dev-tenant to loopback calls, so this
  // "just works" under VITE_DEV_AUTH=1 with no CIAM.
  // TODO(prod): swap for the deployed host once stella-api ships, e.g.
  //   "https://app-stella-api-prod-<hash>.centralus-01.azurewebsites.net"
  "http://localhost:8790";

// Delegates to the one shared token seam so the dev-auth short-circuit lives in
// exactly one place (see msalToken.ts — mirrors oliverApi/sparkApi/lumenApi).
async function getToken(msal: IPublicClientApplication, account: AccountInfo): Promise<string> {
  return acquireApiToken(msal, account);
}

function getTenantId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tid || "";
  } catch {
    return "";
  }
}

// The user's REAL active IADM tenant, chosen by AppGate from session/verify's
// homeTenantId and persisted by AppState (STORAGE_KEYS.activeTenantId).
//
// With a SHARED CIAM directory the JWT `tid` claim resolves server-side to the
// founder tenant — so falling straight back to getTenantId(token) would route
// every client's API calls to Intelligent Analytics. The user's actual tenant
// lives in AppState; read it here so fetch-time (non-React) clients scope to the
// right tenant. JWT tid stays as a last resort. (Identical to oliverApi.)
function readActiveTenantId(): string {
  try {
    return (localStorage.getItem("iadm.portal.activeTenantId") || "").trim();
  } catch {
    return "";
  }
}

/**
 * Sentinel: pass this as tenantOverride to ignore the global tenant override
 * and force the JWT's own tenant id. Used by founder-scoped endpoints that must
 * always be invoked as the founder.
 */
export const BYPASS_TENANT_OVERRIDE = "__bypass_tenant_override__";

async function stellaFetch<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit,
  tenantOverride?: string | null
): Promise<T> {
  const token = await getToken(msal, account);
  // Precedence:
  //   1. Explicit tenantOverride from caller (e.g. ClientTenantModal scoping)
  //   2. Global tenant override from tenantContext (founder scoping into a client)
  //   3. The user's active IADM tenant (AppState)
  //   4. The JWT's own tid (last resort)
  //
  // BYPASS_TENANT_OVERRIDE sentinel → skip steps 1 & 2; force the JWT tenant.
  const bypassTenantOverride = tenantOverride === BYPASS_TENANT_OVERRIDE;
  const contextTid = bypassTenantOverride ? null : getCurrentTenantOverride();
  const explicitOverride = bypassTenantOverride ? null : tenantOverride;
  const tenantId =
    (explicitOverride && explicitOverride.trim()) ||
    (contextTid && contextTid.trim()) ||
    (bypassTenantOverride ? "" : readActiveTenantId()) ||
    getTenantId(token);

  const res = await fetch(`${STELLA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
      // Emergency "act-as" header — present only while a 30-min read-only
      // session is open. No-op for everyone else.
      ...emergencyActAsHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 419) {
      throw new Error(
        "EMERGENCY_SESSION_EXPIRED: " + (text || "Emergency session expired. Exit emergency mode to continue.")
      );
    }
    if (res.status === 403) {
      // Parse tier-gate 403s into a structured error the UI can handle.
      try {
        const body = JSON.parse(text);
        if (body.error === "feature_not_available") {
          throw {
            type: "tier_gate" as const,
            tierRequired: body.tier_required || "pro",
            currentTier: body.current_tier || "standard",
          };
        }
      } catch (e) {
        if (typeof e === "object" && e !== null && "type" in e) throw e;
      }
    }
    throw new Error(`STELLA API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

export function stellaGet<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null) {
  return stellaFetch<T>(msal, account, path, { method: "GET" }, tenantOverride);
}

export function stellaPost<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body?: unknown, tenantOverride?: string | null) {
  return stellaFetch<T>(msal, account, path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  }, tenantOverride);
}

export function stellaPatch<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null) {
  return stellaFetch<T>(msal, account, path, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, tenantOverride);
}

export function stellaPut<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null) {
  return stellaFetch<T>(msal, account, path, {
    method: "PUT",
    body: JSON.stringify(body),
  }, tenantOverride);
}

export function stellaDelete<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null) {
  return stellaFetch<T>(msal, account, path, { method: "DELETE" }, tenantOverride);
}
