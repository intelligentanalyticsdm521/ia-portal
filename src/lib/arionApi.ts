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
  arionTier: string;
  seoAddonTier: string | null;
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

export async function getContentSeo(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { pages: any[]; posts: any[]; summary: { avg_score: number; missing_meta: number; no_focus_keyword: number; total: number } } }>({
    ...params,
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/content-seo`
  });
}

export async function getVulnerabilities(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { vulnerabilities: any[]; plugins_checked: number; critical: number; high: number; medium: number } }>({
    ...params,
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/vulnerabilities`
  });
}

export async function getPagespeedHistory(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { snapshots: any[] } }>({
    ...params,
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/pagespeed-history`
  });
}

export async function getAdminLink(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/admin-link` });
}

export async function getEditorLink(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/editor-link` });
}

export async function getForms(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/forms` });
}

export async function getBookings(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/bookings` });
}

export async function getGbpProfile(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/gbp` });
}

export async function getGbpInsights(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/gbp/insights` });
}

export async function getGbpReviews(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/gbp/reviews` });
}

export async function replyToReview(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; reviewId: string; replyText: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/sites/${encodeURIComponent(params.siteId)}/gbp/reviews/${encodeURIComponent(params.reviewId)}/reply`, body: { reply_text: params.replyText } });
}

export async function getSiteDetail(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}` });
}

export async function getSearchPerformance(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: string; period?: number; groupBy?: string; days?: number }) {
  const qp = new URLSearchParams({ provider: params.provider, siteId: params.siteId });
  if (params.period != null) qp.set('period', String(params.period));
  else if (params.days != null) qp.set('days', String(params.days));
  if (params.groupBy) qp.set('groupBy', params.groupBy);
  return requestJson<any>({ ...params, path: `/arion/search/performance?${qp.toString()}` });
}

export async function inspectUrl(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; url: string }) {
  return requestJson<any>({ ...params, path: `/arion/search/url-inspection?siteId=${encodeURIComponent(params.siteId)}&url=${encodeURIComponent(params.url)}` });
}

export async function submitUrlForIndexing(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; url: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: '/arion/search/submit-url', body: { siteId: params.siteId, url: params.url } });
}

export async function getSearchSitemaps(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: string }) {
  return requestJson<any>({ ...params, path: `/arion/search/sitemaps?provider=${encodeURIComponent(params.provider)}&siteId=${encodeURIComponent(params.siteId)}` });
}

export async function submitSitemap(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; sitemapUrl: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: '/arion/search/sitemaps', body: { siteId: params.siteId, sitemapUrl: params.sitemapUrl } });
}

export async function getCoreWebVitals(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/search/core-web-vitals?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getBusinessOverview(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; provider: string }) {
  return requestJson<any>({ ...params, path: `/arion/business/overview?provider=${encodeURIComponent(params.provider)}&siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getBusinessPosts(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/business/posts?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function createBusinessPost(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, any> }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/business/posts?siteId=${encodeURIComponent(params.siteId)}`, body: params.body });
}

export async function getBusinessServices(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/business/services?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getAnalyticsReport(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; reportType: string }) {
  return requestJson<any>({ ...params, path: `/arion/analytics/report?siteId=${encodeURIComponent(params.siteId)}&type=${encodeURIComponent(params.reportType)}` });
}

export async function generateSitemap(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: '/arion/search/generate-sitemap', body: { siteId: params.siteId } });
}

export async function createDnsRecords(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; records: any[] }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/hosting/dns?siteId=${encodeURIComponent(params.siteId)}`, body: { records: params.records } });
}

export async function deleteDnsRecords(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; records: any[] }) {
  return requestJson<any>({ ...params, method: 'DELETE', path: `/arion/hosting/dns?siteId=${encodeURIComponent(params.siteId)}`, body: { records: params.records } });
}

export async function runPageSpeed(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; strategy?: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/hosting/pagespeed?siteId=${encodeURIComponent(params.siteId)}`, body: { strategy: params.strategy } });
}

export async function updateContentSeo(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; postId: string; fields: Record<string, string> }) {
  return requestJson<any>({ ...params, method: 'PUT', path: `/arion/sites/${encodeURIComponent(params.siteId)}/content-seo/${encodeURIComponent(params.postId)}`, body: params.fields });
}

export async function submitConsultingInquiry(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; serviceType: string; description: string; triggerPage: string; contactPref?: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/sites/${encodeURIComponent(params.siteId)}/consulting-inquiry`, body: { service_type: params.serviceType, description: params.description, trigger_page: params.triggerPage, contact_pref: params.contactPref || 'email' } });
}

export async function getGoogleProperties(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { ga4Properties: Array<{ propertyId: string; displayName: string; account: string }>; gscSites: Array<{ siteUrl: string; permissionLevel: string }>; currentGa4PropertyId: string | null } }>({
    ...params,
    path: `/arion/integrations/google/properties?siteId=${encodeURIComponent(params.siteId)}`
  });
}

export async function selectGoogleProperties(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; ga4PropertyId: string; gscSiteUrl: string }) {
  return requestJson<{ data: { ok: true } }>({
    ...params,
    method: 'POST',
    path: '/arion/integrations/google/select',
    body: { siteId: params.siteId, ga4PropertyId: params.ga4PropertyId, gscSiteUrl: params.gscSiteUrl }
  });
}

export async function getGscData(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; days?: number }) {
  const qp = params.days ? `?days=${params.days}` : '';
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/gsc${qp}` });
}

export async function getSeoSummary(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/sites/${encodeURIComponent(params.siteId)}/seo-summary` });
}
