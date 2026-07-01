/**
 * oliverApi.ts — OLIVER API client for the Portal
 *
 * Uses the portal's MSAL auth to call oliver-api directly.
 * All responses unwrap the { data: ... } envelope automatically.
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";
import { emergencyActAsHeaders } from "./emergencyActAs";
import { getCurrentTenantOverride } from "./tenantContext";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

async function getToken(msal: IPublicClientApplication, account: AccountInfo): Promise<string> {
  const r = await msal.acquireTokenSilent({ scopes: authScopes, account });
  return r.accessToken;
}

function getTenantId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tid || "";
  } catch {
    return "";
  }
}

/**
 * Sentinel: pass this as tenantOverride to ignore the global tenant override
 * and force the JWT's own tenant id. Used by founder-scoped endpoints
 * (`/admin/onboard-client/*`) that must always be invoked as the founder.
 */
export const BYPASS_TENANT_OVERRIDE = "__bypass_tenant_override__";

async function oliverFetch<T>(
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
  //   3. The JWT's own tid (default — caller's own tenant)
  //
  // BYPASS_TENANT_OVERRIDE sentinel → skip step 2 AND step 1; always JWT.
  const bypassTenantOverride = tenantOverride === BYPASS_TENANT_OVERRIDE;
  const contextTid = bypassTenantOverride ? null : getCurrentTenantOverride();
  const explicitOverride = bypassTenantOverride ? null : tenantOverride;
  const tenantId =
    (explicitOverride && explicitOverride.trim()) ||
    (contextTid && contextTid.trim()) ||
    getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
      // Emergency "act-as" header — present only while a 30-min read-only
      // session is open. The backend enforceEmergencyReadOnly middleware
      // 403s any non-GET request while this header is set (except the
      // /super/end-session carve-out). No-op for everyone else.
      ...emergencyActAsHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    // Emergency-mode-specific surfacing. 419 means the session expired (or
    // the backend disagrees that one exists); 403 with the
    // emergency_read_only code means the user tried to mutate while read-only.
    // We throw informative errors so the banner / UI can react.
    if (res.status === 419) {
      throw new Error(
        "EMERGENCY_SESSION_EXPIRED: " + (text || "Emergency session expired. Exit emergency mode to continue.")
      );
    }
    if (res.status === 403) {
      // Parse tier-gate 403s into a structured error the UI can handle
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
    throw new Error(`OLIVER API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

export function oliverGet<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null) {
  return oliverFetch<T>(msal, account, path, { method: "GET" }, tenantOverride);
}

export function oliverPost<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body?: unknown, tenantOverride?: string | null) {
  return oliverFetch<T>(msal, account, path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  }, tenantOverride);
}

export function oliverPatch<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null) {
  return oliverFetch<T>(msal, account, path, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, tenantOverride);
}

export function oliverPut<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null) {
  return oliverFetch<T>(msal, account, path, {
    method: "PUT",
    body: JSON.stringify(body),
  }, tenantOverride);
}

export function oliverDelete<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null) {
  return oliverFetch<T>(msal, account, path, { method: "DELETE" }, tenantOverride);
}

// Raw fetch for binary responses (PDFs, blobs). Caller is responsible for
// reading res.blob() / res.arrayBuffer() and handling errors.
export async function oliverFetchRaw(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getToken(msal, account);
  const tenantId = getTenantId(token);
  return fetch(`${OLIVER_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      // Carry the emergency header through binary endpoints too; they're
      // exports/downloads which are read-only by nature, but the middleware
      // still needs to see the header to recognize the active session.
      ...emergencyActAsHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });
}

// Download a file (CSV, PDF, etc.) from the OLIVER API by triggering a
// browser download. `filename` becomes the suggested name on disk.
// Throws on non-2xx so callers can surface the error.
export async function oliverDownload(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  filename: string
): Promise<void> {
  const res = await oliverFetchRaw(msal, account, path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Download failed (${res.status}): ${text}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
