/**
 * sparkApi.ts — SPARK (LUMEN) API client for the Portal
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";
import { emergencyActAsHeaders } from "./emergencyActAs";

const SPARK_API_BASE =
  (import.meta.env.VITE_SPARK_API_BASE as string) ||
  (import.meta.env.VITE_LUMEN_API_BASE as string) ||
  "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

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

async function sparkFetch<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit,
  tenantOverride?: string | null
): Promise<T> {
  const token = await getToken(msal, account);
  const tenantId = (tenantOverride && tenantOverride.trim()) || getTenantId(token);

  const res = await fetch(`${SPARK_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-id": tenantId,
      "Content-Type": "application/json",
      // Founder emergency act-as — no-op outside an active 30-min emergency
      // session. LUMEN-API does NOT yet have the read-only middleware
      // (followup). Sending the header now is forward-compat so backend can
      // start enforcing without another Portal release.
      ...emergencyActAsHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      try {
        const body = JSON.parse(text);
        if (body.error === "feature_not_available") {
          throw { type: "tier_gate" as const, tierRequired: body.tier_required || "pro", currentTier: body.current_tier || "standard" };
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
