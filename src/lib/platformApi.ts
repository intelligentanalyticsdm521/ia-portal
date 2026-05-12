/**
 * platform-api client
 *
 * ✅ Auth v1.0 Contract:
 * - POST /session/verify
 *   - IADM Portal: returns user + tenant memberships (no x-tenant-key)
 * - POST /session/select-tenant
 *   - IADM Portal: selects active tenant and returns services/features/roles
 *
 * IMPORTANT:
 * - Portal surface is derived from the token's client app id (azp/appid) server-side.
 * - We do NOT send x-portal-context.
 */

export interface SessionVerifyResponse {
  surface: 'iadm_portal' | 'employee_portal' | 'customer_portal';
  user: {
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
  tenants?: Array<{
    tenantId: string;
    tenantName: string;
    tenantFullName: string | null;
    status?: string | null;
    subscriptions?: Array<{
      serviceKey: string;
      planKey: string;
      isActive: boolean;
    }>;
  }>;
  // Optional “active tenant” view if already selected
  activeTenant?: {
    tenantId: string;
    tenantName: string;
    tenantFullName: string | null;
    status?: string | null;
    subscriptions?: Array<{
      serviceKey: string;
      planKey: string;
      isActive: boolean;
    }>;
  };
}

export interface SelectTenantResponse {
  surface: 'iadm_portal' | 'employee_portal' | 'customer_portal';
  tenant: {
    tenantId: string;
    tenantName: string;
    tenantFullName: string | null;
    status?: string | null;
  };
  user: {
    userId: string;
    tenantUserId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
  // simple role keys like ["owner", "admin", ...]
  roles: string[];
  // enabled services for this tenant
  services: Array<{
    serviceId: string;
    serviceKey: string;
    name: string;
  }>;
  // per-service roles for this user
  serviceRoles: Array<{
    serviceId: string;
    serviceKey: string;
    roleKey: string;
    roleName: string;
  }>;
  // enabled features for this tenant
  features: Array<{
    featureId: string;
    featureKey: string;
    name: string;
    serviceId: string;
    serviceKey: string;
  }>;
}

export interface ProfileResponse {
  user: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
  tenant: {
    businessName: string | null;
    businessType: string | null;
    jobTitle: string | null;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;

    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    stateProvince: string | null;
    postalCode: string | null;
    countryRegion: string | null;

    // Cross-product brandable fields. OLIVER invoices, customer portal,
    // ARION reports — every customer-facing surface reads these so a tenant
    // configures their brand once and it flows everywhere.
    logoUrl: string | null;
    brandColor: string | null;
    billingEmail: string | null;
    supportEmail: string | null;
    websiteUrl: string | null;
  };
}

export interface UpdateProfileRequest {
  user?: {
    firstName?: string | null;
    lastName?: string | null;
  };
  tenant?: {
    businessName?: string | null;
    businessType?: string | null;
    jobTitle?: string | null;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;

    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    postalCode?: string | null;
    countryRegion?: string | null;

    logoUrl?: string | null;
    brandColor?: string | null;
    billingEmail?: string | null;
    supportEmail?: string | null;
    websiteUrl?: string | null;
  };
}

export class PlatformApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
    this.body = body;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * fetchWithTimeout
 * - aborts the request after timeoutMs
 * - surfaces timeouts as PlatformApiError with status = 0
 */
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 20000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const opts: RequestInit = { ...options, signal: controller.signal };

  return fetch(url, opts)
    .catch((err: any) => {
      if (err && (err.name === 'AbortError' || (err as any).code === 'ABORT_ERR')) {
        throw new PlatformApiError(
          `Request to platform-api timed out after ${timeoutMs}ms`,
          0,
          null
        );
      }
      throw err;
    })
    .finally(() => clearTimeout(id));
}

function shouldRetryPlatformError(err: unknown): err is PlatformApiError {
  return err instanceof PlatformApiError && (err.status === 0 || err.status >= 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSingleRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!shouldRetryPlatformError(err)) throw err;
    await delay(350);
    return fn();
  }
}

export async function sessionVerify(params: {
  baseUrl: string;
  bearerToken: string;
}): Promise<SessionVerifyResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/session/verify`;

  return withSingleRetry(async () => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.bearerToken}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await res.text();
    const body = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      const msg =
        typeof body === 'object' && body && 'error' in body
          ? String((body as any).error)
          : `Request failed (${res.status})`;
      throw new PlatformApiError(msg, res.status, body);
    }

    return body as SessionVerifyResponse;
  });
}

export async function selectTenant(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<SelectTenantResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/session/select-tenant`;

  return withSingleRetry(async () => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tenantId: params.tenantId })
    });

    const text = await res.text();
    const body = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      const msg =
        typeof body === 'object' && body && 'error' in body
          ? String((body as any).error)
          : `Request failed (${res.status})`;
      throw new PlatformApiError(msg, res.status, body);
    }

    return body as SelectTenantResponse;
  });
}

/**
 * Profile endpoints (tenant-scoped)
 */
export async function getProfile(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<ProfileResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/me/profile`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId
    }
  });

  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as any).error)
        : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }

  return body as ProfileResponse;
}

/**
 * Platform-level access — caller's role + product access list, plus admin
 * endpoints to manage other users in the tenant.
 */
export type PlatformRole = 'admin' | 'user' | 'read_only';

export interface MeAccessResponse {
  role: PlatformRole;
  products: string[]; // e.g. ['arion', 'oliver', 'spark']
  capabilities: {
    canManageUsers: boolean;
    canViewBilling: boolean;
    canMutate: boolean;
  };
}

export interface PlatformTenantUser {
  userId: string;
  email: string;
  displayName: string | null;
  role: PlatformRole;
  hasExplicitRole: boolean;
  products: string[];
  isSelf: boolean;
}

export async function getMeAccess(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<MeAccessResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/me/access`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
    },
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as MeAccessResponse;
}

export async function listTenantUsers(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<{ users: PlatformTenantUser[] }> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/tenant-users`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
    },
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as { users: PlatformTenantUser[] };
}

export async function updateTenantUserRole(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  userId: string;
  role: PlatformRole;
}): Promise<PlatformTenantUser> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/tenant-users/${encodeURIComponent(params.userId)}/role`;
  const res = await fetchWithTimeout(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
    },
    body: JSON.stringify({ role: params.role }),
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as PlatformTenantUser;
}

export async function updateTenantUserProducts(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  userId: string;
  products: string[];
}): Promise<PlatformTenantUser> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/tenant-users/${encodeURIComponent(params.userId)}/products`;
  const res = await fetchWithTimeout(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
    },
    body: JSON.stringify({ products: params.products }),
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as PlatformTenantUser;
}

export async function updateProfile(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  payload: UpdateProfileRequest;
}): Promise<ProfileResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/me/profile`;
  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId
    },
    body: JSON.stringify(params.payload)
  });

  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as any).error)
        : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }

  return body as ProfileResponse;
}