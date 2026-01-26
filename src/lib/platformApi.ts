export type PortalContext = 'customer' | 'employee';

/**
 * Existing /auth/verify response contract (DO NOT CHANGE)
 */
export interface VerifyResponse {
  tenant: {
    tenantId: string;
    tenantName: string;
    tenantFullName: string;
  };
  user: {
    userId: string;
    tenantUserId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
  portalContext: PortalContext;
  roles: string[];
}

/**
 * New /me/profile contract (v1 editable profile)
 * Note: This is independent of /auth/verify and does not alter it.
 */
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

/**
 * ✅ RESTORED: verifyAuth (required by AppGate)
 * This must remain exported to avoid breaking portal boot.
 */
export async function verifyAuth(params: {
  baseUrl: string;
  bearerToken: string;
  tenantKey: string;
  portalContext: PortalContext;
}): Promise<VerifyResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/auth/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantKey,
      'x-portal-context': params.portalContext
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

  return body as VerifyResponse;
}

/**
 * Profile endpoints (new)
 */
export async function getProfile(params: {
  baseUrl: string;
  bearerToken: string;
  tenantKey: string;
}): Promise<ProfileResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/me/profile`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantKey
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
  tenantKey: string;
  payload: UpdateProfileRequest;
}): Promise<ProfileResponse> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/me/profile`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantKey
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
