
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
  /** 2026-06-20 — real WP content activity (MAX of arion.site_content_change.
   *  changed_at), falling back to plugin heartbeat, then row mtime. Replaces
   *  the misleading "last updated" that only flipped on admin edits. */
  lastContentChangeAt?: string | null;
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

// v2.0.12: plugin apply-defaults + PSI runs can take 30-60s. Allow callers
// to override the default 20s timeout for known-slow endpoints.
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
  timeoutMs?: number;
}): Promise<T> {
  const url = `${normalizeBaseUrl(params.baseUrl)}${params.path}`;
  // v2.0.12: auto-extend timeout for known-slow plugin POST endpoints
  const slowPaths = ['/onboarding/apply-defaults', '/litespeed/config', '/hosting/pagespeed'];
  const defaultTimeout = slowPaths.some((p) => params.path.includes(p)) ? 60_000 : 20_000;
  const res = await fetchWithTimeout(url, {
    method: params.method || 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': params.tenantId,
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body)
  }, params.timeoutMs || defaultTimeout);

  const text = await res.text();
  const body = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    // Error bodies come in two shapes:
    //   { error: "string" }
    //   { error: { code, message, status } }
    // Extract a human-readable message for either.
    let msg = `Request failed (${res.status})`;
    if (typeof body === 'object' && body && 'error' in body) {
      const e = (body as any).error;
      if (typeof e === 'string') msg = e;
      else if (e && typeof e === 'object') msg = e.message || e.code || JSON.stringify(e);
    }
    throw new ArionApiError(msg, res.status, body);
  }

  return body as T;
}

export async function listArionSites(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{ tenant: OverviewResponse['tenant']; sites: ArionSiteSummary[] }>({ ...params, path: '/arion/sites' });
}

export interface ProvisionCodeResponse {
  data: {
    code: string;
    code_id: number;
    expires_at: string;
    install_options: {
      zero_touch_wp_cli: string;
      zero_touch_wp_cli_alt: string;
      magic_link: string;
      manual_code: string;
    };
    site: { id: string; domain: string; primary_url: string | null };
  };
}

export async function mintProvisionCode(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; ttl_days?: number }) {
  return requestJson<ProvisionCodeResponse>({
    ...params, path: `/arion/sites/${params.siteId}/provision-code`, method: 'POST',
    body: { ttl_days: params.ttl_days || 7 },
  });
}

// ---------------------------------------------------------------------------
// Add-site provisioning (existing tenants creating a 2nd+ site).
// Mirrors the public /onboarding/submit flow but tenant-authenticated.
// ---------------------------------------------------------------------------
export interface ProvisionSiteRequest {
  domain: { mode: 'purchase' | 'byod'; domain: string };
  answers: Record<string, unknown>; // QuestionnaireAnswers
  whois?: Record<string, unknown> | null;
}

export interface ProvisionSiteResponse {
  site_id: string;
  job_id: string;
  state: string;
}

export async function provisionNewSite(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  body: ProvisionSiteRequest;
}) {
  const r = await requestJson<{ data: ProvisionSiteResponse }>({
    baseUrl: params.baseUrl,
    bearerToken: params.bearerToken,
    tenantId: params.tenantId,
    path: '/arion/sites/provision',
    method: 'POST',
    body: params.body,
    timeoutMs: 60_000, // domain purchase + WP create can be slow
  });
  return r.data;
}

export interface ProvisioningStatusResponse {
  phase: string;
  progress_percent: number;
  message: string | null;
  error: string | null;
  wp_admin_url: string | null;
  wp_login_url: string | null;
  preview_url: string | null;
}

export async function getProvisioningStatus(params: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  const r = await requestJson<{ data: ProvisioningStatusResponse }>({
    baseUrl: params.baseUrl,
    bearerToken: params.bearerToken,
    tenantId: params.tenantId,
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/provisioning-status`,
  });
  return r.data;
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

/* Phase 3 — SE Ranking expanded endpoints */

export interface SeoEngineMeta {
  id: string;
  name: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  lang: string | null;
  label: string;
}

export interface SeoKeywordRecord {
  keywordId: number;
  keyword: string;
  url: string | null;
  currentPosition: number | null;
  previousPosition: number | null;
  positionChange: number;
  searchVolume: number;
  difficulty: number | null;
  cpc: number;
  competition: number;
  engineCount: number;
  rankingEngineCount: number;
  enginesNotRanking: Array<{ engineId: string; engineLabel: string }>;
  perEngine: Array<{
    engineId: string;
    engineLabel: string;
    engineName: string | null;
    engineRegion: string | null;
    engineDevice: string | null;
    currentPosition: number | null;
    rankingDays: number;
    rangeDays: number;
    rankingDaysPct: number;
    positionChange: number;
    startOfRangePos: number | null;
    endOfRangePos: number | null;
    series: Array<{ date: string; pos: number; change: number }>;
  }>;
}

export interface SeoAggregateStats {
  totalKeywords: number;
  rankingKeywords: number;
  avgPosition: number | null;
  visibilityScore: number;
  top10Count: number;
  buckets: {
    top1: number;
    top2_3: number;
    top4_5: number;
    top6_10: number;
    top11_30: number;
    top31_100: number;
    notRanking: number;
  };
  movers: { jumped: number; dropped: number; unchanged: number };
  trafficForecast: number;
}

export interface SeoRangeInfo {
  code: string;
  label: string;
  current: { start: string; end: string };
  prior: { start: string; end: string };
  days: number;
}

export interface SeoRankingsResponse {
  connected: boolean;
  projectId: string | number | null;
  range: SeoRangeInfo;
  filters: { provider: string; device: string };
  engines: {
    metadata: SeoEngineMeta[];
    availableIds: string[];
    filteredIds: string[];
  };
  stats: {
    current: SeoAggregateStats;
    prior: SeoAggregateStats;
    delta: Record<string, number | null>;
  };
  keywords: SeoKeywordRecord[];
  distributionSeries?: Array<{ date: string; top1: number; top2_3: number; top4_5: number; top6_10: number; top11_30: number; top31_100: number; notRanking: number }>;
  upstreamError: any;
}

export type SeoRangeCode = '7d' | '30d' | '90d' | '365d' | 'current_month' | 'current_quarter' | 'current_year';

export async function getSeoRankings(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; range?: SeoRangeCode; provider?: 'all' | 'google' | 'bing'; device?: 'all' | 'desktop' | 'mobile' }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.range) qp.set('range', params.range);
  if (params.provider) qp.set('provider', params.provider);
  if (params.device) qp.set('device', params.device);
  return requestJson<SeoRankingsResponse>({ ...params, path: `/arion/seo/rankings?${qp.toString()}` });
}

export interface SeoKeywordDetailResponse {
  connected: boolean;
  projectId: string | number | null;
  range: Pick<SeoRangeInfo, 'code' | 'label' | 'current' | 'days'>;
  keyword: SeoKeywordRecord;
}

export async function getSeoKeywordDetail(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; keywordId: string | number; range?: SeoRangeCode }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.range) qp.set('range', params.range);
  return requestJson<SeoKeywordDetailResponse>({ ...params, path: `/arion/seo/keyword/${encodeURIComponent(String(params.keywordId))}?${qp.toString()}` });
}

export interface SeoHeroEngineCard {
  engineId: string;
  name: string;
  label: string;          // short: "Google Desktop", "ChatGPT"
  longLabel: string;      // long: "Google USA · Des Moines, Iowa · EN"
  type: string | null;    // catalog type: google, google_mobile, bing, chatgpt, ...
  device: 'desktop' | 'mobile' | 'ai' | null;
  region: string | null;
  lang: string | null;
  current: SeoAggregateStats;
  prior: SeoAggregateStats;
  avgPositionDelta: number | null;
  visibilityDelta: number;
  top10Delta: number;
  /** True when this card is sourced from AI Result Tracker and stats haven't been wired yet. */
  placeholder?: boolean;
}

export interface SeoOverviewResponse {
  connected: boolean;
  projectId: string | number | null;
  range: SeoRangeInfo;
  engines: { metadata: SeoEngineMeta[]; availableIds: string[] };
  heroCards: {
    /** @deprecated — legacy brand-grouped field kept for backwards compat. Use `standard`. */
    providers: SeoHeroEngineCard[];
    /** Per-engine standard-search cards (Google Desktop, Google Mobile, Bing...). */
    standard: SeoHeroEngineCard[];
    /** Per-engine AI-search cards (ChatGPT, Gemini, AI Mode, Perplexity, AI Overview). */
    ai: SeoHeroEngineCard[];
  };
  stats: {
    current: SeoAggregateStats;
    prior: SeoAggregateStats;
    delta: Record<string, number | null>;
  };
  movers: {
    jumped: Array<{ keywordId: number; keyword: string; currentPosition: number | null; previousPosition: number | null; positionChange: number; searchVolume: number }>;
    dropped: Array<{ keywordId: number; keyword: string; currentPosition: number | null; previousPosition: number | null; positionChange: number; searchVolume: number }>;
    unchanged: number;
  };
  distributionSeries: Array<{ date: string; top1: number; top2_3: number; top4_5: number; top6_10: number; top11_30: number; top31_100: number; notRanking: number }>;
}

export async function getSeoOverview(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; range?: SeoRangeCode }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.range) qp.set('range', params.range);
  return requestJson<SeoOverviewResponse>({ ...params, path: `/arion/seo/overview?${qp.toString()}` });
}

export interface SeoAuditHistorySnapshot {
  date: string;
  auditTime: string | null;
  pagesCrawled: number | null;
  errors: number | null;
  warnings: number | null;
  notices: number | null;
  passed: number | null;
  issueCounts: Record<string, number> | null;
}

export interface SeoAuditTopIssue {
  name: string;
  severity: 'error' | 'warning' | 'notice' | string;
  count: number;
  slug: string | null;
  category?: string;
  categoryName?: string;
}

export interface SeoAuditPage {
  id: string | number;
  url: string;
  status: number;
  depth: number;
  loadMs: number;
  size: number;
  title: string | null;
  titleLen: number;
  description: string | null;
  descriptionLen: number;
  h1: string | null;
  wordsCount: number;
  indexable: boolean;
  noindex: boolean;
  blockedRobots: boolean;
  canonical: string | null;
  errors: number;
  warnings: number;
  notices: number;
  imgCount: number;
  cssSize: number;
  jsSize: number;
  imgSize: number;
  totalLinks: number;
  outlinksInternal: number;
  outlinksExternal: number;
  inlinks: number;
  inlinksFollow: number;
  inlinksNofollow: number;
  redirectCount: number;
  redirectUrl: string | null;
}

export interface SeoAuditResponse {
  connected: boolean;
  status: 'not_connected' | 'running' | 'unavailable' | 'complete';
  auditId?: string | null;
  projectId?: string | number | null;
  healthScore?: number;
  healthScoreSource?: 'se_ranking_official' | 'ia_weighted_fallback' | string;
  pagesCrawled?: number;
  pagesWithIssues?: number;
  pagesHealthy?: number;
  lastAuditDate?: string | null;
  nextScheduledDate?: string | null;
  message?: string;
  issues?: { errors: number; warnings: number; notices: number; passed: number; total?: number };
  deltas?: {
    healthScore: number;
    errors: number;
    warnings: number;
    notices: number;
    crawled: number;
  } | null;
  history?: {
    current?: SeoAuditHistorySnapshot;
    weekly?: SeoAuditHistorySnapshot;
    monthly?: SeoAuditHistorySnapshot;
    quarterly?: SeoAuditHistorySnapshot;
  };
  topIssues?: SeoAuditTopIssue[];
  allIssues?: SeoAuditTopIssue[];
  pages?: SeoAuditPage[];
  indexability?: {
    indexable: number;
    nonIndexable: number;
    blockedBy: {
      robotsTxt: number;
      metaTag: number;
      xRobots: number;
      nonCanonical: number;
      non200Status: number;
    };
  } | null;
  httpStatus?: {
    total: number;
    buckets: { '1xx': number; '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  } | null;
  domain?: {
    domainName: string | null;
    domainTrust: number | null;
    referringDomains: number | null;
    backlinks: number | null;
    pagesInGoogle: number | null;
    expirationDate: string | null;
    lastUpdated: string | null;
  } | null;
  coreWebVitals?: {
    realWorld: { lcp: number | null; inp: number | null; cls: number | null; fcp: number | null };
    lab: { lcp: number | null; cls: number | null; fcp: number | null; speedIndex: number | null; tti: number | null; tbt: number | null };
    hasData: boolean;
  } | null;
  useCases?: Array<{ slug: string; name: string; count: number }> | null;
  pageDistribution?: {
    depth: Record<string, number>;
    responseTime: Record<string, number>;
    redirects: Record<string, number>;
  } | null;
  foundResources?: {
    images: number;
    cssSizeBytes: number;
    jsSizeBytes: number;
    total: number;
  } | null;
  foundLinks?: {
    total: number;
    internal: number;
    external: number;
    nofollow: number;
  } | null;
  issuesByCategory?: Array<{ category: string; errors: number; warnings: number; notices: number }>;
  topPagesByIssues?: Array<{ id: string | number; url: string; errors: number; warnings: number; notices: number }>;
  issueCategories?: Array<{ uid: string; name: string; errorsCount: number; warningsCount: number; noticesCount: number }>;
}

export async function getSeoAudit(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<SeoAuditResponse>({ ...params, path: `/arion/seo/audit?siteId=${encodeURIComponent(params.siteId)}` });
}

/** Full per-page detail from /audit/{id}/page/{pageId}. `page` is raw passthrough. */
export interface SeoAuditPageDetail {
  connected: boolean;
  status: 'complete' | 'unavailable' | 'not_connected';
  projectId?: string | number | null;
  auditId?: string | null;
  pageId?: string;
  page: Record<string, any> | null;
  issues: Array<{
    slug: string | null;
    name: string;
    severity: string;
    count: number;
    description?: string | null;
  }>;
  errors?: string[];
}

export async function getSeoAuditPage(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: string }) {
  return requestJson<SeoAuditPageDetail>({
    ...params,
    path: `/arion/seo/audit/page?siteId=${encodeURIComponent(params.siteId)}&pageId=${encodeURIComponent(params.pageId)}`,
  });
}

export async function addSeoCompetitor(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; domain: string }) {
  return requestJson<{ ok: true; competitor: { id: number | null; domain: string; visibility: number | null } }>({
    ...params,
    method: 'POST',
    path: '/arion/seo/competitors/add',
    body: { siteId: params.siteId, domain: params.domain },
  });
}

export interface SeoCompetitorRecord {
  id: number | null;
  domain: string;
  competitor: string;
  url: string | null;
  engines: string[];
  visibility: number | null;
  visibility_score: number | null;
  keywords: number | null;
  traffic?: number | null;
  overlap: number | null;
  domainTrust?: number | null;
  added_at: string | null;
}

export interface SeoCompetitorContentGapRow {
  keywordId: string;
  keyword: string;
  searchVolume: number | null;
  ourPosition: number | null;
  competitorPositions: Array<{ domain: string; position: number }>;
}

export interface SeoCompetitorsResponse {
  connected: boolean;
  projectId?: string | number;
  engineCount?: number;
  competitors: SeoCompetitorRecord[];
  contentGap?: SeoCompetitorContentGapRow[];
  upstreamErrors?: Array<{ seId?: string; endpoint?: string; status: number; errorText: string | null }>;
}

export async function getSeoCompetitors(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<SeoCompetitorsResponse>({
    ...params,
    path: `/arion/seo/competitors?siteId=${encodeURIComponent(params.siteId)}`,
  });
}

// ────────────────────────────────────────────────────────────────
// AI Search (AIRT — AI Result Tracker)
// ────────────────────────────────────────────────────────────────

export interface SeoAiPromptRanking {
  promptId: string;
  prompt: string;
  position: number | null;
  mentioned: boolean;
  citationUrls: string[];
  competitors: string[];
  date: string;
}

export interface SeoAiEngine {
  engineId: string;
  baseName: string;
  label: string;
  region: string | null;
  lang: string | null;
  unlocked: boolean;
  tierRequired: 'growth' | 'authority' | 'consulting' | string;
  current: {
    mentions: number;
    avgPosition: number | null;
    visibilityScore: number;
    promptsCount: number;
    linkedCount: number;
  };
  prior: {
    mentions: number;
    avgPosition: number | null;
    visibilityScore: number;
    promptsCount: number;
    linkedCount: number;
  };
  delta: {
    mentions: number;
    visibilityScore: number;
    avgPosition: number | null;
  };
  recentPrompts: SeoAiPromptRanking[];
  upstreamErrors?: string[];
}

export interface SeoAiSourcePage {
  url: string;
  citationCount: number;
  engines: string[];
}

export interface SeoAiCompetitorMention {
  competitor: string;
  count: number;
  engines: string[];
}

export interface SeoAiSearchResponse {
  connected: boolean;
  tier?: string;
  tierGated?: boolean;
  message?: string;
  range?: {
    code: string;
    current: { start: string; end: string };
    prior: { start: string; end: string };
    days: number;
  };
  engines: SeoAiEngine[];
  aggregate: {
    totalMentions: number;
    uniquePromptsMentioned: number;
    totalPromptsTracked: number;
    visibilityScore: number;
    topSourcePages: SeoAiSourcePage[];
    competitorMentions: SeoAiCompetitorMention[];
  } | null;
}

export async function getSeoAiSearch(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; range?: string }) {
  const q = new URLSearchParams({ siteId: params.siteId });
  if (params.range) q.set('range', params.range);
  return requestJson<SeoAiSearchResponse>({
    ...params,
    path: `/arion/seo/ai-search?${q.toString()}`,
  });
}

export interface SeoMarketMonitorMove {
  keywordId: string;
  keyword: string;
  competitorDomain: string;
  engineId: string;
  firstPosition: number | null;
  lastPosition: number | null;
  positionChange: number;
  direction: 'up' | 'down';
  firstDate: string;
  lastDate: string;
}

export interface SeoMarketMonitorBacklink {
  referringDomain: string;
  targetUrl: string | null;
  anchorText: string | null;
  domainAuthority: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  snapshotDate: string;
}

export interface SeoMarketMonitorPageChange {
  pageUrl: string;
  pageType: 'own_site' | 'competitor';
  competitorDomain: string | null;
  changeMagnitude: number;
  excerptPrev: string | null;
  excerptNew: string | null;
  titlePrev: string | null;
  titleNew: string | null;
  detectedAt: string;
}

export interface SeoMarketMonitorJobStatus {
  status: 'success' | 'error' | 'running' | 'skipped';
  rowsProcessed: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface SeoMarketMonitorResponse {
  connected: boolean;
  authorityGated: boolean;
  tier: string;
  message?: string;
  windowDays?: number;
  moves: SeoMarketMonitorMove[];
  backlinks: {
    new: SeoMarketMonitorBacklink[];
    lost: SeoMarketMonitorBacklink[];
    totals: { active: number; newThisPeriod: number; lostThisPeriod: number };
  };
  pageChanges: SeoMarketMonitorPageChange[];
  jobStatus: {
    moves: SeoMarketMonitorJobStatus | null;
    backlinks: SeoMarketMonitorJobStatus | null;
    page_changes: SeoMarketMonitorJobStatus | null;
  };
}

export async function getSeoMarketMonitor(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; windowDays?: number }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.windowDays) qp.set('windowDays', String(params.windowDays));
  return requestJson<SeoMarketMonitorResponse>({
    ...params,
    path: `/arion/seo/market-monitor?${qp.toString()}`,
  });
}

// ─── Market Monitor Watchlist ───────────────────────────────────
export interface MmWatchRow {
  watchId: string;
  pageUrl: string;
  pageType: 'own_site' | 'competitor';
  competitorDomain: string | null;
  lastTitle: string | null;
  lastCheckedAt: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface MmWatchlistResponse {
  connected: boolean;
  authorityGated: boolean;
  tier: string;
  ownPages: MmWatchRow[];
  competitorPages: MmWatchRow[];
  usage: { own: number; competitor: number; limits: { own: number; competitorPool: number } };
}

export interface MmSuggestion {
  pageUrl: string;
  pageType: 'own_site' | 'competitor';
  competitorDomain?: string;
  reason: string;
  priority: number;
  preChecked: boolean;
}

export interface MmSuggestionsResponse {
  connected: boolean;
  authorityGated: boolean;
  tier: string;
  limits?: { own: number; competitorPool: number };
  ownPageSuggestions: MmSuggestion[];
  competitorSuggestions: MmSuggestion[];
}

export interface MmSavePageInput {
  pageUrl: string;
  pageType: 'own_site' | 'competitor';
  competitorDomain?: string;
}

export async function getMmWatchlist(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<MmWatchlistResponse>({
    ...params,
    path: `/arion/seo/market-monitor/watchlist?siteId=${encodeURIComponent(params.siteId)}`,
  });
}

export async function saveMmWatchlist(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pages: MmSavePageInput[] }) {
  return requestJson<{ ok: boolean; saved: number; usage: { own: number; competitor: number; limits: { own: number; competitorPool: number } } }>({
    ...params,
    method: 'POST',
    path: `/arion/seo/market-monitor/watchlist`,
    body: { siteId: params.siteId, pages: params.pages },
  });
}

export async function deleteMmWatch(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; watchId: string }) {
  return requestJson<{ ok: boolean; deleted: number }>({
    ...params,
    method: 'DELETE',
    path: `/arion/seo/market-monitor/watchlist/${encodeURIComponent(params.watchId)}?siteId=${encodeURIComponent(params.siteId)}`,
  });
}

export async function getMmSuggestions(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<MmSuggestionsResponse>({
    ...params,
    path: `/arion/seo/market-monitor/suggestions?siteId=${encodeURIComponent(params.siteId)}`,
  });
}

export interface SeoDecayResponse {
  connected: boolean;
  decaying: Array<{
    keywordId: number;
    keyword: string;
    url: string | null;
    priorPosition: number;
    currentPosition: number;
    change: number;
    searchVolume: number;
  }>;
}

export async function getSeoDecay(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<SeoDecayResponse>({ ...params, path: `/arion/seo/decay?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getSeoDiagnostic(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/seo/diagnostic?siteId=${encodeURIComponent(params.siteId)}` });
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

export async function getBingIndexingStats(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/search/bing/stats?siteId=${encodeURIComponent(params.siteId)}` });
}

// Bing Webmaster Tools — Phase 2
export async function verifyBingKey(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; apiKey: string; siteUrl?: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/bing/verify?siteId=${encodeURIComponent(p.siteId)}`, body: { apiKey: p.apiKey, siteUrl: p.siteUrl } });
}
export async function autoConnectBing(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/bing/auto-connect?siteId=${encodeURIComponent(p.siteId)}`, body: {} });
}
export async function checkBingVerification(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/bing/check-verification?siteId=${encodeURIComponent(p.siteId)}`, body: {} });
}
export async function getBingStatus(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/bing/status?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function disconnectBing(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/bing/disconnect?siteId=${encodeURIComponent(p.siteId)}`, body: {} });
}
export async function getBingPerformance(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; period?: number }) {
  const qs = `?siteId=${encodeURIComponent(p.siteId)}&period=${p.period || 30}`;
  return requestJson<any>({ ...p, path: `/arion/bing/performance${qs}` });
}
export async function getBingQueries(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/bing/queries?siteId=${encodeURIComponent(p.siteId)}` });
}

// Google Business Profile — Phase 1 live routes
export async function getGbpBusiness(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function getGbpReviewsLive(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business/reviews?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function getGbpInsightsLive(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; period?: number }) {
  const qs = `?siteId=${encodeURIComponent(p.siteId)}&period=${p.period || 30}`;
  return requestJson<any>({ ...p, path: `/arion/business/insights${qs}` });
}
export async function getGbpPostsLive(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business/posts?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function getGbpQanda(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business/qanda?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function updateGbpBusiness(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, any> }) {
  return requestJson<any>({ ...p, method: 'PATCH', path: `/arion/business/update?siteId=${encodeURIComponent(p.siteId)}`, body: p.body });
}
export async function createGbpPost(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, any> }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/business/posts/create?siteId=${encodeURIComponent(p.siteId)}`, body: p.body });
}
export async function deleteGbpPost(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; postId: string }) {
  return requestJson<any>({ ...p, method: 'DELETE', path: `/arion/business/posts/${encodeURIComponent(p.postId)}?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function replyGbpReview(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; reviewId: string; comment: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/business/reviews/${encodeURIComponent(p.reviewId)}/reply?siteId=${encodeURIComponent(p.siteId)}`, body: { comment: p.comment } });
}
export async function deleteGbpReviewReply(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; reviewId: string }) {
  return requestJson<any>({ ...p, method: 'DELETE', path: `/arion/business/reviews/${encodeURIComponent(p.reviewId)}/reply?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function answerGbpQuestion(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; questionId: string; text: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/business/qanda/${encodeURIComponent(p.questionId)}/answer?siteId=${encodeURIComponent(p.siteId)}`, body: { text: p.text } });
}

// IndexNow key management
export async function getIndexNowStatus(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, path: `/arion/search/indexnow?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function generateIndexNowKey(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/search/indexnow/generate-key?siteId=${encodeURIComponent(params.siteId)}`, body: {} });
}

export async function verifyIndexNowKey(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/search/indexnow/verify?siteId=${encodeURIComponent(params.siteId)}`, body: {} });
}

export async function deleteIndexNowKey(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...params, method: 'DELETE', path: `/arion/search/indexnow?siteId=${encodeURIComponent(params.siteId)}` });
}

export async function getIndexNowSubmissions(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; limit?: number }) {
  const qs = `?siteId=${encodeURIComponent(params.siteId)}&limit=${params.limit || 20}`;
  return requestJson<any>({ ...params, path: `/arion/search/indexnow/submissions${qs}` });
}

export async function createDnsRecords(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; records: any[]; overwrite?: boolean }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/hosting/dns?siteId=${encodeURIComponent(params.siteId)}`, body: { records: params.records, overwrite: !!params.overwrite } });
}

export async function deleteDnsRecords(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; records: any[] }) {
  return requestJson<any>({ ...params, method: 'DELETE', path: `/arion/hosting/dns?siteId=${encodeURIComponent(params.siteId)}`, body: { records: params.records } });
}

export async function runPageSpeed(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; strategy?: string }) {
  // Omit strategy to run BOTH mobile + desktop on the server
  const body = params.strategy ? { strategy: params.strategy } : {};
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/hosting/pagespeed?siteId=${encodeURIComponent(params.siteId)}`, body });
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

// ════════════════════════════════════════════════════════════════════════
// IA Plugin — data proxy endpoints (2026-04-20)
// ════════════════════════════════════════════════════════════════════════

export type PluginStatus = 'connected' | 'disconnected' | 'token_invalid' | 'unreachable' | 'timeout' | 'not_installed' | 'error' | string;

export interface PluginEnvelope<T> {
  data: T | null;
  plugin_status: PluginStatus;
  errors?: string[];
  fallback?: boolean;
  meta?: { tenant_id?: string; timestamp?: string };
}

export interface PluginStatusData {
  plugin_version: string;
  site_configured: boolean;
  tenant_configured: boolean;
  token_configured: boolean;
  api_url_configured: boolean;
  tier: string;
  seo_addon: string | null;
  last_health_check: any;
}

export interface PluginHealthData {
  plugin_version: string;
  wp_version: string;
  php_version: string;
  active_plugins: Array<{ name: string; version: string; active: boolean }>;
  litespeed_active: boolean;
  wordfence_active: boolean;
  rank_math_active: boolean;
  site_url: string;
  admin_email: string;
}

export interface PluginSecurityWordfence {
  installed: boolean;
  firewall_enabled: boolean | null;
  last_scan_at: string | null;
  scan_status: string | null;
  brute_force_on: boolean | null;
  blocked_attacks_24h: number | null;
  malware_findings: number | null;
  outdated_plugins: number | null;
}

export interface PluginSecurityCoreHealth {
  critical_count: number;
  recommended_count: number;
  good_count: number;
  critical: Array<{ test: string; label: string; badge: string | null }>;
  recommended: Array<{ test: string; label: string; badge: string | null }>;
  good: Array<{ test: string; label: string; badge: string | null }>;
}

export interface PluginSecurityUsers {
  total_users: number;
  admin_count: number;
  by_role: Record<string, any>;
  inactive_admins: Array<{ user_id: number; login: string; email: string; last_login_at: string }>;
}

export interface PluginSecurityResponse {
  wordfence: PluginSecurityWordfence | null;
  core_health: PluginSecurityCoreHealth | null;
  users: PluginSecurityUsers | null;
}

export interface PluginLitespeed {
  installed: boolean;
  cache_enabled?: boolean;
  object_cache?: boolean;
  css_minify?: boolean;
  js_minify?: boolean;
  css_combine?: boolean;
  js_combine?: boolean;
  lazy_load_images?: boolean;
  lazy_load_iframes?: boolean;
  image_optimization?: boolean;
  webp_replace?: boolean;
  browser_cache?: boolean;
  mobile_cache?: boolean;
  images_optimized?: number | null;
  images_pulled?: number | null;
  optimization_score?: number;
}

export interface PluginServerInfo {
  php_version: string;
  wp_version: string;
  mysql_version: string | null;
  max_execution_time: number;
  memory_limit: string;
  upload_max_size: string;
  post_max_size: string;
  opcache_enabled: boolean;
  ssl_enabled: boolean;
  wp_debug: boolean;
  wp_multisite: boolean;
  disk_free_bytes: number | null;
  disk_total_bytes: number | null;
}

export interface PluginCron {
  queued_events: number;
  overdue_events: number;
  disabled: boolean;
}

export interface PluginPerformanceResponse {
  litespeed: PluginLitespeed | null;
  server: PluginServerInfo | null;
  cron: PluginCron | null;
}

export interface PluginContentSummary {
  posts_published: number;
  posts_draft: number;
  posts_pending: number;
  posts_scheduled: number;
  pages_published: number;
  pages_draft: number;
  media_count: number;
  last_published: string | null;
  posts_missing_featured_image?: number;
  avg_word_count?: number;
}

export interface PluginContentSeoAgg {
  installed: boolean;
  total_published?: number;
  posts_with_seo_score?: number;
  avg_seo_score?: number | null;
  posts_score_below_50?: number;
  posts_missing_meta_desc?: number;
  posts_missing_focus_kw?: number;
  posts_noindex?: number;
}

export interface PluginContentAggregateResponse {
  summary: PluginContentSummary | null;
  seo: PluginContentSeoAgg | null;
}

export interface PluginThemeData {
  name: string;
  version: string;
  stylesheet: string;
  template: string;
  is_child_theme: boolean;
  parent_name: string | null;
  parent_version: string | null;
  update_available: boolean;
  new_version: string | null;
}

export interface PluginFormsSummary {
  detected_form_plugins: string[];
  has_any_form_plugin: boolean;
  forms_count_gf: number;
}

export interface PluginAvailableUpdates {
  plugins: Array<{ file: string; name: string; current_version: string; new_version: string; slug: string | null; active: boolean }>;
  plugin_update_count: number;
  themes: Array<{ stylesheet: string; name: string; current_version: string; new_version: string }>;
  theme_update_count: number;
  core_update: { current_version: string; new_version: string } | null;
}

export interface PluginSecurityEvent {
  event_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical' | string;
  title: string | null;
  detail_json: string | null;
  source_ip: string | null;
  occurred_at: string;
  ack_at: string | null;
}

export interface PluginUpdateLogEntry {
  log_id: string;
  update_type: 'plugin' | 'theme' | 'core' | string;
  target: string;
  previous_version: string | null;
  new_version: string | null;
  status: 'pending' | 'success' | 'failure' | string;
  error_message: string | null;
  triggered_by: string | null;
  triggered_at: string;
  completed_at: string | null;
}

export async function getPluginStatus(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginStatusData>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/status` });
}
export async function getPluginHealth(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginHealthData>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/health` });
}
export async function getPluginSecurity(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginSecurityResponse>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/security` });
}
export async function getPluginPerformance(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginPerformanceResponse>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/performance` });
}
export async function getPluginContentAggregate(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginContentAggregateResponse>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content-aggregate` });
}
export async function getPluginTheme(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginThemeData>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/theme` });
}
export async function getPluginFormsSummary(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginFormsSummary>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/forms-summary` });
}
export async function getPluginUpdates(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginAvailableUpdates>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/updates` });
}
export async function getPluginPlugins(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<Array<{ file: string; name: string; version: string; active: boolean; update_available: boolean; description?: string; author?: string }>>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/plugins` });
}
export async function updatePluginByFile(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; plugin: string }) {
  return requestJson<PluginEnvelope<{ success: boolean; plugin: string; log_id: string; detail: any }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/updates/plugin`,
    body: { plugin: p.plugin },
  });
}
export async function updateThemeByStylesheet(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; stylesheet: string }) {
  return requestJson<PluginEnvelope<{ success: boolean; stylesheet: string; log_id: string }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/updates/theme`,
    body: { stylesheet: p.stylesheet },
  });
}
export async function updateWpCore(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ success: boolean; log_id: string; detail: any }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/updates/core`,
    body: {},
  });
}
export async function triggerImageOptimize(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ success: boolean; method?: string; detail?: any }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/performance/image-optimize`,
    body: {},
  });
}

// ── v2.0.7 analytics-first plugin data ──────────────────────────────────
export async function getPluginWordfenceFull(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<any>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/security/wordfence-full` });
}
export async function getPluginScanIssues(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ installed: boolean; issues: any[]; total?: number }>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/security/scan-issues` });
}
export async function setPluginWordfenceConfig(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: Record<string, boolean> }) {
  return requestJson<PluginEnvelope<{ installed: boolean; applied: Record<string, boolean>; state: Record<string, boolean> }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/security/wordfence-config`,
    body: p.body,
  });
}
export async function purgePluginCache(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ purged: boolean }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/cache/purge`,
    body: {},
  });
}
// v2.0.10 — Full LiteSpeed config + one-click apply-defaults
export async function getPluginLitespeedConfig(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ installed: boolean; current: Record<string, any>; ia_recommended: Record<string, any>; has_quic_cloud?: boolean }>>({
    ...p,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/litespeed/config`,
  });
}
export async function setPluginLitespeedConfig(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: { settings?: Record<string, any>; apply_ia_defaults?: boolean } }) {
  return requestJson<PluginEnvelope<{ applied: Record<string, any>; applied_count: number }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/litespeed/config`,
    body: p.body,
  });
}
// v2.0.13 GBP location picker (security: no auto-resolve)
export async function listGbpLocations(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { locations: any[]; currently_selected: string | null; site_domain: string; suggestion: string | null } }>({
    ...p,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/locations`,
  });
}
export async function selectGbpLocation(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; locationName: string }) {
  return requestJson<{ data: { selected: string; title: string; address: string; website_uri: string } }>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/select-location`,
    body: { location_name: p.locationName },
  });
}
export async function disconnectGbp(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { disconnected: boolean } }>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/disconnect`,
    body: {},
  });
}

export async function applyPluginIADefaults(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ applied_at: string; results: Record<string, { applied: number; total?: number; errors?: string[]; skipped?: string }> }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/onboarding/apply-defaults`,
    body: {},
  });
}
export async function getPluginContentPace(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ months: Array<{ month: string; posts: number; pages: number }> }>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/publishing-pace` });
}
export async function getPluginContentAgeDist(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<any>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/age-distribution` });
}
export async function getPluginContentAuthors(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ authors: Array<{ user_id: number; display_name: string; posts: number; pages: number }> }>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/authors` });
}
export async function getPluginContentCategories(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ categories: Array<{ term_id: number; name: string; count: number }> }>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/categories` });
}
export async function getPluginContentWordCountDist(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<any>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/word-count-distribution` });
}
export async function getPluginContentActivityCalendar(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ days: Array<{ day: string; count: number }> }>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/activity-calendar` });
}
export async function getPluginContentSeoDetail(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<any>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/content/seo-detail` });
}
export async function getPluginRiskAnalysis(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<{ plugins: any[] }>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/plugins/risk-analysis` });
}
export async function getPluginSecurityEvents(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; limit?: number }) {
  const qp = p.limit ? `?limit=${p.limit}` : '';
  return requestJson<{ data: { events: PluginSecurityEvent[] } }>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/security-events${qp}` });
}
export async function getPluginUpdatesLog(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { entries: PluginUpdateLogEntry[] } }>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/updates-log` });
}

export interface PluginAutoUpdateConfig {
  plugins: Array<{ file: string; name: string; version: string; active: boolean; auto_update: boolean }>;
  themes: Array<{ stylesheet: string; name: string; version: string; active: boolean; auto_update: boolean }>;
  auto_update_all_plugins: boolean;
  auto_update_all_themes: boolean;
  core_minor_enabled: boolean;
  core_major_enabled: boolean;
}

export interface PluginAutoUpdateToggleBody {
  plugin?: string;
  theme?: string;
  enabled?: boolean;
  all_plugins?: boolean;
  all_themes?: boolean;
}

export async function getPluginAutoUpdateConfig(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<PluginEnvelope<PluginAutoUpdateConfig>>({ ...p, path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/auto-update-config` });
}

export async function setPluginAutoUpdateConfig(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: PluginAutoUpdateToggleBody }) {
  return requestJson<PluginEnvelope<{ changes: string[] }>>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/plugin/auto-update-config`,
    body: p.body,
  });
}

// ────────────────────────────────────────────────────────────────
// SE Ranking productization 2026-06-17 — keyword research + management + AI prompts
// ────────────────────────────────────────────────────────────────

export interface SeoKeywordResearchRow {
  keyword: string;
  volume: number;
  difficulty: number;
  cpc: number;
  competition: number;
}

export interface SeoKeywordResearchResponse {
  data: {
    seed: string;
    overview: SeoKeywordResearchRow | null;
    suggestions: SeoKeywordResearchRow[];
    related: SeoKeywordResearchRow[];
    longtail: SeoKeywordResearchRow[];
    questions: SeoKeywordResearchRow[];
  };
  meta: { tier: string; cap: number; used: number; remaining: number };
}

export async function researchKeyword(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; seed: string; region?: string; limit?: number }) {
  return requestJson<SeoKeywordResearchResponse>({
    ...p,
    method: 'POST',
    path: `/arion/seo/keywords/research`,
    body: { seed: p.seed, region: p.region || 'us', limit: p.limit || 25, siteId: p.siteId },
  });
}

// SE Ranking's GET /sites/{id}/keywords returns rows shaped like:
//   { "id": "2952764", "name": "Web Design", "group_id": "50465",
//     "link": null, "first_check_date": null, "tags": [...] }
// IDs come back as strings. Volume/difficulty are NOT on this endpoint
// (they live on the Data API keyword overview). Verified live 2026-06-17.
export interface SeoTrackedKeyword {
  id: string | number;
  name: string;
  group_id?: string | number | null;
  link?: string | null;
  first_check_date?: string | null;
  tags?: string[];
  // Optional fields that may appear in some payload shapes (kept for
  // forward-compat; UI falls back gracefully if missing):
  volume?: number;
  difficulty?: number;
  position?: number | null;
}

export interface SeoTrackedKeywordsResponse {
  data: SeoTrackedKeyword[];
  project_id: string | number | null;
  tier?: string;
}

export async function getTrackedKeywords(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<SeoTrackedKeywordsResponse>({ ...p, path: `/arion/seo/keywords?siteId=${encodeURIComponent(p.siteId)}` });
}

export async function addTrackedKeywords(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; keywords: string[]; groupId?: number }) {
  return requestJson<{ data: any; project_id: string | number }>({
    ...p,
    method: 'POST',
    path: `/arion/seo/keywords/add`,
    body: { siteId: p.siteId, keywords: p.keywords, groupId: p.groupId },
  });
}

export async function removeTrackedKeywords(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; keywordIds: number[] }) {
  return requestJson<{ ok: boolean; removed: number }>({
    ...p,
    method: 'DELETE',
    path: `/arion/seo/keywords`,
    body: { siteId: p.siteId, keywordIds: p.keywordIds },
  });
}

export interface SeoAIPromptItem {
  k2site_llm_id: number;
  keyword: string;
  search_volume?: number;
  intent?: string;
}

export interface SeoAIPromptsByEngine {
  llm_id: number;
  engine_base_name: string;
  country_code?: string;
  lang_code?: string;
  region_name?: string;
  prompts: SeoAIPromptItem[];
}

export interface SeoAIEngineRecord {
  llm_id: number;
  base_name: string;
  country_code: string;
  lang_code: string;
  region_name?: string;
}

export interface SeoAIPromptsResponse {
  data: SeoAIPromptsByEngine[];
  engines: SeoAIEngineRecord[];
  brand: string | null;
  project_id: string | number | null;
  tier: string;
  cap: number;
  allowed_engines: string[];
  total_prompts: number;
}

export async function getAIPrompts(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<SeoAIPromptsResponse>({ ...p, path: `/arion/seo/ai-prompts?siteId=${encodeURIComponent(p.siteId)}` });
}

/** One-shot: sets brand + enables every tier-allowed AI engine on the project. */
export async function setupAIPrompts(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; brand?: string }) {
  return requestJson<{ brand: string; brand_set: boolean; enabled: Array<{ base_name: string; llm_id: number }>; skipped: string[]; tier: string; cap: number }>({
    ...p,
    method: 'POST',
    path: `/arion/seo/ai-prompts/setup`,
    body: { siteId: p.siteId, brand: p.brand },
  });
}

export async function addAIPrompt(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; prompt: string; engine: string }) {
  return requestJson<{ data: any; engine: string; llm_id: number }>({
    ...p,
    method: 'POST',
    path: `/arion/seo/ai-prompts`,
    body: { siteId: p.siteId, prompt: p.prompt, engine: p.engine },
  });
}

export async function removeAIPrompt(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; k2siteLlmId: string | number; llmId: string | number }) {
  return requestJson<{ ok: boolean }>({
    ...p,
    method: 'DELETE',
    path: `/arion/seo/ai-prompts/${encodeURIComponent(String(p.k2siteLlmId))}?siteId=${encodeURIComponent(p.siteId)}&llmId=${encodeURIComponent(String(p.llmId))}`,
  });
}
