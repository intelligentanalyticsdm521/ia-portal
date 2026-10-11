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
import { OLIVER_API_BASE } from "./oliverApi";
import { apiBodySentence } from "./apiErrorMessage";
import { planRefusalFromBody } from "./planRefusal";

/**
 * A failed STELLA call, as an Error a person can read.
 *
 * PRE-WALK 1b, 2026-09-16. This used to be
 * `new Error(\`STELLA API ${status}: ${text}\`)`, and every STELLA surface
 * renders `error.message` — so editing a line inside a closed month printed the
 * whole 409 envelope on screen, internal period ids and the reopen API path
 * included, when the server had already written the one sentence the walk asks
 * for ("… falls inside a closed period (2026-08-01 to 2026-08-31) … Reopen that
 * period under Period Close …").
 *
 * The sentence becomes the message. The machine-readable parts do not vanish —
 * they move onto the error object, where `status` is a number to compare rather
 * than a string to search for.
 */
export function stellaError(status: number, text: string): Error & {
  status: number;
  body: unknown;
  raw: string;
} {
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* not JSON — the raw text is all there is */ }
  const sentence = apiBodySentence(body) || text.trim();
  const err = new Error(sentence || `STELLA API ${status}`) as Error & {
    status: number; body: unknown; raw: string;
  };
  err.status = status;
  err.body = body;
  // The old string, kept verbatim for anything that still wants to log it.
  err.raw = `STELLA API ${status}: ${text}`;
  return err;
}

// 2026-08 fold: STELLA's ledger routes live ON oliver-api — there is no
// standalone stella-api service. Default to oliver-api's host (shared
// constant, one URL to maintain); VITE_STELLA_API_BASE overrides for local
// dev (the folded oliver-api on a loopback port — devAuth.ts attaches
// x-dev-tenant to loopback calls automatically).
export const STELLA_API_BASE =
  (import.meta.env.VITE_STELLA_API_BASE as string) || OLIVER_API_BASE;

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
  tenantOverride?: string | null,
  // Layer 3: keep the whole envelope. Defaults to false so every existing
  // caller behaves exactly as before.
  raw = false
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
        const refusal = planRefusalFromBody(body);
        if (refusal) throw refusal;
      } catch (e) {
        if (typeof e === "object" && e !== null && "type" in e) throw e;
      }
    }
    throw stellaError(res.status, text);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  if (raw) return json as T;
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

// ── Layer 3 additions (Database Manager / Custom Reporting) ──────────────────

/**
 * stellaGetFull — a GET that does NOT unwrap the { data } envelope.
 *
 * stellaFetch strips the envelope and returns `json.data`, which is right for
 * the Ledger's list endpoints. Layer 3 responses carry siblings that matter —
 * `columns`, `pagination`, `meta` (tier + caps) — and unwrapping throws all of
 * them away, silently, leaving a table that cannot page and a cap the UI
 * cannot show. Same trap as the oliver-api envelope auto-unwrap.
 */
/** POST that keeps the whole envelope — same reason as stellaGetFull. */
export async function stellaPostFull<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  body?: unknown,
  tenantOverride?: string | null
): Promise<T> {
  return stellaFetch<T>(msal, account, path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  }, tenantOverride, true);
}

export async function stellaGetFull<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  tenantOverride?: string | null
): Promise<T> {
  return stellaFetch<T>(msal, account, path, { method: "GET" }, tenantOverride, true);
}

/**
 * stellaUpload — multipart POST.
 *
 * Content-Type is deleted deliberately: the browser must set it itself so the
 * multipart boundary is included. Inheriting stellaFetch's application/json
 * header produces a body multer cannot parse and a 400 that reads like a
 * validation failure.
 */
export async function stellaUpload<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  form: FormData,
  tenantOverride?: string | null
): Promise<T> {
  const token = await getToken(msal, account);
  const bypass = tenantOverride === BYPASS_TENANT_OVERRIDE;
  const contextTid = bypass ? null : getCurrentTenantOverride();
  const explicit = bypass ? null : tenantOverride;
  const tenantId =
    (explicit && explicit.trim()) ||
    (contextTid && contextTid.trim()) ||
    (bypass ? "" : readActiveTenantId()) ||
    getTenantId(token);

  const res = await fetch(`${STELLA_API_BASE}${path}`, {
    method: "POST",
    body: form,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      ...emergencyActAsHeaders(),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    let parsed: { error?: string; details?: string[]; tier_required?: string; current_tier?: string } | null = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON body falls through */ }
    const refusal = res.status === 403 ? planRefusalFromBody(parsed) : null;
    if (refusal) throw refusal;
    // Preserve `details` so the caller can list each validation line instead of
    // showing one opaque "header_mismatch".
    const err = new Error(parsed?.error ? `${parsed.error}` : `STELLA API ${res.status}: ${text}`) as Error & { details?: string[] };
    if (parsed?.details) err.details = parsed.details;
    throw err;
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * getStellaAuthHeaders — the Authorization + tenant headers on their own.
 *
 * For responses that are NOT JSON (a document download streams bytes), so the
 * caller can fetch directly and still be authenticated and tenant-scoped.
 * Same precedence stellaFetch uses; kept here so there is one place that
 * decides which tenant a STELLA request belongs to.
 */
export async function getStellaAuthHeaders(
  msal: IPublicClientApplication,
  account: AccountInfo,
  tenantOverride?: string | null
): Promise<Record<string, string>> {
  const token = await getToken(msal, account);
  const bypass = tenantOverride === BYPASS_TENANT_OVERRIDE;
  const contextTid = bypass ? null : getCurrentTenantOverride();
  const explicit = bypass ? null : tenantOverride;
  const tenantId =
    (explicit && explicit.trim()) ||
    (contextTid && contextTid.trim()) ||
    (bypass ? "" : readActiveTenantId()) ||
    getTenantId(token);
  return { Authorization: `Bearer ${token}`, "x-tenant-key": tenantId, ...emergencyActAsHeaders() };
}
