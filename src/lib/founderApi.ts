/**
 * founderApi.ts — Founder super-user "act-as" client.
 *
 * Backs the FounderTenantPicker component. Hits the oliver-api /super/* routes
 * (gated by founder-tenant membership or SUPER_ADMIN platform role).
 *
 * Design Option C (tenant picker) — Phase 1. Option D (emergency drop-down)
 * will add an emergency endpoint in a future batch — see project followups.
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

export interface ActAsResponse {
  ok: boolean;
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
    mode: "switch";
    started_at: string;
  };
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
 * POST /super/tenants/:id/act-as — record an audit row and validate the tenant
 * exists. Does NOT mutate any server-side state; the actual context switch
 * happens client-side when subsequent API calls send x-tenant-key=<new>.
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
