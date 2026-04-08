/**
 * oliverApi.ts — OLIVER API client for the Portal
 *
 * Uses the portal's MSAL auth to call oliver-api directly.
 * All responses unwrap the { data: ... } envelope automatically.
 */

import type { IPublicClientApplication, AccountInfo } from "@azure/msal-browser";
import { authScopes } from "../auth/msalConfig";

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

async function oliverFetch<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getToken(msal, account);
  const tenantId = getTenantId(token);

  const res = await fetch(`${OLIVER_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-key": tenantId,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    // Parse tier-gate 403s into a structured error the UI can handle
    if (res.status === 403) {
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
        // If it's already our tier_gate object, rethrow it
        if (typeof e === "object" && e !== null && "type" in e) throw e;
      }
    }
    throw new Error(`OLIVER API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

export function oliverGet<T>(msal: IPublicClientApplication, account: AccountInfo, path: string) {
  return oliverFetch<T>(msal, account, path, { method: "GET" });
}

export function oliverPost<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body?: unknown) {
  return oliverFetch<T>(msal, account, path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function oliverPatch<T>(msal: IPublicClientApplication, account: AccountInfo, path: string, body: unknown) {
  return oliverFetch<T>(msal, account, path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function oliverDelete<T>(msal: IPublicClientApplication, account: AccountInfo, path: string) {
  return oliverFetch<T>(msal, account, path, { method: "DELETE" });
}
