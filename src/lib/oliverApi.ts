/**
 * oliverApi.ts — OLIVER API client for the Portal
 *
 * Uses the portal's MSAL auth to call oliver-api directly.
 * All responses unwrap the { data: ... } envelope automatically.
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";
import { acquireApiToken } from "./msalToken";
import { emergencyActAsHeaders } from "./emergencyActAs";
import { getCurrentTenantOverride } from "./tenantContext";
import { planRefusalFromBody } from "./planRefusal";

// Exported: stellaApi.ts reuses this host since the 2026-08 fold put the
// STELLA ledger routes on oliver-api (no standalone stella-api service).
export const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

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

// The user's REAL active IADM tenant, chosen by AppGate from session/verify's
// homeTenantId and persisted here by AppState (STORAGE_KEYS.activeTenantId).
//
// CRITICAL (2026-07-09): with a SHARED CIAM directory the JWT `tid` claim is
// the same for every user and resolves server-side to the founder tenant — so
// falling straight back to getTenantId(token) routed every client's API calls
// to Intelligent Analytics ("not a member of the selected tenant" / IA data in
// SPARK). The user's actual tenant lives in AppState; read it here so fetch-time
// (non-React) clients scope to the right tenant. JWT tid stays as a last resort.
function readActiveTenantId(): string {
  try {
    return (localStorage.getItem("iadm.portal.activeTenantId") || "").trim();
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
    (bypassTenantOverride ? "" : readActiveTenantId()) ||
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
        // The catalog refusal "feature_not_in_plan" and oliver-api's older
        // "feature_not_available" / "tier_upgrade_required" / "tier_required"
        // (tiers under `details`), read in one place (lib/planRefusal).
        const refusal = planRefusalFromBody(body);
        if (refusal) throw refusal;
      } catch (e) {
        if (typeof e === "object" && e !== null && "type" in e) throw e;
      }
    }
    // 2026-09-25 (pane re-test W-L3-04): keep this message shape — several
    // callers parse "OLIVER API <status>: <json>" — but carry the API's own
    // words on the error too, so a form can print "Amount is required"
    // instead of the code "validation_failed" (ManualEntryPage reads .details).
    const apiErr = new Error(`OLIVER API ${res.status}: ${text}`) as Error & {
      status?: number; code?: string; details?: unknown; body?: unknown;
    };
    apiErr.status = res.status;
    try {
      const body = JSON.parse(text);
      if (body && typeof body === "object") {
        apiErr.body = body;
        if (typeof body.error === "string") apiErr.code = body.error;
        if (body.details !== undefined) apiErr.details = body.details;
      }
    } catch { /* not JSON — the message already carries the text */ }
    throw apiErr;
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

// Multipart upload (deliverable files, etc.).
//
// Built on oliverFetchRaw rather than oliverFetch on purpose: oliverFetch
// hard-sets `Content-Type: application/json`, which would clobber the
// multipart boundary the browser generates for a FormData body and leave the
// server unable to parse the request. Raw sets no Content-Type, so the browser
// supplies the correct one.
//
// Tenant scoping matches BYPASS_TENANT_OVERRIDE (the JWT's own tid), which is
// what founder-gated endpoints require — an active view-as override would
// otherwise send the client's tenant and trip requireFounder.
export async function oliverUpload<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  form: FormData
): Promise<T> {
  const res = await oliverFetchRaw(msal, account, path, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OLIVER API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

// Fetch a private file's BYTES, without putting them on disk.
//
// A customer file's container is private and the API streams it behind the
// tenant guard, so `<img src="…/content">` is a request with no bearer token
// and a 401 — the thumbnail has to be an object URL over a fetch that carries
// the headers. Same reason downloadHelper.ts exists on the STELLA side; this
// is the version that hands the Blob back instead of clicking a link with it,
// because the Files card renders it inline as well as opening it.
//
// The caller owns the Blob: create the object URL, and REVOKE it when the row
// unmounts. An object URL that is never revoked keeps its bytes in memory for
// the life of the tab.
export async function oliverBlob(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string
): Promise<Blob> {
  const res = await oliverFetchRaw(msal, account, path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Could not open that file (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.blob();
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
