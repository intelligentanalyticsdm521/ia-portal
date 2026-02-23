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
    subscriptionTier?: string | null;
  }>;

  // Client portal verify returns active tenant context; kept optional so IADM Portal can ignore.
  tenant?: {
    tenantId: string;
    tenantName: string;
    tenantFullName: string | null;
  };
  roles?: string[];
}

export interface SelectTenantResponse {
  surface: 'iadm_portal';
  tenant: {
    tenantId: string;
    tenantName: string;
    tenantFullName: string | null;
  };
  user: {
    userId: string;
    tenantUserId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
  roles: string[];
  services: Array<{ serviceId: string; serviceKey: string; name: string }>;
  serviceRoles: Array<{ serviceId: string; serviceKey: string; roleKey: string; roleName: string }>;
  features: Array<{ featureId: string; featureKey: string; name: string; serviceId: string; serviceKey: string }>;
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
    primaryContactPhone: string | null;

    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    stateProvince: string | null;
    postalCode: string | null;
    countryRegion: string | null;
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
    primaryContactPhone?: string | null;

    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    postalCode?: string | null;
    countryRegion?: string | null;
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

export async function sessionVerify(params: {
  baseUrl: string;
  bearerToken: string;
}): Promise<SessionVerifyResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/session/verify`;
  const res = await fetch(url, {
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
}

export async function selectTenant(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<SelectTenantResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/session/select-tenant`;
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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

export async function updateProfile(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  payload: UpdateProfileRequest;
}): Promise<ProfileResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/me/profile`;
  const res = await fetch(url, {
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
