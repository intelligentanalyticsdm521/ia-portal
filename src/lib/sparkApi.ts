/**
 * sparkApi.ts — SPARK (LUMEN) API client for the Portal
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";
import { acquireApiToken } from "./msalToken";
import { emergencyActAsHeaders } from "./emergencyActAs";
import { getCurrentTenantOverride } from "./tenantContext";

// Exported (2026-09-01): pages that hand the USER a LUMEN-API URL to paste
// elsewhere — the tracking snippet, the iCal share link — used to re-derive
// this base themselves. SparkCalendarSyncPage's copy returned "" in prod, so
// the calendar URL it offered was a bare path that resolved against the
// portal host and 404'd in Google Calendar. One exported constant, no copies.
export const SPARK_API_BASE =
  (import.meta.env.VITE_SPARK_API_BASE as string) ||
  (import.meta.env.VITE_LUMEN_API_BASE as string) ||
  "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

// Delegates to the one shared token seam so the dev-auth short-circuit lives
// in exactly one place. Four identical private copies of this used to exist,
// and all four threw authority_mismatch under VITE_DEV_AUTH=1.
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

// The user's REAL active IADM tenant (AppState → STORAGE_KEYS.activeTenantId).
// CRITICAL (2026-07-09): the shared CIAM JWT `tid` is the same for every user
// and resolves to the founder tenant, so falling back to it routed clients to
// Intelligent Analytics. Scope to the real active tenant instead.
function readActiveTenantId(): string {
  try {
    return (localStorage.getItem("iadm.portal.activeTenantId") || "").trim();
  } catch {
    return "";
  }
}

/**
 * The auth + tenant headers every SPARK call carries.
 *
 * Pulled out of sparkFetch so the file download below sends EXACTLY the same
 * ones. A second copy of this is how a download ends up on the founder tenant
 * while the page it was clicked from is looking at a client's data.
 *
 * Precedence: explicit override > view-as tenant > active tenant > JWT default.
 */
async function sparkHeaders(
  msal: IPublicClientApplication,
  account: AccountInfo,
  tenantOverride?: string | null
): Promise<Record<string, string>> {
  const token = await getToken(msal, account);
  const viewAsTid = getCurrentTenantOverride();
  const tenantId =
    (tenantOverride && tenantOverride.trim()) ||
    (viewAsTid && viewAsTid.trim()) ||
    readActiveTenantId() ||
    getTenantId(token);

  return {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": tenantId,
    // Founder emergency act-as — no-op outside an active 30-min emergency
    // session. LUMEN-API does NOT yet have the read-only middleware
    // (followup). Sending the header now is forward-compat so backend can
    // start enforcing without another Portal release.
    ...emergencyActAsHeaders(),
  };
}

async function sparkFetch<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit,
  tenantOverride?: string | null
): Promise<T> {
  const res = await fetch(`${SPARK_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(await sparkHeaders(msal, account, tenantOverride)),
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      try {
        const body = JSON.parse(text);
        // Same shapes as lumenApi.ts: requireSparkTier → "tier_upgrade_required"
        // (requiredTier/currentTier) and tierCheck TierGateError →
        // "tier_required" (required_tier/current_tier; feature
        // "approval_workflow" fronts the SPARK Business /approvals queue).
        // "feature_not_available" is the legacy name.
        if (body.error === "tier_required" || body.error === "tier_upgrade_required" || body.error === "feature_not_available") {
          throw {
            type: "tier_gate" as const,
            tierRequired: body.tier_required || body.requiredTier || "pro",
            currentTier: body.current_tier || body.currentTier || "standard",
            feature: typeof body.feature === "string" ? body.feature : undefined,
            message: typeof body.message === "string" ? body.message : undefined,
          };
        }
      } catch (e) {
        if (typeof e === "object" && e !== null && "type" in e) throw e;
      }
    }
    throw new Error(`SPARK API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json();
  // Never unwrap — return the full API response so pages can access both data and meta
  return json as T;
}

export function sparkGet<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null) {
  return sparkFetch<T>(msal, account, path, { method: "GET" }, tenantOverride);
}

export function sparkPost<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body?: unknown, tenantOverride?: string | null) {
  return sparkFetch<T>(msal, account, path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, tenantOverride);
}

export function sparkPut<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null) {
  return sparkFetch<T>(msal, account, path, { method: "PUT", body: JSON.stringify(body) }, tenantOverride);
}

export function sparkPatch<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null) {
  return sparkFetch<T>(msal, account, path, { method: "PATCH", body: JSON.stringify(body) }, tenantOverride);
}

export function sparkDelete<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null) {
  return sparkFetch<T>(msal, account, path, { method: "DELETE" }, tenantOverride);
}

/**
 * A SPARK endpoint that returns a FILE, not JSON — fetch it with the same auth
 * and the same business, then hand it to the browser as a download.
 *
 * It cannot go through sparkFetch (which parses JSON) and it cannot be a plain
 * <a href> either, because the endpoint is behind an Authorization header — an
 * anchor sends no headers, which is why the Audit Log's window.open export
 * cannot work against an authenticated route. Same shape as oliverDownload and
 * stellaExportDownload: fetch, blob, object URL, click, revoke.
 *
 * Throws with the API's own message on a non-2xx, so a caller can show the
 * client what actually went wrong (the export's over-the-cap refusal, say)
 * instead of a status code.
 */
export async function sparkDownload(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  fallbackName: string,
  tenantOverride?: string | null
): Promise<void> {
  const res = await fetch(`${SPARK_API_BASE}${path}`, {
    method: "GET",
    headers: await sparkHeaders(msal, account, tenantOverride),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Download failed (${res.status})`;
    try {
      const body = JSON.parse(text);
      msg = body.message || body.details || body.error || msg;
    } catch { /* not a JSON error body */ }
    throw new Error(msg);
  }

  // The API names the file in Content-Disposition; honour it rather than
  // inventing a second name for the same download.
  const cd = res.headers.get("content-disposition") || "";
  const named = /filename="([^"]+)"/.exec(cd)?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = named || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
