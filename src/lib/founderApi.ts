/**
 * founderApi.ts — Founder super-user "act-as" client.
 *
 * Backs the FounderTenantPicker + EmergencyBanner components. Hits the
 * oliver-api /super/* routes (gated by founder-tenant membership or
 * SUPER_ADMIN platform role).
 *
 * Phase 1 — Design Option C (normal tenant picker):
 *   listFounderTenants     → GET /super/tenants
 *   actAsTenant            → POST /super/tenants/:id/act-as
 *
 * Phase 2 — Design Option D (30-min emergency read-only):
 *   emergencyActAs         → POST /super/emergency-act-as
 *   endActAsSession        → POST /super/end-session
 *   getCurrentActAsSession → GET  /super/current-session
 *   listActiveActAsSessions→ GET  /super/active-sessions
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

export interface FounderTenant {
  tenant_id: string;
  name: string | null;
  full_name: string | null;
  status: string | null;
  subscription_tier: string | null;
  created_at: string | null;
  primary_contact_email: string | null;
  is_founder_tenant: boolean;
}

export interface ListTenantsResponse {
  tenants: FounderTenant[];
}

export type ActAsMode = "normal" | "emergency";

export interface ActAsResponse {
  ok: boolean;
  session_id: number | null;
  tenant: {
    tenant_id: string;
    name: string | null;
    full_name: string | null;
    status: string | null;
    subscription_tier: string | null;
  };
  acting_as: {
    founder_user_id: string;
    founder_email: string | null;
    mode: ActAsMode;
    started_at: string;
    expires_at?: string;
  };
}

export interface EmergencyActAsResponse extends ActAsResponse {
  session_id: number | null;
  tenant_id: string;
  expires_at: string;
}

export interface ActAsSession {
  actas_log_id: number;
  tenant_id: string;
  tenant_name: string | null;
  tenant_full_name: string | null;
  mode: ActAsMode | "switch"; // legacy
  reason: string | null;
  started_at: string;
  expires_at: string | null;
  request_count: number;
}

export interface CurrentSessionResponse {
  session: ActAsSession | null;
  auto_expired?: boolean;
}

export interface ActiveSessionsResponse {
  sessions: Array<ActAsSession & {
    founder_user_id: string;
    founder_email: string | null;
    client_ip: string | null;
    is_expired: boolean;
  }>;
}

export interface EndSessionResponse {
  ok: boolean;
  ended_count: number;
  ended: Array<{ actas_log_id: number; mode: string; tenant_id: string }>;
}

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
 * GET /super/tenants — list every tenant in core.tenants (founder-only).
 * Used to populate the picker dropdown.
 *
 * Pass the caller's current x-tenant-key (their active iadm tenant) so the
 * oliver-api tenantResolution middleware doesn't 400. The router gates by
 * founder identity, not by tenant scope.
 */
export async function listFounderTenants(
  msal: IPublicClientApplication,
  account: AccountInfo,
  callerTenantId: string | null
): Promise<ListTenantsResponse> {
  const token = await getToken(msal, account);
  const tenantId = (callerTenantId && callerTenantId.trim()) || getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}/super/tenants`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Founder list-tenants failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as ListTenantsResponse;
  return json;
}

/**
 * POST /super/tenants/:id/act-as — "normal mode" tenant switch. Records an
 * audit row and validates the tenant exists. Does NOT mutate any server-side
 * state; the actual context switch happens client-side when subsequent API
 * calls send x-tenant-key=<new>.
 */
export async function actAsTenant(
  msal: IPublicClientApplication,
  account: AccountInfo,
  callerTenantId: string | null,
  targetTenantId: string,
  reason?: string
): Promise<ActAsResponse> {
  const token = await getToken(msal, account);
  const tenantId = (callerTenantId && callerTenantId.trim()) || getTenantId(token);

  const res = await fetch(
    `${OLIVER_API_BASE}/super/tenants/${encodeURIComponent(targetTenantId)}/act-as`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-tenant-key": tenantId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: reason || null }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Founder act-as failed (${res.status}): ${text}`);
  }
  return (await res.json()) as ActAsResponse;
}

/**
 * POST /super/emergency-act-as — open a 30-minute READ-ONLY emergency
 * session against the given tenant. Reason is required (min 10 chars).
 *
 * Once this call succeeds the Portal MUST start sending
 *   x-actas-mode: emergency
 * on every oliver-api request so the backend middleware can enforce the
 * read-only rule. The session expires_at field tells us when to drop the
 * header automatically.
 */
export async function emergencyActAs(
  msal: IPublicClientApplication,
  account: AccountInfo,
  callerTenantId: string | null,
  targetTenantId: string,
  reason: string
): Promise<EmergencyActAsResponse> {
  const token = await getToken(msal, account);
  const tenantId = (callerTenantId && callerTenantId.trim()) || getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}/super/emergency-act-as`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenant_id: targetTenantId, reason }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Surface the 400 reason validation message verbatim so the modal can
    // show it directly. Try to extract the {message} payload first.
    try {
      const body = JSON.parse(text);
      if (body && typeof body === "object" && body.message) {
        throw new Error(body.message);
      }
    } catch {
      // Fallthrough to generic message.
    }
    throw new Error(`Emergency act-as failed (${res.status}): ${text}`);
  }
  return (await res.json()) as EmergencyActAsResponse;
}

/**
 * POST /super/end-session — voluntarily end any open act-as session (normal
 * or emergency) for this founder. Idempotent. This endpoint is in the
 * read-only carve-out so emergency mode never traps the founder.
 */
export async function endActAsSession(
  msal: IPublicClientApplication,
  account: AccountInfo,
  callerTenantId: string | null
): Promise<EndSessionResponse> {
  const token = await getToken(msal, account);
  const tenantId = (callerTenantId && callerTenantId.trim()) || getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}/super/end-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      // Always send emergency header on this call so the middleware lets it
      // through even when we're exiting an emergency session.
      "x-actas-mode": "emergency",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`End act-as session failed (${res.status}): ${text}`);
  }
  return (await res.json()) as EndSessionResponse;
}

/**
 * GET /super/current-session — discover this founder's active session, if any.
 * Used on Portal bootstrap so a page reload doesn't drop the banner countdown.
 */
export async function getCurrentActAsSession(
  msal: IPublicClientApplication,
  account: AccountInfo,
  callerTenantId: string | null
): Promise<CurrentSessionResponse> {
  const token = await getToken(msal, account);
  const tenantId = (callerTenantId && callerTenantId.trim()) || getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}/super/current-session`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Current act-as session lookup failed (${res.status}): ${text}`);
  }
  return (await res.json()) as CurrentSessionResponse;
}

/**
 * GET /super/active-sessions — list every founder's open act-as session.
 * Useful for the founder admin panel; not used by the banner.
 */
export async function listActiveActAsSessions(
  msal: IPublicClientApplication,
  account: AccountInfo,
  callerTenantId: string | null
): Promise<ActiveSessionsResponse> {
  const token = await getToken(msal, account);
  const tenantId = (callerTenantId && callerTenantId.trim()) || getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}/super/active-sessions`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Active act-as sessions lookup failed (${res.status}): ${text}`);
  }
  return (await res.json()) as ActiveSessionsResponse;
}
