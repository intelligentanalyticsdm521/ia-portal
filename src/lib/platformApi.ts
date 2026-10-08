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

import { emergencyActAsHeaders } from "./emergencyActAs";
import type { JobView, TeamEmployee, TeamJobChange } from "./team";

export interface SessionVerifyResponse {
  surface: 'iadm_portal' | 'employee_portal' | 'customer_portal';
  user: {
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    /** 2026-06-20 — SUPER_ADMIN role on core.user_platform_roles. Only
     *  super-users see the tenant picker; everyone else auto-routes to
     *  their home tenant (per Brandon's locked rule). */
    isSuperUser?: boolean;
    /** 2026-06-24 — Founder role on core.user_platform_roles (also true
     *  when the user has SUPER_ADMIN — super-admin is a superset).
     *  Drives day-to-day founder UX (Consulting > Onboard Client, Access
     *  Log, Tenant Workspace). Decouples those surfaces from
     *  SUPER_ADMIN, which is now reserved as an emergency-only role. */
    isFounder?: boolean;
  };
  /** 2026-06-20 — the tenant we should land on by default if the user
   *  isn't a super-user. For IA team always the founder tenant; for client
   *  users their oldest active membership. */
  homeTenantId?: string | null;
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
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
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

// 2026-09-01 — the access endpoints answer in snake_case
// (user_id, full_name, has_explicit_role, is_self) while this interface — and
// every component reading it — is camelCase. The response was handed straight
// back with `as PlatformTenantUser[]`, so TypeScript happily agreed and
// `u.userId` was undefined at runtime.
//
// What that looked like: the list rendered, because `email` and `role` happen to
// spell the same either way, but the display name was blank and EVERY action
// keyed on the id sent `undefined` — so toggling product access PATCHed
// /tenant-users/undefined/products, SQL Server rejected "undefined" as a
// uniqueidentifier, and the 500 came back to the user as "Error loading users."
//
// Normalising here, at the client boundary, keeps the API contract untouched
// for any other consumer and makes the declared type honest. An `as` cast is
// not a check — that is the same hole as the {data:...} double-unwrap.
function toTenantUser(raw: any): PlatformTenantUser {
  return {
    userId: raw?.userId ?? raw?.user_id ?? '',
    email: raw?.email ?? '',
    displayName: raw?.displayName ?? raw?.full_name
      ?? ([raw?.first_name, raw?.last_name].filter(Boolean).join(' ') || null),
    role: raw?.role,
    hasExplicitRole: raw?.hasExplicitRole ?? raw?.has_explicit_role ?? false,
    products: Array.isArray(raw?.products) ? raw.products : [],
    isSelf: raw?.isSelf ?? raw?.is_self ?? false,
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
      ...emergencyActAsHeaders(),
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
      ...emergencyActAsHeaders(),
    },
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  const rawUsers = (body as any)?.users;
  return { users: Array.isArray(rawUsers) ? rawUsers.map(toTenantUser) : [] };
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
      ...emergencyActAsHeaders(),
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
  return toTenantUser(body);
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
      ...emergencyActAsHeaders(),
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
  return toTenantUser(body);
}

export interface PendingInvitation {
  email: string;
  role_key: string;
  status: string;
  invited_at: string;
}

export async function listPendingInvitations(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<{ invitations: PendingInvitation[] }> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/tenant-invitations`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as { invitations: PendingInvitation[] };
}

export async function inviteTenantUser(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  email: string;
  role: PlatformRole;
}): Promise<{ email: string; role: PlatformRole; status: string; note?: string }> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/tenant-users/invite`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
    body: JSON.stringify({ email: params.email, role: params.role }),
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && ('details' in body || 'error' in body)
      ? String((body as any).details || (body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as { email: string; role: PlatformRole; status: string; note?: string };
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
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
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

/* ── Consulting Access ──────────────────────────────────────────────────── */

export interface ConsultingClient {
  tenant_id: string;
  name: string | null;
  full_name: string | null;
  managed?: boolean;
  scope?: string;
  expires_at?: string | null;
  via: 'platform_admin' | 'grant';
}
export interface ConsultingAccessEntry {
  user_email: string | null;
  action: string;
  summary: string | null;
  metadata_json: string | null;
  occurred_at: string;
}

async function consultingGet<T>(params: {
  baseUrl: string; bearerToken: string; tenantId: string; path: string;
}): Promise<T> {
  const url = `${normalizeBaseUrl(params.baseUrl)}${params.path}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    }
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error) : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as T;
}

export function getConsultingClients(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
}): Promise<{ operatorRole: string; clients: ConsultingClient[] }> {
  return consultingGet({ ...params, path: '/consulting/clients' });
}

export function getConsultingManaged(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
}): Promise<{ managed: boolean; activeGrants: number }> {
  return consultingGet({ ...params, path: '/consulting/managed' });
}

export function getConsultingAccessLog(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
}): Promise<{ entries: ConsultingAccessEntry[] }> {
  return consultingGet({ ...params, path: '/consulting/access-log' });
}

export async function setConsultingManaged(params: {
  baseUrl: string; bearerToken: string; tenantId: string; enabled: boolean;
}): Promise<{ managed: boolean }> {
  const url = `${normalizeBaseUrl(params.baseUrl)}/consulting/managed`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
    body: JSON.stringify({ enabled: params.enabled })
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error) : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as { managed: boolean };
}
// ── Sept 2026 Release A (F7): founder-only client-facing error log ─────────

export interface ErrorLogRow {
  id: number;
  tenant_id: string | null;
  tenant_name: string | null;
  user_email: string | null;
  api: string;
  method: string;
  path: string;
  status: number;
  error_code: string | null;
  message: string | null;
  request_id: string;
  created_at: string;
}

export async function getErrorLog(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  filters?: {
    tenant?: string;
    api?: string;
    status?: number;
    from?: string;
    to?: string;
    q?: string;
    limit?: number;
    offset?: number;
  };
}): Promise<{ total: number; rows: ErrorLogRow[] }> {
  const qs = new URLSearchParams();
  const f = params.filters || {};
  if (f.tenant) qs.set('tenant', f.tenant);
  if (f.api) qs.set('api', f.api);
  if (f.status) qs.set('status', String(f.status));
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  if (f.q) qs.set('q', f.q);
  if (f.limit) qs.set('limit', String(f.limit));
  if (f.offset) qs.set('offset', String(f.offset));
  const url = `${normalizeBaseUrl(params.baseUrl)}/admin/error-log${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
  });
  const body = safeJsonParse(await res.text());
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error) : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return (body as { data: { total: number; rows: ErrorLogRow[] } }).data;
}

/* ── Web push (Foundation A2) ───────────────────────────────────────────── */

export interface PushSubscriptionRow {
  subscriptionId: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  disabledAt: string | null;
}

interface PushCallParams {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}

/**
 * One request helper for the four push routes. They all share the header block
 * and the error shape, and copying it four more times is how the sixth caller
 * ends up missing `emergencyActAsHeaders()`.
 */
async function pushRequest<T>(
  params: PushCallParams,
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const res = await fetchWithTimeout(`${normalizeBaseUrl(params.baseUrl)}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as any).error)
      : `Request failed (${res.status})`;
    throw new PlatformApiError(msg, res.status, body);
  }
  return body as T;
}

/**
 * The VAPID public key the browser needs to subscribe. `configured: false`
 * means the environment has no key pair — the settings row shows push as
 * unavailable rather than throwing an error at someone who did nothing wrong.
 */
export function getPushPublicKey(params: PushCallParams) {
  return pushRequest<{ publicKey: string | null; configured: boolean }>(
    params,
    '/me/push/vapid-public-key',
  );
}

/** The caller's own devices. THIS is the state the toggle reads — not localStorage. */
export function listPushSubscriptions(params: PushCallParams) {
  return pushRequest<{ subscriptions: PushSubscriptionRow[] }>(params, '/me/push/subscriptions');
}

export function savePushSubscription(
  params: PushCallParams & { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } },
) {
  return pushRequest<{ ok: boolean; subscriptionId: string; created: boolean }>(
    params,
    '/me/push/subscribe',
    { method: 'POST', body: params.subscription },
  );
}

export function deletePushSubscription(params: PushCallParams & { endpoint: string }) {
  return pushRequest<{ ok: boolean; deleted: number }>(params, '/me/push/subscribe', {
    method: 'DELETE',
    body: { endpoint: params.endpoint },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Foundation B — "Your business"
   ══════════════════════════════════════════════════════════════════════════

   ONE record per business, read by every product and every agent.

   The response separates what this record OWNS from what it BORROWS. Hours,
   the business basics and the price list live somewhere else and are echoed
   here read-only, each labelled with the page that owns them, so this page can
   show the whole picture in one call without ever becoming a second place to
   edit them (decision F-3, one home per fact). Sending one of those on the PUT
   is a 400 naming where it belongs — not a silent drop.
*/

export interface BusinessProfileFields {
  industry: string | null;
  description: string | null;
  tagline: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  services: Array<{ name: string; offering_id?: string; note?: string }> | null;
  servicesSummary: string | null;
  serviceArea: {
    kind?: 'radius' | 'list';
    center_postal_code?: string;
    miles?: number;
    states?: string[];
    cities?: string[];
    zip_prefixes?: string[];
    note?: string;
  } | null;
  capacity: { jobs_per_day?: number; crew_count?: number; lead_time_days?: number; booked_through?: string } | null;
  capacityNote: string | null;
  idealJob: string | null;
  idealCustomer: string | null;
  differentiators: string | null;
  noGoList: string | null;
  doNotSay: string | null;
  rulesPlainText: string | null;
  responsePromiseMinutes: number | null;
  responsePromiseText: string | null;
  escalation: { name?: string; phone?: string; email?: string; when?: string } | null;
  languages: string[] | null;
  // ── What your team knows (contract ARGUS employees phase 1 §E.2). NULL = not
  // set. The jobs read only what is SAVED here; a starter or a prefill is a
  // suggestion until the owner presses Save.
  offersAllowed?: Array<{ words: string; note?: string }> | null;
  proofAllowed?: Array<{ words: string; from: string }> | null;
  namesNeverMention?: string[] | null;
  namesYouMayMention?: string[] | null;
  competitors?: string[] | null;
  customerWords?: string[] | null;
}

export type BusinessHours = Record<
  string,
  { open: string | null; close: string | null; closed: boolean }
>;

export interface BusinessProfilePriceItem {
  offeringId: string;
  name: string;
  description: string | null;
  requiresQuote: boolean;
  /** Read live from the OLIVER catalogue on every load. Never stored here. */
  startsAt: number | null;
  currency: string;
}

export interface BusinessProfileResponse {
  profile: BusinessProfileFields;
  borrowed: {
    businessHours: { value: BusinessHours | null; editedAt: string; home: string };
    basics: { value: Record<string, string | null> | null; editedAt: string; home: string };
    prices: {
      available: boolean;
      items: BusinessProfilePriceItem[];
      /** Present and true when the catalogue could not be read — with a reason. */
      prices_unavailable?: boolean;
      reason?: string | null;
      editedAt: string;
      home: string;
    };
  };
  prices_unavailable: boolean;
  /** Fields we filled in from ARION / OLIVER that the owner has not confirmed. */
  prefilled: Array<{ field: string; source: string }>;
  prefilledFields: string[];
  questions: Array<{ key: string; label: string; fields: string[]; borrowed?: string }>;
  completeness: { answered: number; total: number; pct: number; questions: Array<{ key: string; label: string; answered: boolean }> };
  version: number;
  exists: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
  sources: Array<{ source: string; ok: boolean; error?: string }>;
  /** Only on a PUT response. */
  changed?: boolean;
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
}

export interface BusinessProfileVersion {
  versionId: string;
  version: number;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
  changedAt: string;
  changedBy: string | null;
}

interface BusinessProfileCallParams {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}

async function businessProfileRequest<T>(
  params: BusinessProfileCallParams,
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const res = await fetchWithTimeout(`${normalizeBaseUrl(params.baseUrl)}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    // A "this belongs somewhere else" refusal carries the list; surface it as
    // the message so the page can say exactly which field and which page.
    const b = body as { error?: string; message?: string; details?: string[]; rejected?: Array<{ field: string; message: string }> } | null;
    if (b?.rejected?.length) {
      throw new PlatformApiError(b.rejected.map((r) => `${r.field}: ${r.message}`).join(' '), res.status, body);
    }
    if (b?.details?.length) throw new PlatformApiError(b.details.join(' '), res.status, body);
    throw new PlatformApiError(b?.message || b?.error || `Request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

export function getBusinessProfile(params: BusinessProfileCallParams) {
  return businessProfileRequest<BusinessProfileResponse>(params, '/me/business-profile');
}

/** Partial: send only what changed. Anything owned elsewhere is refused, loudly. */
export function updateBusinessProfile(
  params: BusinessProfileCallParams & { payload: Partial<BusinessProfileFields> },
) {
  return businessProfileRequest<BusinessProfileResponse>(params, '/me/business-profile', {
    method: 'PUT',
    body: params.payload,
  });
}

export function getBusinessProfileHistory(params: BusinessProfileCallParams) {
  return businessProfileRequest<{ versions: BusinessProfileVersion[] }>(
    params,
    '/me/business-profile/history',
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ARGUS → Your team (contract ARGUS employees phase 1 §C.1)
   ══════════════════════════════════════════════════════════════════════════

   platform-api is the ONE writer of a job's On/Off, its mode and the owner's
   limits. Every screen that shows a job's switch (the employee page, ARGUS →
   Workflows, the Responder page, ARION → Reviews) writes through PUT
   /me/team/jobs/:jobKey, so there is one row and no second copy.

   A refusal is a 4xx/503 carrying a plain sentence; it changes nothing. The
   error keeps the status and the body so the screen can say that sentence in
   the row it came from (lib/team.ts teamRefusal).
*/


interface TeamCallParams {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}

async function teamRequest<T>(
  params: TeamCallParams,
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const res = await fetchWithTimeout(`${normalizeBaseUrl(params.baseUrl)}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
      ...emergencyActAsHeaders(),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const b = body as { words?: string; message?: string } | null;
    throw new PlatformApiError(b?.words || b?.message || `Request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

export function getTeam(params: TeamCallParams) {
  return teamRequest<{ employees: TeamEmployee[] }>(params, '/me/team');
}

export function getTeamEmployee(params: TeamCallParams & { employeeKey: string }) {
  return teamRequest<{ employee: TeamEmployee; jobs: JobView[] }>(
    params, `/me/team/${encodeURIComponent(params.employeeKey)}`,
  );
}

/** Every team-home job this business has switched on (ARGUS → Workflows → All). */
export function getTeamJobsOn(params: TeamCallParams) {
  return teamRequest<{ jobs: JobView[] }>(params, '/me/team/jobs?enabled=1');
}

export function putTeamJob(
  params: TeamCallParams & { jobKey: string; patch: { enabled?: boolean; mode?: 'automatic' | 'review'; vars?: Record<string, unknown> } },
) {
  return teamRequest<JobView & { changed?: boolean }>(params, `/me/team/jobs/${encodeURIComponent(params.jobKey)}`, {
    method: 'PUT',
    body: params.patch,
  });
}

/** The last 20 changes to one job's setting, newest first: { at, words, actor }. */
export async function getTeamJobChanges(params: TeamCallParams & { jobKey: string }): Promise<TeamJobChange[]> {
  const body = await teamRequest<unknown>(
    params, `/me/team/jobs/${encodeURIComponent(params.jobKey)}/changes`,
  );
  // The contract names the rows, not the key around them; take either name, or a bare list.
  if (Array.isArray(body)) return body as TeamJobChange[];
  const b = (body || {}) as { changes?: TeamJobChange[]; events?: TeamJobChange[] };
  return b.changes || b.events || [];
}
