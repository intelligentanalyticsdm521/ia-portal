export type SetupMode = 'ARION_AUTO_SETUP' | 'EXISTING_INTEGRATION';

export interface ArionSiteSummary {
  siteId: string;
  tenantId: string;
  wpUrl: string;
  status: string;
  primaryDomain: string | null;
  sslStatus: string | null;
  packageCode: string | null;
  isEcommerceEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  integrationCount?: number;
}

export interface OverviewResponse {
  tenant: { tenantId: string; tenantName: string; tenantFullName: string | null };
  site: ArionSiteSummary | null;
  permissions: {
    siteCount: number;
    siteLimit: number | null;
    canCreateSite: boolean;
    extraSitePriceMonthly: number;
    extraSitePriceAnnual: number;
  };
  integrations: {
    googleAnalytics: boolean;
    googleSearchConsole: boolean;
    googleBusinessProfile: boolean;
    bingWebmaster: boolean;
    bingPlaces: boolean;
    appleBusinessConnect: boolean;
    seRankingProject: boolean;
  };
  overview: {
    users: number | null;
    sessions: number | null;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    avgPosition: number | null;
  };
  hosting: {
    siteStatus: string | null;
    sslStatus: string | null;
    pluginUpdatesAvailable: number | null;
    wordpressVersion: string | null;
    phpVersion: string | null;
    performanceScore: number | null;
    lastHealthCheckAt: string | null;
  };
  seo: {
    connected: boolean;
    seoPackageCode: string | null;
    visibilityScore: number | null;
    auditScore: number | null;
    trackedKeywords: number | null;
    trackedCompetitors: number | null;
    trackedModels: number | null;
  };
  myBusiness: {
    google: BusinessProfileData;
    apple: BusinessProfileData;
    bing: BusinessProfileData;
  };
}

export interface WebsiteAnalyticsResponse {
  site: ArionSiteSummary | null;
  provider: 'GOOGLE' | 'BING';
  connected: boolean;
  summary: {
    users: number | null;
    sessions: number | null;
    views: number | null;
    engagementRate: number | null;
    avgEngagementTimeSeconds: number | null;
    conversions: number | null;
    revenueUsd: number | null;
  };
  breakdowns: {
    topPages: Array<Record<string, unknown>>;
    topSources: Array<Record<string, unknown>>;
    devices: Array<Record<string, unknown>>;
    geos: Array<Record<string, unknown>>;
    landingPages: Array<Record<string, unknown>>;
  };
  integration: IntegrationRecord | null;
}

export interface HostingResponse {
  site: ArionSiteSummary | null;
  health: {
    wordpressVersion: string | null;
    phpVersion: string | null;
    pluginUpdatesAvailable: number | null;
    themeUpdatesAvailable: number | null;
    sslStatus: string | null;
    siteStatus: string | null;
    lastHealthCheckAt: string | null;
    formDeliveryStatus: string | null;
    performanceScore: number | null;
  } | null;
  plugins: Array<{
    pluginKey: string;
    pluginName: string | null;
    pluginVersion: string | null;
    isRequired: boolean;
    isActive: boolean;
    lastCheckedAt: string | null;
  }>;
  requests: Array<{
    siteRequestId: string;
    requestType: string;
    requestStatus: string;
    requestedAt: string;
    notes: string | null;
  }>;
}

export interface ConsoleResponse {
  site: ArionSiteSummary | null;
  provider: 'GOOGLE' | 'BING';
  connected: boolean;
  summary: {
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    avgPosition: number | null;
  };
  breakdowns: {
    queries: Array<Record<string, unknown>>;
    pages: Array<Record<string, unknown>>;
    devices: Array<Record<string, unknown>>;
    countries: Array<Record<string, unknown>>;
    comparisons: Array<Record<string, unknown>>;
  };
  integration: IntegrationRecord | null;
}

export interface SeoResponse {
  site: ArionSiteSummary | null;
  connected: boolean;
  integration: IntegrationRecord | null;
  package: {
    code: string | null;
    label: string | null;
    keywordLimit: number | null;
    competitorLimit: number | null;
    modelLimit: number | null;
    groupLimit: number | null;
    aiEnabled: boolean;
    dataApiEnabled: boolean;
  };
  snapshot: {
    visibilityScore: number | null;
    auditScore: number | null;
    trackedKeywords: number | null;
    trackedCompetitors: number | null;
    trackedModels: number | null;
    criticalIssues: number | null;
    warningIssues: number | null;
  };
  breakdowns: Record<string, unknown>;
}

export interface BusinessProfileData {
  connected: boolean;
  editable: boolean;
  displayName: string | null;
  primaryCategory: string | null;
  websiteUrl: string | null;
  mapsUrl: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  hours: Record<string, unknown> | null;
  resourceUrl: string | null;
  integration: IntegrationRecord | null;
}

export interface IntegrationRecord {
  siteIntegrationId: string;
  providerCode: string;
  status: string;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleConnectResponse {
  authUrl: string;
}

export interface CreateSeoProjectResponse {
  integration: IntegrationRecord;
  snapshot?: Record<string, unknown> | null;
}

export class ArionApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ArionApiError';
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

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .catch((err: any) => {
      if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
        throw new ArionApiError(`Request to arion-api timed out after ${timeoutMs}ms`, 0, null);
      }
      throw err;
    })
    .finally(() => clearTimeout(id));
}

async function requestJson<T>(params: {
  baseUrl: string;
  path: string;
  bearerToken: string;
  tenantId: string;
  method?: string;
  body?: unknown;
}): Promise<T> {
  const url = `${normalizeBaseUrl(params.baseUrl)}${params.path}`;
  const res = await fetchWithTimeout(url, {
    method: params.method || 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body)
  });

  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body ? String((body as any).error) : `Request failed (${res.status})`;
    throw new ArionApiError(msg, res.status, body);
  }

  return body as T;
}

export async function listArionSites(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{ tenant: OverviewResponse['tenant']; sites: ArionSiteSummary[] }>({ ...params, path: '/arion/sites' });
}

export async function getArionOverview(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId?: string | null }) {
  const qs = params.siteId ? `?siteId=${encodeURIComponent(params.siteId)}` : '';
  return requestJson<OverviewResponse>({ ...params, path: `/arion/overview${qs}` });
}

export async function getWebsiteAnalytics(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: 'google' | 'bing'; periodCode?: string }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.periodCode) qp.set('periodCode', params.periodCode);
  return requestJson<WebsiteAnalyticsResponse>({ ...params, path: `/arion/website-analytics/${params.provider}?${qp.toString()}` });
}

export async function getHosting(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<HostingResponse>({ ...params, path: `/arion/hosting?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getConsoleReport(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: 'google' | 'bing'; periodCode?: string }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.periodCode) qp.set('periodCode', params.periodCode);
  return requestJson<ConsoleResponse>({ ...params, path: `/arion/console/${params.provider}?${qp.toString()}` });
}

export async function getSeo(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<SeoResponse>({ ...params, path: `/arion/seo?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getMyBusiness(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: 'google' | 'apple' | 'bing' }) {
  return requestJson<{ site: ArionSiteSummary | null; provider: string; profile: BusinessProfileData }>({
    ...params,
    path: `/arion/my-business/${params.provider}?siteId=${encodeURIComponent(params.siteId)}`
  });
}

export async function connectGoogle(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; setupMode: SetupMode; returnUrl: string }) {
  return requestJson<GoogleConnectResponse>({
    ...params,
    method: 'POST',
    path: '/arion/integrations/google/connect',
    body: { siteId: params.siteId, setupMode: params.setupMode, returnUrl: params.returnUrl }
  });
}

export async function updateGoogleBusiness(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, unknown> }) {
  return requestJson<{ ok: true; profile: BusinessProfileData }>({
    ...params,
    method: 'PUT',
    path: `/arion/my-business/google?siteId=${encodeURIComponent(params.siteId)}`,
    body: params.body
  });
}

export async function updateLinkedBusinessProfile(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: 'apple' | 'bing'; body: Record<string, unknown> }) {
  return requestJson<{ ok: true; profile: BusinessProfileData }>({
    ...params,
    method: 'PUT',
    path: `/arion/my-business/${params.provider}?siteId=${encodeURIComponent(params.siteId)}`,
    body: params.body
  });
}

export async function createSeoProject(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, unknown> }) {
  return requestJson<CreateSeoProjectResponse>({
    ...params,
    method: 'POST',
    path: '/arion/seo/project/create',
    body: { siteId: params.siteId, ...params.body }
  });
}

export async function linkSeoProject(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, unknown> }) {
  return requestJson<CreateSeoProjectResponse>({
    ...params,
    method: 'POST',
    path: '/arion/seo/project/link',
    body: { siteId: params.siteId, ...params.body }
  });
}

export async function createArionRequest(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; requestType: string; notes: string }) {
  return requestJson<{ request: { siteRequestId: string } }>({
    ...params,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/requests`,
    body: { requestType: params.requestType, notes: params.notes }
  });
}
