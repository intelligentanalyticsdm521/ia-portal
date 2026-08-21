/**
 * lumenApi.ts — LUMEN API client for the Portal.
 *
 * Same MSAL/JWT path as sparkApi, with two intentional differences so the
 * naming lines up with the platform vocabulary:
 *
 *   1. The base URL env var is VITE_LUMEN_API_BASE first, falling back to
 *      VITE_SPARK_API_BASE (legacy) so existing portal builds keep working
 *      without a rebuild step.
 *   2. Responses are AUTO-UNWRAPPED — the LUMEN-API My Brand endpoints
 *      return { data: ... } envelopes, and we strip the envelope here so
 *      page-level code can type the result as the inner shape directly
 *      (matches the oliverApi pattern in oliverApi.ts:74).
 *
 * Header shape mirrors sparkApi: x-tenant-id, Authorization, Content-Type,
 * plus emergency act-as headers for founder read-only sessions.
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";
import { acquireApiToken } from "./msalToken";
import { emergencyActAsHeaders } from "./emergencyActAs";
import { getCurrentTenantOverride } from "./tenantContext";

const LUMEN_API_BASE =
  (import.meta.env.VITE_LUMEN_API_BASE as string) ||
  (import.meta.env.VITE_SPARK_API_BASE as string) ||
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
// CRITICAL (2026-07-09): the shared CIAM JWT `tid` is identical for every user
// and resolves to the founder tenant, so falling straight back to it made SPARK
// show Intelligent Analytics data for every client. Scope to the real tenant.
function readActiveTenantId(): string {
  try {
    return (localStorage.getItem("iadm.portal.activeTenantId") || "").trim();
  } catch {
    return "";
  }
}

async function lumenFetch<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit,
  tenantOverride?: string | null
): Promise<T> {
  const token = await getToken(msal, account);
  // Same tenantOverride wins rule as the OLIVER/SPARK clients — Founder operating
  // on a client's tenant via the ClientTenantModal sends the client's tid in
  // x-tenant-id; everyone else sends their own JWT's tid. View-as inserts
  // between explicit override and JWT default.
  const viewAsTid = getCurrentTenantOverride();
  const tenantId =
    (tenantOverride && tenantOverride.trim()) ||
    (viewAsTid && viewAsTid.trim()) ||
    readActiveTenantId() ||
    getTenantId(token);

  const res = await fetch(`${LUMEN_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-id": tenantId,
      "Content-Type": "application/json",
      // Forward-compat with sparkApi — LUMEN-API doesn't have the emergency
      // read-only middleware yet, but sending the header now means we don't
      // need a new Portal release the day backend enforcement lands.
      ...emergencyActAsHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    // Tier-gate 403s — same structured error shape ARION/OLIVER UIs already
    // handle via isTierGateError. Lets MyBrand pages surface OliverUpgradeGate
    // with no extra wiring.
    if (res.status === 403) {
      try {
        const body = JSON.parse(text);
        // LUMEN emits two shapes: tierCheck.js TierGateError.toJSON() →
        // { error: "tier_required", feature, required_tier, current_tier,
        // message } (feature = "social_approval_workflow" for the My Brand
        // social approval toggle, "approval_workflow" for the SPARK /approvals
        // queue), and requireSparkTier → { error: "tier_upgrade_required",
        // feature, requiredTier, currentTier, message }. "feature_not_available"
        // is the legacy name, kept for an older backend.
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
    // Surface the OpenAI-key-missing 503 specifically — the Image Studio UI
    // wants to detect "key not configured" vs "rate-limited" vs "policy" and
    // show different copy.
    if (res.status === 503) {
      try {
        const body = JSON.parse(text);
        if (body.error === "image_studio_not_configured") {
          throw {
            type: "image_studio_not_configured" as const,
            message: body.message || "Image Studio is not yet configured for this environment.",
          };
        }
      } catch (e) {
        if (typeof e === "object" && e !== null && "type" in e) throw e;
      }
    }
    throw new Error(`LUMEN API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  // Auto-unwrap the { data: ... } envelope (matches oliverApi.ts:74). The
  // LUMEN-API My Brand routes wrap every success body in { data: <result> },
  // so callers always want the inner shape. If a non-envelope endpoint shows
  // up we just return the json as-is.
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

export function lumenGet<T>(
  msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null
) {
  return lumenFetch<T>(msal, account, path, { method: "GET" }, tenantOverride);
}

export function lumenPost<T>(
  msal: IPublicClientApplication, account: AccountInfo, path: string, body?: unknown, tenantOverride?: string | null
) {
  return lumenFetch<T>(msal, account, path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  }, tenantOverride);
}

export function lumenPut<T>(
  msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null
) {
  return lumenFetch<T>(msal, account, path, { method: "PUT", body: JSON.stringify(body) }, tenantOverride);
}

export function lumenPatch<T>(
  msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown, tenantOverride?: string | null
) {
  return lumenFetch<T>(msal, account, path, { method: "PATCH", body: JSON.stringify(body) }, tenantOverride);
}

export function lumenDelete<T>(
  msal: IPublicClientApplication, account: AccountInfo, path: string, tenantOverride?: string | null
) {
  return lumenFetch<T>(msal, account, path, { method: "DELETE" }, tenantOverride);
}

// Structured error returned when the OpenAI key isn't provisioned. The Image
// Studio page swaps to a "not configured" empty-state when it sees this.
export interface ImageStudioNotConfiguredError {
  type: "image_studio_not_configured";
  message: string;
}
export function isImageStudioNotConfiguredError(err: unknown): err is ImageStudioNotConfiguredError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as ImageStudioNotConfiguredError).type === "image_studio_not_configured"
  );
}
