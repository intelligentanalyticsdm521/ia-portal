import { emergencyActAsHeaders } from './emergencyActAs';
import { getCurrentTenantOverride } from './tenantContext';
import type {
  AgentActivityPayload, AgentRunsPayload, AgentSettingsResponse,
} from '../components/agents/types';

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
    /** ISO timestamp of when the founder/tenant clicked "Mark as Claimed" in
     *  the BusinessAppleOverview page. NULL if unclaimed. Surfaces in the
     *  setup hint copy ("Claimed on Jun 25, 2026") since Apple has no API. */
    appleBusinessConnectClaimedAt?: string | null;
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
    /** A3-2 — true when arion.site.plugin_status === 'connected'. Drives the
     *  "install the IA plugin" hint on the ARION overview (show iff false). */
    pluginConnected?: boolean;
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

/** 403 `{ error: { code } }` arion-api returns on every /arion/seo/* surface
 *  for a site with no paid SEO add-on (middleware/requireSeoAddon.js, pricing
 *  rework 2026-08-21). GET /arion/seo itself passes through and answers with
 *  the upsell payload. useArionData exposes it as `errorCode`; the SEO pages
 *  treat it as "no add-on" and render the AddonUpsell CTA instead of a
 *  generic error state. */
export const SEO_ADDON_REQUIRED = 'SEO_ADDON_REQUIRED';

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
  // View-as override: if the founder is viewing a client, route the call to
  // that tenant regardless of the tenantId the caller computed. Backend will
  // 403 non-GETs because of the view-as header below.
  const viewAsTid = getCurrentTenantOverride();
  const effectiveTenantId = viewAsTid && viewAsTid.trim() ? viewAsTid.trim() : params.tenantId;
  const res = await fetchWithTimeout(url, {
    method: params.method || 'GET',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
      'x-tenant-key': effectiveTenantId,
      // Founder emergency act-as — no-op header outside an active 30-min
      // emergency session. While active, the backend middleware on arion-api
      // (TODO — see followups) will be able to 403 non-GET mutations against
      // arion routes. For oliver-api the middleware is already in place.
      ...emergencyActAsHeaders(),
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

// ─── ARGUS AI Data Pack ──────────────────────────────────────────────────
// All ARGUS endpoints live at /argus (no /arion prefix — they cover
// cross-product credit tracking even for tenants without ARION).
export interface ArgusBalance {
  data: {
    tenant_id: string;
    balance: number;
    lifetime_granted: number;
    lifetime_spent: number;
    lifetime_refunded: number;
    monthly_allocation: number;
    pool_base: number;
    pool_bonus: number;
    base_tier: string;
    badge_color: 'green' | 'yellow' | 'red';
  };
}

export async function getArgusBalance(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<ArgusBalance>({ ...params, path: '/argus/balance' });
}

export interface ArgusUsage {
  data: {
    days: number;
    by_action: Array<{
      action_type: string;
      call_count: number;
      credits_spent: number;
      cost_basis_total: number;
      refunded_count: number;
    }>;
  };
}

export async function getArgusUsage(params: { baseUrl: string; bearerToken: string; tenantId: string; days?: number }) {
  return requestJson<ArgusUsage>({ ...params, path: `/argus/usage?days=${params.days || 30}` });
}

export interface ArgusPricingRow {
  action_type: string;
  credits_per_call: number;
  description: string | null;
  outlier_cap_usd: number;
  is_active: boolean;
  updated_at: string;
}

export async function getArgusPricing(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{ data: ArgusPricingRow[] }>({ ...params, path: '/argus/pricing' });
}

export async function patchArgusPricing(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  actionType: string;
  body: { credits_per_call?: number; outlier_cap_usd?: number; description?: string; is_active?: boolean };
}) {
  return requestJson<{ data: { action_type: string; updated: boolean } }>({
    ...params, path: `/argus/pricing/${encodeURIComponent(params.actionType)}`, method: 'PATCH', body: params.body,
  });
}

export interface ArgusMargin {
  data: {
    days: number;
    by_action: Array<{
      action_type: string;
      call_count: number;
      credits_sold: number;
      cost_basis_total: number;
      avg_cost_basis: number;
      cost_ratio: number;
      margin_ratio: number;
      outlier_count: number;
    }>;
  };
}

export async function getArgusMargin(params: { baseUrl: string; bearerToken: string; tenantId: string; days?: number }) {
  return requestJson<ArgusMargin>({ ...params, path: `/argus/margin?days=${params.days || 30}` });
}

// ARGUS Auto-Topoff config — per-tenant auto-refill rules. Off by default.
export interface ArgusAutoTopoffConfig {
  enabled: boolean;
  threshold_credits: number;
  refill_pack_size: number;
  max_per_month_usd: number;
  month_spent_usd: number;
  month_period_start: string;
  last_charge_at: string | null;
  last_charge_amount_usd: number | null;
}

export async function getArgusAutoTopoff(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{ data: ArgusAutoTopoffConfig }>({ ...params, path: '/argus/auto-topoff' });
}

export async function patchArgusAutoTopoff(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  body: Partial<Pick<ArgusAutoTopoffConfig, 'enabled' | 'threshold_credits' | 'refill_pack_size' | 'max_per_month_usd'>>;
}) {
  return requestJson<{ data: ArgusAutoTopoffConfig }>({
    ...params, path: '/argus/auto-topoff', method: 'PATCH', body: params.body,
  });
}

export async function postArgusGrant(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  body: { tenant_id: string; credits: number; grant_type?: string; notes?: string; expires_at?: string };
}) {
  return requestJson<{ data: { grant_id: string } }>({
    ...params, path: '/argus/grant', method: 'POST', body: params.body,
  });
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

/**
 * Apple Business Connect has no OAuth/API — claim status is recorded
 * manually after the tenant finishes signup at register.apple.com/business.
 * Pass `claimed: false` to UNMARK (clears apple_claimed_at).
 */
export async function markAppleClaimed(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; claimed?: boolean }) {
  return requestJson<{ data: { ok: true; apple_claimed: boolean; apple_claimed_at: string | null } }>({
    baseUrl: params.baseUrl,
    bearerToken: params.bearerToken,
    tenantId: params.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/apple/mark-claimed`,
    body: { claimed: params.claimed !== false }
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

// ─── Website change requests ─────────────────────────────────────────────
// arion.site_request (migration 055). The client sees their own site's
// history; the founder sees every business's queue behind /admin.
export type SiteRequestStatus = 'open' | 'in_progress' | 'done' | 'declined';

export interface ArionSiteRequest {
  siteRequestId: string;
  tenantId: string;
  siteId: string;
  requestType: string;
  notes: string | null;
  status: SiteRequestStatus;
  requestedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** What we wrote back when we finished or declined it. */
  resolutionNotes: string | null;
  /** Founder queue only — joined from arion.site / core.tenants. */
  domain?: string | null;
  tenantName?: string | null;
}

/** The signed-in business's own history for one site, newest first. */
export async function listArionRequests(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ requests: ArionSiteRequest[] }>({
    ...params,
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/requests`
  });
}

/** Founder queue across every business. arion-api /admin/site-requests. */
export async function listFounderSiteRequests(params: { baseUrl: string; bearerToken: string; tenantId: string; status?: string }) {
  const qs = params.status ? `?status=${encodeURIComponent(params.status)}` : '';
  return requestJson<{ requests: ArionSiteRequest[] }>({ ...params, path: `/admin/site-requests${qs}` });
}

/** Founder moves one request, optionally leaving the client a reply. */
export async function updateFounderSiteRequest(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  siteRequestId: string; status: SiteRequestStatus; resolutionNotes?: string;
}) {
  return requestJson<{ request: ArionSiteRequest; clientEmailQueued: boolean }>({
    ...params,
    method: 'PATCH',
    path: `/admin/site-requests/${encodeURIComponent(params.siteRequestId)}`,
    body: { status: params.status, resolutionNotes: params.resolutionNotes || undefined }
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

/**
 * IA STAFF ONLY since ARION pack 2 (D-ARION-G) — the button that calls this is
 * gated on `isFounder`.
 *
 * `dest` is an OPTIONAL WordPress admin screen so support lands where they were
 * asked to look rather than on the dashboard. It is validated at BOTH ends (a
 * bare admin file, optionally with a query string) and made absolute by the
 * website itself, so it cannot send anybody anywhere else.
 */
export async function getAdminLink(params: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; dest?: string;
}) {
  const qs = params.dest ? `?dest=${encodeURIComponent(params.dest)}` : '';
  return requestJson<any>({
    ...params,
    path: `/arion/sites/${encodeURIComponent(params.siteId)}/admin-link${qs}`,
  });
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

export async function getInsightsMetrics(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; months?: number }) {
  const qp = new URLSearchParams({ siteId: params.siteId });
  if (params.months != null) qp.set('months', String(params.months));
  return requestJson<{ source: string; months: string[]; metrics: Record<string, Array<number | null>> }>({ ...params, path: `/arion/insights/metrics?${qp.toString()}` });
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
export async function getGbpServices(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business/services?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function draftGbpReviewReply(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; reviewId: string; reviewerName?: string; starRating?: number; comment?: string | null }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/business/reviews/${encodeURIComponent(p.reviewId)}/draft-reply?siteId=${encodeURIComponent(p.siteId)}`, body: { reviewerName: p.reviewerName, starRating: p.starRating, comment: p.comment } });
}
export async function getGbpAutoReply(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business/reviews/auto-reply?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function setGbpAutoReply(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; enabled: boolean; minStars: number }) {
  return requestJson<any>({ ...p, method: 'PUT', path: `/arion/business/reviews/auto-reply?siteId=${encodeURIComponent(p.siteId)}`, body: { enabled: p.enabled, minStars: p.minStars } });
}
export async function getGbpMedia(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<any>({ ...p, path: `/arion/business/media?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function addGbpMedia(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; sourceUrl: string; category?: string }) {
  return requestJson<any>({ ...p, method: 'POST', path: `/arion/business/media?siteId=${encodeURIComponent(p.siteId)}`, body: { sourceUrl: p.sourceUrl, category: p.category } });
}
export async function deleteGbpMedia(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; mediaId: string }) {
  return requestJson<any>({ ...p, method: 'DELETE', path: `/arion/business/media/${encodeURIComponent(p.mediaId)}?siteId=${encodeURIComponent(p.siteId)}` });
}
export async function saveGbpServices(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; services: Array<Record<string, any>> }) {
  return requestJson<any>({ ...p, method: 'PUT', path: `/arion/business/services?siteId=${encodeURIComponent(p.siteId)}`, body: { services: p.services } });
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

// updateContentSeo is DELETED (2026-09-08, ARION pack 1). It PUT to a route
// that needed a WP application password nothing has ever written, so it could
// not have worked on any client site, and no component called it. The three
// search-engine fields live in the page-settings sheet now and go through
// saveSitePageSeo, which rides the same site token as every other write.

export async function submitConsultingInquiry(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; serviceType: string; description: string; triggerPage: string; contactPref?: string }) {
  return requestJson<any>({ ...params, method: 'POST', path: `/arion/sites/${encodeURIComponent(params.siteId)}/consulting-inquiry`, body: { service_type: params.serviceType, description: params.description, trigger_page: params.triggerPage, contact_pref: params.contactPref || 'email' } });
}

export async function getGoogleProperties(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; showAll?: boolean }) {
  const qs = params.showAll ? `&showAll=1` : '';
  return requestJson<{ data: { ga4Properties: Array<{ propertyId: string; displayName: string; account: string }>; gscSites: Array<{ siteUrl: string; permissionLevel: string }>; ga4Properties_total?: number; gscSites_total?: number; domain_filter_active?: boolean; site_domain?: string | null; no_matching_properties?: boolean; can_auto_provision?: boolean; currentGa4PropertyId: string | null; currentGa4PropertyName?: string | null; currentGa4MatchesDomain?: boolean; currentGscSiteUrl?: string | null; currentGscMatchesDomain?: boolean } }>({
    ...params,
    path: `/arion/integrations/google/properties?siteId=${encodeURIComponent(params.siteId)}${qs}`
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

export interface AutoProvisionSubResult { ok: boolean; error?: string; property_id?: string; site_url?: string; location_name?: string; verification_pending?: boolean }
export interface AutoProvisionResponse {
  data: {
    mode: 'ia_managed';
    provision: { configured: boolean; ga4: AutoProvisionSubResult; gsc: AutoProvisionSubResult; gbp: AutoProvisionSubResult };
    transfer: { configured?: boolean; ga4: AutoProvisionSubResult; gsc: AutoProvisionSubResult; gbp: AutoProvisionSubResult };
    ownership_transferred: boolean;
    warnings: string[];
  };
}
export async function autoProvisionGoogle(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; businessName?: string; contactEmail?: string }) {
  return requestJson<AutoProvisionResponse>({
    ...params,
    method: 'POST',
    path: `/onboarding/google-oauth/auto-provision`,
    body: { tenant_id: params.tenantId, site_id: params.siteId, business_name: params.businessName, contact_email: params.contactEmail },
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
export async function listGbpLocations(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; showAll?: boolean }) {
  const qs = p.showAll ? `?showAll=1` : '';
  return requestJson<{ data: { locations: any[]; locations_total?: number; domain_filter_active?: boolean; no_matching_locations?: boolean; can_auto_provision?: boolean; currently_selected: string | null; site_domain: string; suggestion: string | null; auto_selected?: { location_name: string; title: string; reason: string } | null } }>({
    ...p,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/locations${qs}`,
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

// ── GBP Connect Batch B (2026-07-22) — client-owned listing creation +
// in-ARION verification. The listing is created on the CLIENT'S OAuth token
// under the CLIENT'S Google account (client = PRIMARY_OWNER), then the
// portal drives Google's verification flow: options → request → PIN
// complete → VoiceOfMerchant status.
export interface GbpCreateListingInput {
  title: string;
  primary_category: string;
  phone: string;
  website_uri?: string;
  address?: {
    addressLines: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  service_area?: boolean;
  /** Disambiguates when the backend answers 409 multiple_accounts. */
  account_name?: string;
}
export interface GbpVerificationOption {
  verificationMethod: string;
  phoneNumber?: string;
  addressData?: any;
  emailData?: { user?: string; domain?: string; isUserNameEditable?: boolean };
  announcement?: string;
  /** Optional enrichments forwarded to Google's verify request. */
  emailAddress?: string;
  mailerContact?: string;
}
export interface GbpVerification {
  name: string;
  method: string;
  state: string;
  createTime?: string;
  announcement?: string;
}
export interface GbpVerificationStatus {
  location_name: string;
  has_voice_of_merchant: boolean;
  is_verified: boolean;
  voice_of_merchant_state: any;
  verification: { method: string | null; name: string | null; state: string | null; requested_at: string | null } | null;
}
export async function createGbpListing(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; body: GbpCreateListingInput }) {
  return requestJson<{ data: { location_name: string; title: string; account_name: string; verification_required: boolean } }>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/create-listing`,
    body: p.body,
  });
}
export async function getGbpVerificationOptions(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { options: GbpVerificationOption[]; location_name: string } }>({
    ...p,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/verification-options`,
  });
}
export async function requestGbpVerification(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; option: GbpVerificationOption | string }) {
  return requestJson<{ data: { verification: GbpVerification | null; location_name: string } }>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/request-verification`,
    body: { option: p.option },
  });
}
export async function completeGbpVerification(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; verificationName: string; pin: string }) {
  return requestJson<{ data: { verification: GbpVerification | null; has_voice_of_merchant: boolean | null; location_name: string } }>({
    ...p,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/complete-verification`,
    body: { verification_name: p.verificationName, pin: p.pin },
  });
}
export async function getGbpVerificationStatus(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: GbpVerificationStatus }>({
    ...p,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/gbp/verification-status`,
  });
}

// ── Onboarding V3 Phase 3 — tenant-scoped GBP multi-location store ─────────
// Backend commit c296d6b. The legacy per-site selectGbpLocation path keeps
// working (picks which location a single SITE is anchored to). These new
// endpoints expose the tenant-wide row-per-location store so a tenant can
// see + manage every GBP location they own and pick which one is primary.
export interface BusinessLocation {
  location_id: string;
  tenant_id: string;
  site_id: string | null;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  location_name: string | null;
  display_name: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  primary_category: string | null;
  place_id: string | null;
  review_uri: string | null;
  is_primary: boolean | number;
  is_verified: boolean | number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listBusinessLocations(p: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{
    data: BusinessLocation[];
    meta: { tenant_id: string; count: number; primary: string | null; timestamp: string };
  }>({ ...p, path: '/arion/business-locations' });
}

export async function setBusinessLocationPrimary(p: { baseUrl: string; bearerToken: string; tenantId: string; locationId: string }) {
  return requestJson<{
    data: { primary_location_id: string; updated: boolean };
    meta: { tenant_id: string; timestamp: string };
  }>({
    ...p,
    method: 'POST',
    path: `/arion/business-locations/${encodeURIComponent(p.locationId)}/set-primary`,
    body: {},
  });
}

export async function syncBusinessLocations(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId?: string | null }) {
  const qp = p.siteId ? `?siteId=${encodeURIComponent(p.siteId)}` : '';
  return requestJson<{
    data: { added: number; updated: number; removed: number; total: number; primary: string | null };
    meta: { tenant_id: string; timestamp: string };
  }>({
    ...p,
    method: 'POST',
    path: `/arion/business-locations/sync${qp}`,
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

// ════════════════════════════════════════════════════════════════════════
// AI Website Builder — Phase 1 (2026-06-20)
// ════════════════════════════════════════════════════════════════════════
// Backend: 8 emitters + assembler + WP injector live in arion-api
// (commits 67dcb83, 8316e7c, 07720d3).
//   POST /arion/sites/:siteId/blocks/:kind                generate one block
//   GET  /arion/sites/:siteId/blocks?accepted=1           list drafts
//   POST /arion/sites/:siteId/blocks/draft/:blockId/accept  mark accepted
//   POST /arion/sites/:siteId/blocks/assemble             assemble + inject
// Each emitter persists a row into arion.site_block_draft and returns the
// rendered block_json shape consumable by the Elementor injector.

export type AiBlockKind =
  | 'hero'
  | 'services'
  | 'testimonials'
  | 'cta'
  | 'about'
  | 'faq'
  | 'gallery'
  | 'contact';

export interface AiBlockDraft {
  draft_block_id: string;
  kind: AiBlockKind | string;
  block_json: Record<string, any> | null;
  tokens_used: number | null;
  latency_ms: number | null;
  accepted: boolean;
  created_at: string;
  updated_at: string;
  /** Optional context the emitter was called with — preserved for re-runs. */
  context?: Record<string, any> | null;
}

export interface AiGenerateBlockResponse {
  block_json: Record<string, any>;
  tokens_used: number;
  latency_ms: number;
  draft_block_id: string;
}

export interface AiAssembleResponse {
  pageId: string | number;
  edit_url: string;
  blocksInjected: number;
}

export async function generateBlock(p: {
  baseUrl: string; bearerToken: string; tenantId: string;
  siteId: string; kind: AiBlockKind; context?: Record<string, any>;
}) {
  return requestJson<AiGenerateBlockResponse>({
    baseUrl: p.baseUrl,
    bearerToken: p.bearerToken,
    tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/blocks/${encodeURIComponent(p.kind)}`,
    body: { context: p.context || {} },
    // Anthropic calls can take 15-40s for a single block. Don't 20s-timeout.
    timeoutMs: 90_000,
  });
}

export async function listBlockDrafts(p: {
  baseUrl: string; bearerToken: string; tenantId: string;
  siteId: string; opts?: { accepted?: boolean; kind?: AiBlockKind };
}) {
  const qp = new URLSearchParams();
  if (p.opts?.accepted) qp.set('accepted', '1');
  if (p.opts?.kind) qp.set('kind', p.opts.kind);
  const qs = qp.toString();
  return requestJson<{ data: AiBlockDraft[] }>({
    baseUrl: p.baseUrl,
    bearerToken: p.bearerToken,
    tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/blocks${qs ? `?${qs}` : ''}`,
  });
}

export async function acceptBlockDraft(p: {
  baseUrl: string; bearerToken: string; tenantId: string;
  siteId: string; draftBlockId: string;
}) {
  return requestJson<{ ok: boolean }>({
    baseUrl: p.baseUrl,
    bearerToken: p.bearerToken,
    tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/blocks/draft/${encodeURIComponent(p.draftBlockId)}/accept`,
    body: {},
  });
}

export async function assembleBlocks(p: {
  baseUrl: string; bearerToken: string; tenantId: string;
  siteId: string; draftBlockIds: string[]; pageId?: string | number | null;
}) {
  return requestJson<AiAssembleResponse>({
    baseUrl: p.baseUrl,
    bearerToken: p.bearerToken,
    tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/blocks/assemble`,
    body: {
      pageId: p.pageId ?? undefined,
      draftBlockIds: p.draftBlockIds,
    },
    // WP injection round-trip can also be slow.
    timeoutMs: 90_000,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// IA Insights — Service Area config
// Tenant service-area + service-category config used by the Visibility &
// Reach trend engine. GET returns the current config; PUT replaces it
// (pass `serviceArea: null` to clear).
// ───────────────────────────────────────────────────────────────────────────
export interface IaInsightsServiceAreaResponse {
  data?: { city?: string; state?: string; regions?: string[]; zips?: string[] } | null;
  service_category?: string | null;
}

export async function getIaInsightsServiceArea(params: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<IaInsightsServiceAreaResponse>({
    ...params,
    path: `/arion/ia-insights/service-area?siteId=${encodeURIComponent(params.siteId)}`,
  });
}

export async function putIaInsightsServiceArea(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  body: {
    siteId: string;
    serviceArea: { city?: string; state?: string; regions?: string[]; zips?: string[] } | null;
    serviceCategory?: string;
  };
}) {
  return requestJson<{ ok?: boolean }>({
    baseUrl: params.baseUrl,
    bearerToken: params.bearerToken,
    tenantId: params.tenantId,
    method: 'PUT',
    path: '/arion/ia-insights/service-area',
    body: params.body,
  });
}

// ─── Sept-A F4: internal-traffic exclusion (GA self/client-traffic blocking) ─

export interface InternalIpEntry { ip: string; source: 'platform' | 'site' }
export interface InternalIpsResponse {
  data: { entries: InternalIpEntry[]; caller_ip: string; ga4_connected: boolean };
}

export async function getInternalIps(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<InternalIpsResponse>({ ...params, path: `/arion/sites/${params.siteId}/internal-ips` });
}

/** No ip in the body ⇒ the server records the CALLER's network ("Exclude my current network"). */
export async function addInternalIp(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; ip?: string }) {
  return requestJson<{ data: { added: string; entries: InternalIpEntry[]; push: { pushed: boolean; reason: string | null } } }>({
    ...params,
    path: `/arion/sites/${params.siteId}/internal-ips`,
    method: 'POST',
    body: params.ip ? { ip: params.ip } : {},
  });
}

export async function removeInternalIp(params: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string; ip: string }) {
  return requestJson<{ data: { removed: string; entries: InternalIpEntry[]; push: { pushed: boolean; reason: string | null } } }>({
    ...params,
    path: `/arion/sites/${params.siteId}/internal-ips?ip=${encodeURIComponent(params.ip)}`,
    method: 'DELETE',
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ARION site builder — Pages and the section-list editor (Phase 1A, 2026-09-05)
//
// The client opens the Portal, clicks a page, changes the words or the
// picture, previews it, and publishes. No WordPress, no Elementor.
// Backend: arion-api routes/arion/pages.js. Every ARION tier can use it (W-4).
// ───────────────────────────────────────────────────────────────────────────

export type PageStatus = 'publish' | 'draft' | 'pending' | 'future' | 'private';

export interface ArionSitePage {
  pageId: number;
  title: string;
  slug: string;
  status: PageStatus | string;
  type: string;
  modified: string | null;
  permalink: string | null;
  /** True when at least one section on the page is one we can edit here. */
  iaManaged: boolean;
  sectionCount: number;
  editableSectionCount: number;
  /**
   * An UPPER BOUND on how many sections built on the site could be made
   * editable, from the website's coarse widget census. The exact answer needs
   * the mapper and arrives when the page is opened, so this is worded as
   * "up to N" wherever it is shown.
   */
  adoptCandidateCount?: number;
}

/** Why a section cannot be edited in the Portal. `null` means it can. */
export type SectionLockReason = 'custom' | 'no_field_markers' | null;

/**
 * "We could not tell which of these two boxes is which, so check this."
 *
 * A curated layout draws a card by hand and nothing in it says which text is
 * the period and which is the list of what is included. The server reaches for
 * a marker first (a currency sign, a bullet, a quotation mark) and only falls
 * back to "the longer one" when there is none — and when it does, it says so
 * here rather than letting a guess look like a decision.
 */
export interface SectionRoleReview {
  /** The list it is about: "plans", "members", "stats", "testimonials". */
  list: string;
  /** The two roles that might be the wrong way round. */
  roles: [string, string] | string[];
  /** The field keys those two roles fill, so the sheet can name them. */
  fields: string[];
  why: string;
}

export interface ArionPageSection {
  index: number;
  handle: string | null;
  kind: string | null;
  blueprintId: string | null;
  blockId: string | null;
  editable: boolean;
  reason: SectionLockReason;
  label: string;
  fields: Record<string, any> | null;
  /** The Elementor node. Carried untouched so a save preserves everything. */
  node: any;

  /* ── pack 2b: a section whose list is one CARD per item ──────────── */
  /** Which sub-fields of each list this layout actually has room for. A
      hand-drawn testimonial card has no star rating, so the box for one is
      not offered rather than offered and quietly ignored. null = all of them. */
  itemFields?: Record<string, string[]> | null;
  /** Role assignments the server had to guess at, so the sheet can ask. */
  roleReview?: SectionRoleReview[] | null;

  /* ── Phase 3: adoption ─────────────────────────────────────────────── */
  /** A greyed row we could offer to make editable. */
  adoptable?: boolean;
  adoptReason?: AdoptRefusal | null;
  adoptReasonText?: string | null;
  adoptKind?: string | null;
  adoptKindLabel?: string | null;
  /** Why we think it is that kind, in plain words. */
  adoptWhy?: string | null;
  /** The first words a visitor reads on it — how a person recognises the row. */
  adoptPreview?: string | null;
  adoptConfidence?: number | null;
  adoptConfidenceLabel?: 'high' | 'fair' | 'low' | null;
  /** Proves an adopt acts on the section that was previewed and no other. */
  fingerprint?: string;
  /** The website's own coarse view: is anything on it beyond the editor? */
  pluginAdoptable?: boolean | null;
  /** Set on a row that IS editable because it was adopted. */
  adoption?: SectionAdoption | null;
}

export interface ArionPageDetail {
  pageId: number;
  title: string;
  slug: string;
  status: string;
  permalink: string | null;
  previewUrl: string | null;
  modified: string | null;
  canUndo: boolean;
  undoCount: number;
  sections: ArionPageSection[];
  /** The page-level answer to "how many were built on the site, and how many
      of those could I take charge of?" — what the review entry counts. */
  adoption?: {
    customCount: number;
    adoptableCount: number;
    undoDays: number;
  };
}

/** One editable field, exactly as arion-api lib/websiteBuilder/sectionSchema.js declares it. */
export interface SectionFieldSpec {
  key: string;
  label: string;
  /** text | textarea | link | email | image | choice | rating | icon | list | paragraphs | hidden */
  type: string;
  required?: boolean;
  max?: number;
  min?: number;
  help?: string;
  options?: string[];
  optionLabels?: Array<{ value: string; label: string }>;
  itemLabel?: string;
  item?: SectionFieldSpec[];
  /**
   * Shown but not editable — the value has ONE home elsewhere. Today that is
   * a form's recipient, which lives on the business details so a form can
   * never quietly point at an inbox nobody reads.
   */
  readOnly?: boolean;
  /** Where a read-only value comes from, in the client's words. */
  source?: string;
  /** Required only when this sibling field has something in it (a picture's description). */
  requiredWith?: string;
  /** A button link: offer "Link to your booking page" when the business has one. */
  offersBooking?: boolean;
  /** A wire, not words — never rendered, never sent to ARGUS (an attachment id). */
  notForAi?: boolean;
  /** On a picture field: the sibling key that holds its attachment id. */
  idKey?: string;
  /** On a picture field: the sibling key that holds its description. Absent = decorative. */
  altKey?: string;
}

/** One picture already on the website, as the picker shows it. */
export interface SiteMediaItem {
  attachmentId: number | null;
  url: string;
  thumbnailUrl: string;
  alt: string;
  title: string;
  filename: string;
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  uploadedAt: string | null;
  /**
   * How many rendered sizes WordPress made for this picture. With the
   * attachment id stored on the widget, Elementor turns those into
   * srcset/sizes by itself — which is why the picker hands the id back.
   */
  sizeCount: number;
}

/** One curated-library layout of a section kind, from arion.section_library. */
export interface SectionVariant {
  blueprintId: string;
  label: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface SectionCatalogEntry {
  kind: string;
  label: string;
  blurb: string;
  available: boolean;
  unavailableReason: string | null;
  fields: SectionFieldSpec[];
  /**
   * Curated layouts of this section kind that the editor can look after
   * afterwards. Empty when the library is unreachable, which is a smaller
   * menu rather than a broken one.
   */
  variants: SectionVariant[];
}

/* ── Adoption: "make it editable" (Phase 3, decision W-5) ─────────────────
   Every page on the five sites we already run was built by hand, so every
   section on them reads as "Custom section — built on the site": greyed, in
   position, saved back untouched. Adoption is the offer to change that one
   section at a time — best effort, always previewed, always opt-in, and
   reversible for 30 days from the original bytes arion-api kept.

   Nothing here happens by itself. There is deliberately no "adopt everything":
   the review list is a checklist and each row is ticked on its own. */

/** Why a section built on the site cannot be made editable here. */
export type AdoptRefusal =
  | 'no_match'            // we cannot work out what kind of section it is
  | 'low_confidence'      // we have a guess and are not sure enough to act on it
  | 'would_lose_content'  // it holds something we cannot carry over
  | 'needs_pro'           // it has a form, and this plan has no Elementor Pro
  | 'empty'               // there is nothing on it
  | 'already_ours';       // it is already editable here

/** One thing on the section the editor has no field for. */
export interface AdoptUnmappedWidget {
  widgetType: string;
  /** Plain words: "a video", "a map", "custom code". Never Elementor's name. */
  label: string;
  /** False for decoration — a divider or a space loses nothing when it goes. */
  carriesContent: boolean;
  preview: string;
}

/** A value the client has to supply before the adopted section can be published. */
export interface AdoptNeedsInput {
  /** `image_alt`, or `images[2].alt` for a row inside a list. */
  field: string;
  message: string;
}

/** What one adoption did, as the row's small note shows it. */
export interface SectionAdoption {
  adoptionId: string;
  kind: string | null;
  confidence: number | null;
  adoptedAt: string | null;
  adoptedBy: string | null;
  /** When "Undo adoption" stops being offered. */
  undoUntil: string | null;
  canUndo: boolean;
}

export interface AdoptPreview {
  adoptable: boolean;
  reason?: AdoptRefusal | null;
  reasonText?: string | null;
  kind: string | null;
  kindLabel: string | null;
  why?: string | null;
  confidence: number;
  confidenceLabel: 'high' | 'fair' | 'low';
  warnings?: string[];
  unmapped: AdoptUnmappedWidget[];
  needsInput?: AdoptNeedsInput[];
  fields?: Record<string, any>;
  dropped?: string[];
  /** Proves the section on the site is still the one that was previewed. */
  fingerprint: string;
  /** A whole HTML document: the section now, beside what it would become. */
  html: string | null;
  /** Always false. The preview writes nothing, anywhere. */
  saved: boolean;
}

/* ── "Ask ARGUS to change it" (Phase 1B) ──────────────────────────────────
   Every one of these PROPOSES. Nothing here writes to the website: an
   approved proposal goes out through saveSitePageSections, the same call a
   typed edit makes, carrying its proposalIds so the audit row is stamped
   only once the write has landed. Externally this is always
   "Powered by ARGUS AI" — never a vendor
   (memory: reference_intelligence_layer_terminology). */

/** One field the proposal would change, in the words the edit sheet uses. */
export interface SectionDiffRow {
  field: string;
  label: string;
  kind: 'text' | 'list';
  before: any;
  after: any;
  beforeText: string;
  afterText: string;
}

export interface SectionProposal {
  proposal_id: string;
  scope: 'section';
  kind: string;
  before: Record<string, any>;
  after: Record<string, any>;
  diff: SectionDiffRow[];
  diff_plain: string;
  summary: string;
  /** ARGUS credits this proposal cost. Charged when it was made, not when approved. */
  cost_units: number | null;
  recorded: boolean;
  poweredBy: string;
}

export interface PageProposalEdit {
  index: number;
  kind: string;
  label: string;
  before: Record<string, any>;
  after: Record<string, any>;
  diff: SectionDiffRow[];
}

export interface PageProposalAddition {
  afterIndex: number;
  label: string;
  diff: SectionDiffRow[];
  /** A real, editable section the server built — the Portal never invents Elementor JSON. */
  section: ArionPageSection;
}

export interface PageProposal {
  proposal_id: string;
  scope: 'page';
  edits: PageProposalEdit[];
  additions: PageProposalAddition[];
  skipped: Array<{ field: string; message: string }>;
  diff_plain: string;
  summary: string;
  cost_units: number | null;
  recorded: boolean;
  poweredBy: string;
}

export interface AiPricingAction {
  actionType: string;
  credits: number | null;
  available: boolean;
}

/**
 * ONE price surface (P18). All four builder actions, every number from
 * argus.action_pricing. The AI Builder page used to compute its own from a
 * hand-written coefficient table while the server charged nothing at all.
 */
export interface AiPricing {
  actions: {
    section: AiPricingAction;
    page: AiPricingAction;
    /** Writing one section from scratch. */
    generate: AiPricingAction;
    /** Putting accepted sections on a page. Ships at 0 credits — a ROW, not a word. */
    assemble: AiPricingAction;
  };
  ai: { available: boolean; reason: string | null };
  libraryNote?: string;
  poweredBy: string;
}

export async function listSitePages(p: { baseUrl: string; bearerToken: string; tenantId: string; siteId: string }) {
  return requestJson<{ data: { pages: ArionSitePage[]; pluginVersion: string | null } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages`,
    timeoutMs: 45_000,
  });
}

export async function getSitePageSections(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{ data: ArionPageDetail }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/sections`,
    timeoutMs: 45_000,
  });
}

export async function saveSitePageSections(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
  sections: Array<Pick<ArionPageSection, 'fields' | 'node'>>;
  title?: string; status?: string;
  /** ARGUS suggestions this save is carrying. Stamped applied only if it lands. */
  proposalIds?: string[];
}) {
  return requestJson<{
    data: {
      pageId: number; status: string | null; permalink: string | null; previewUrl: string | null;
      sectionsWritten: number; canUndo: boolean; undoCount: number; cachePurged: boolean;
      proposalsApplied?: number;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'PUT',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/sections`,
    body: { sections: p.sections, title: p.title, status: p.status, proposalIds: p.proposalIds },
    timeoutMs: 90_000,
  });
}

/**
 * Preview: WORDPRESS renders it (D-ARION-B).
 *
 * The answer is a link, not HTML. arion-api used to render the section list to
 * its own approximate HTML and say so — the client saw their words, but not
 * their theme, their fonts or their colours. The plugin now puts the candidate
 * sections on a companion draft, WordPress renders it with the real Elementor,
 * and the link carries a one-hour key so a client with no WordPress account can
 * open it. The page being previewed is not touched: `saved` is false and the
 * screen says so.
 */
export async function previewSitePage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
  sections: Array<Pick<ArionPageSection, 'fields' | 'node'>>; title?: string;
}) {
  return requestJson<{
    data: {
      pageId: number;
      previewUrl: string;
      expiresAt: string | null;
      ttlSeconds: number;
      sectionCount: number;
      saved: boolean;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/preview`,
    body: { sections: p.sections, title: p.title },
    timeoutMs: 45_000,
  });
}

export async function undoSitePage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{
    data: { pageId: number; restoredFrom: string | null; canUndo: boolean; undoCount: number; cachePurged: boolean };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/undo`,
    timeoutMs: 90_000,
  });
}

/* ── Adoption calls (Phase 3) ─────────────────────────────────────────────
   `adoptSectionPreview` writes NOTHING — not to the website, not to our own
   tables — so it is safe to call the moment somebody taps "Make it editable".
   `adoptSection` is the only one that changes anything, and it will not run
   without the fingerprint the preview handed back. */

export async function adoptSectionPreview(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  pageId: number; index: number;
  /** Values the client typed for what the preview asked for. */
  fixes?: Record<string, string>;
}) {
  return requestJson<{ data: AdoptPreview }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/sections/${p.index}/adopt-preview`,
    body: { fixes: p.fixes },
    timeoutMs: 45_000,
  });
}

export async function adoptSection(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  pageId: number; index: number;
  /** From the preview. Without it the call is refused, so nothing can be
      adopted that the client has not looked at. */
  fingerprint: string;
  fixes?: Record<string, string>;
}) {
  return requestJson<{
    data: {
      adoptionId: string;
      pageId: number;
      index: number;
      kind: string;
      handle: string;
      confidence: number;
      section: ArionPageSection;
      undoDays: number;
      sectionsWritten: number;
      cachePurged: boolean;
      undoCount: number;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/sections/${p.index}/adopt`,
    body: { fingerprint: p.fingerprint, fixes: p.fixes },
    timeoutMs: 90_000,
  });
}

export async function undoSectionAdoption(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  pageId: number; adoptionId: string;
}) {
  return requestJson<{
    data: {
      adoptionId: string; pageId: number; index: number;
      restored: boolean; recordUpdated: boolean; cachePurged: boolean; undoCount: number;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}`
        + `/adoptions/${encodeURIComponent(p.adoptionId)}/undo`,
    timeoutMs: 90_000,
  });
}

export async function listSectionAdoptions(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{
    data: {
      adoptions: Array<SectionAdoption & {
        handle: string; sectionIndex: number; status: string; revertedAt: string | null;
      }>;
      undoDays: number;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/adoptions`,
    timeoutMs: 45_000,
  });
}

export async function createSitePage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  title: string; sections: Array<{ kind: string }>;
  /** 'post' composes a BLOG POST in the same editor (ARION pack 2, D-ARION-C). */
  type?: 'page' | 'post';
}) {
  return requestJson<{
    data: {
      pageId: number; title: string; status: string; type?: string;
      permalink: string | null; previewUrl: string | null;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages`,
    body: { title: p.title, sections: p.sections, type: p.type || 'page' },
    timeoutMs: 90_000,
  });
}

export async function buildSiteSection(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  kind: string;
  /** A curated layout of that kind. Omitted means the plain one, filled from the business's details. */
  blueprintId?: string;
}) {
  return requestJson<{ data: { section: ArionPageSection; blueprintId: string | null } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/sections`,
    body: { kind: p.kind, blueprintId: p.blueprintId },
    timeoutMs: 45_000,
  });
}

export async function getSectionLibrary(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{
    data: {
      sections: SectionCatalogEntry[];
      elementorProAvailable: boolean;
      ai: { available: boolean; reason: string | null };
      /**
       * What the website itself says it can draw pages with (D-ARION-E).
       * `active: false` means the editor must show the banner and stop offering
       * Save: a save there would leave the page blank, which is exactly what
       * used to happen behind a green toast. `known: false` means we could not
       * ask — a different fact, and not a reason to stop anybody working.
       *
       * Named for what it does, not for who makes it: no vendor's name reaches
       * a screen a client reads (feedback_no_third_party_product_surface).
       */
      pageEngine: {
        known: boolean;
        active: boolean | null;
        version: string | null;
        addOnActive: boolean | null;
        addOnVersion: string | null;
        addOnSource: 'detected' | 'tier';
        reason: string | null;
      };
      /** The business's own booking page, or '' — what "Link to your booking page" uses. */
      bookingHref: string;
      /** The inbox a form's read-only recipient shows, from the business details. */
      businessEmail: string;
      businessName: string;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/section-library`,
    timeoutMs: 45_000,
  });
}

/**
 * The pictures already on the website, a page at a time.
 * "Where do I get a picture from?" is the most common reason a client opens
 * wp-admin, and the answer should be "one you already have" before it is
 * "upload another one".
 */
export async function listSiteMedia(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  page?: number; perPage?: number; search?: string;
}) {
  const qs = new URLSearchParams();
  if (p.page) qs.set('page', String(p.page));
  if (p.perPage) qs.set('perPage', String(p.perPage));
  if (p.search) qs.set('search', p.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return requestJson<{
    data: {
      items: SiteMediaItem[];
      page: number; perPage: number; total: number; totalPages: number; search: string;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/media${suffix}`,
    timeoutMs: 45_000,
  });
}

/** Describe a picture once, on the picture itself, for every page it is on. */
export async function setSiteMediaAlt(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  attachmentId: number; alt: string;
}) {
  return requestJson<{ data: { attachmentId: number; alt: string } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/media/${p.attachmentId}/alt`,
    body: { alt: p.alt },
  });
}

export async function uploadSiteMedia(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  filename?: string; contentType?: string; dataBase64?: string; url?: string; alt?: string;
}) {
  return requestJson<{ data: { url: string; attachmentId: number | null; alt: string } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/media`,
    body: {
      filename: p.filename, contentType: p.contentType,
      dataBase64: p.dataBase64, url: p.url, alt: p.alt,
    },
    timeoutMs: 120_000,
  });
}

/**
 * Ask ARGUS AI to change ONE section. Returns a proposal — nothing is written.
 * The section travels in the body so the suggestion is made against what the
 * client is looking at, unsaved changes included.
 */
export async function aiEditSection(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
  handle: string; index: number;
  instruction: string;
  section: Pick<ArionPageSection, 'fields' | 'node'>;
}) {
  return requestJson<{ data: SectionProposal }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}`
        + `/sections/${encodeURIComponent(p.handle || 'section')}/ai-edit`,
    body: {
      instruction: p.instruction,
      section: { index: p.index, fields: p.section.fields, node: p.section.node },
    },
    timeoutMs: 90_000,
  });
}

/** Ask ARGUS AI to change the whole page. May also propose new sections. */
export async function aiEditPage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
  instruction: string;
  sections: Array<Pick<ArionPageSection, 'fields' | 'node'>>;
}) {
  return requestJson<{ data: PageProposal }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/ai-edit`,
    body: { instruction: p.instruction, sections: p.sections },
    timeoutMs: 120_000,
  });
}

/** The client said no. No refund — the suggestion was made and paid for. */
export async function discardSiteProposal(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; proposalId: string;
}) {
  return requestJson<{ data: { proposalId: string; status: string } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/proposals/${encodeURIComponent(p.proposalId)}/discard`,
  });
}

/* ── ARION pack 1: the jobs that had no Portal home ────────────────────────
   Page settings, per-page SEO, delete and restore, swap-the-look and the two
   media jobs. Every one of them goes through the plugin on the site token —
   the core-WordPress-REST path they would otherwise use needs an application
   password, which is NULL on all five production sites. */

export interface PageTemplateOption {
  file: string;
  /** Plain words, from arion-api. A theme template we have no words for keeps
      the theme's own label rather than being dropped. */
  label: string;
}

export interface SitePageSettings {
  pageId: number;
  title: string;
  slug: string;
  /**
   * What the address will BECOME when a draft is published. WordPress only makes
   * a slug unique against PUBLISHED pages, so a draft is allowed to hold an
   * address that is already in use and is quietly renamed at publish time — a
   * client's page address changing with nobody telling them. Equal to `slug`
   * when there is nothing to change.
   */
  slugOnPublish: string;
  status: string;
  type: string;
  permalink: string | null;
  template: string;
  templates: PageTemplateOption[];
  parentId: number;
  parents: Array<{ pageId: number; title: string; status: string }>;
  isHomePage: boolean;
  homePageId: number;
  blogPageId: number;
  /** WordPress had to make the address unique, so it is not what was typed. */
  slugAdjusted?: boolean;
  /**
   * A blog post's own four. `null` on a page, so the sheet shows the card
   * only where it means something (ARION pack 2, D-ARION-C).
   */
  postFields: SitePostFields | null;
  changed?: string[];
  cachePurged?: boolean;
}

export interface SitePostFields {
  excerpt: string;
  /** By NAME, because that is what a person types. New ones are created. */
  categories: string[];
  tags: string[];
  featuredImage: { id: number; url: string };
  /** What this website already files posts under, to offer first. */
  allCategories: string[];
}

export interface SitePageSeo {
  pageId: number;
  title: string;
  description: string;
  focusKeyword: string;
  recommended: { title: number; description: number };
  /** False means we stored them and nothing on the site will render them yet. */
  seoPluginActive: boolean;
  seoPluginNote: string | null;
  changed?: string[];
  cachePurged?: boolean;
}

export interface SiteMediaUsage {
  attachmentId: number | null;
  filename: string;
  used: boolean;
  /** False when the scan stopped early. Not permission to delete. */
  complete: boolean;
  places: Array<{
    pageId: number | null; title: string; status: string; type: string; permalink: string | null;
  }>;
  notes: string[];
  canDelete: boolean;
}

export async function getSitePageSettings(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{ data: SitePageSettings }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/settings`,
    timeoutMs: 45_000,
  });
}

export async function saveSitePageSettings(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
  slug?: string; template?: string; parentId?: number; makeHomePage?: boolean;
  excerpt?: string; categories?: string[]; tags?: string[]; featuredImageId?: number;
}) {
  return requestJson<{ data: SitePageSettings }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/settings`,
    body: {
      slug: p.slug, template: p.template, parentId: p.parentId, makeHomePage: p.makeHomePage,
      excerpt: p.excerpt, categories: p.categories, tags: p.tags, featuredImageId: p.featuredImageId,
    },
    timeoutMs: 90_000,
  });
}

/** Into WordPress's own bin, which keeps it for 30 days. */
export async function trashSitePage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{ data: { pageId: number; status: string; title: string; cachePurged: boolean } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/trash`,
    timeoutMs: 90_000,
  });
}

/** Back out of the bin, as a draft — never straight back onto the website. */
export async function restoreSitePage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{
    data: { pageId: number; status: string; title: string; permalink: string | null; cachePurged: boolean };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/restore`,
    timeoutMs: 90_000,
  });
}


/* ══════════════════════════════════════════════════════════════════════════
 * ARION pack 2 — the site itself: menus, brand, header and footer, switches.
 *
 * Everything here was a job that could only be done by signing into
 * WordPress. All of it goes through the plugin on the site token, and the
 * website reads every value back before it answers, so a success here means
 * the site is holding what was asked for.
 * ════════════════════════════════════════════════════════════════════════ */

export interface SiteMenuItem {
  itemId: number;
  title: string;
  /** 'page' | 'post' | 'custom' | a taxonomy. 'custom' is a typed-in link. */
  kind: string;
  objectId: number;
  url: string;
  /** 0 for a top-level entry; otherwise the itemId it sits under. */
  parentItemId: number;
}

export interface SiteMenu {
  menuId: number;
  name: string;
  /** The theme positions this menu is currently in. */
  locations: string[];
  canUndo: boolean;
  items: SiteMenuItem[];
}

export interface SiteMenus {
  menus: SiteMenu[];
  locations: Array<{ location: string; label: string; menuId: number }>;
  addable: Array<{ objectId: number; kind: string; title: string; status: string; url: string }>;
  booking: { url: string; label: string };
  theme: string;
  pluginVersion: string;
  restored?: boolean;
}

/** What the Portal sends back: the WHOLE ordered list, every time. */
export interface SiteMenuItemInput {
  itemId?: number;
  kind: string;
  objectId?: number;
  title?: string;
  url?: string;
  /** Index in THIS list of the entry it sits under, or null for top level. */
  parentIndex?: number | null;
}

export async function getSiteMenus(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{ data: SiteMenus }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/menus`,
    timeoutMs: 45_000,
  });
}

export async function createSiteMenu(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; name: string;
}) {
  return requestJson<{ data: SiteMenus }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/menus`,
    body: { name: p.name },
    timeoutMs: 45_000,
  });
}

export async function saveSiteMenu(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; menuId: number;
  name?: string; items?: SiteMenuItemInput[]; locations?: string[];
}) {
  return requestJson<{ data: SiteMenus }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'PUT',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/menus/${p.menuId}`,
    body: {
      name: p.name,
      locations: p.locations,
      items: p.items?.map((i) => ({
        item_id: i.itemId,
        kind: i.kind,
        object_id: i.objectId,
        title: i.title,
        url: i.url,
        parent_index: i.parentIndex ?? null,
      })),
    },
    timeoutMs: 90_000,
  });
}

export async function undoSiteMenu(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; menuId: number;
}) {
  return requestJson<{ data: SiteMenus }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/menus/${p.menuId}/undo`,
    timeoutMs: 90_000,
  });
}

export interface SiteKitColour { id: string; title: string; color: string }
export interface SiteKitFont { id: string; title: string; fontFamily: string; fontWeight: string }

export interface SiteKit {
  kitId: number;
  colors: SiteKitColour[];
  typography: SiteKitFont[];
  /**
   * What your business identity says your brand is — offered as a starting
   * point, never applied on its own. `hasBrandColour:false` means we have no
   * recorded colour and are NOT going to invent one.
   */
  suggested: {
    hasBrandColour: boolean;
    colors: Array<{ id: string; title: string; color: string }>;
    typography: Array<{ id: string; fontFamily: string; fontWeight: string }>;
  } | null;
  pluginVersion: string;
}

export async function getSiteKit(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{ data: SiteKit }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/site/kit`,
    timeoutMs: 45_000,
  });
}

export async function saveSiteKit(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  colors?: Array<{ id: string; color: string }>;
  typography?: Array<{ id: string; fontFamily: string; fontWeight?: string }>;
}) {
  return requestJson<{ data: SiteKit }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/site/kit`,
    body: { colors: p.colors, typography: p.typography },
    timeoutMs: 90_000,
  });
}

export interface SiteChromeField {
  key: string;
  group: 'header' | 'footer' | string;
  label: string;
  type: 'text' | 'textarea' | 'switch' | 'choice' | 'image' | string;
  /** False means this website's theme does not offer it — `reason` says so. */
  supported: boolean;
  reason: string | null;
  value: string | number | boolean | null;
  options?: string[];
  help?: string;
  imageUrl?: string;
}

export interface SiteChrome {
  theme: string;
  themeFamily: string;
  fields: SiteChromeField[];
  menuLocations: Array<{ location: string; label: string; menuId: number; menuName: string }>;
  booking: { url: string; inHeader: boolean; label: string };
  suggested: {
    businessName: string; tagline: string; footerText: string; logoUrl: string; bookingUrl: string;
  } | null;
  pluginVersion: string;
}

export async function getSiteChrome(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{ data: SiteChrome }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/site/chrome`,
    timeoutMs: 45_000,
  });
}

export async function saveSiteChrome(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  values: Record<string, string | number | boolean>;
}) {
  return requestJson<{ data: SiteChrome }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/site/chrome`,
    body: p.values,
    timeoutMs: 90_000,
  });
}

export interface SiteOptions {
  chat: { enabled: boolean; fallbackUrl: string };
  booking: { url: string; inHeader: boolean; label: string; tierAllows: boolean };
  pluginVersion: string;
}

export async function getSiteOptions(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{ data: SiteOptions }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/site/options`,
    timeoutMs: 45_000,
  });
}

export async function saveSiteOptions(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  chatEnabled?: boolean; chatFallbackUrl?: string; bookingInHeader?: boolean; bookingLabel?: string;
}) {
  const body: Record<string, unknown> = {};
  if (p.chatEnabled !== undefined) body.chatEnabled = p.chatEnabled;
  if (p.chatFallbackUrl !== undefined) body.chatFallbackUrl = p.chatFallbackUrl;
  if (p.bookingInHeader !== undefined) body.bookingInHeader = p.bookingInHeader;
  if (p.bookingLabel !== undefined) body.bookingLabel = p.bookingLabel;
  return requestJson<{ data: SiteOptions }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/site/options`,
    body,
    timeoutMs: 90_000,
  });
}

/** THE ONE PRICE SOURCE: your services and prices, for a pricing section. */
export interface SitePricingCatalogue {
  available: boolean;
  reason: string | null;
  services: Array<{
    offeringId: string; name: string; description: string;
    durationMinutes: number | null; price: string; period: string; features: string[];
  }>;
}

export async function getSitePricingCatalogue(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{ data: SitePricingCatalogue }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pricing-catalogue`,
    timeoutMs: 45_000,
  });
}

export async function getSitePageSeo(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
}) {
  return requestJson<{ data: SitePageSeo }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/seo`,
    timeoutMs: 45_000,
  });
}

export async function saveSitePageSeo(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; pageId: number;
  title?: string; description?: string; focusKeyword?: string;
}) {
  return requestJson<{ data: SitePageSeo }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/pages/${p.pageId}/seo`,
    body: { title: p.title, description: p.description, focusKeyword: p.focusKeyword },
    timeoutMs: 90_000,
  });
}

/**
 * The same words in a different layout (D-ARION-F). Writes nothing: the swapped
 * section reaches the website on the next Save, so Undo covers it.
 */
export async function swapSectionLook(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  kind: string; blueprintId: string; fields: Record<string, any>;
}) {
  return requestJson<{
    data: {
      section: ArionPageSection;
      blueprintId: string;
      /** Fields the new layout had no place for. Named, never lost quietly. */
      dropped: string[];
      warning: string;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/sections/swap`,
    body: { kind: p.kind, blueprintId: p.blueprintId, fields: p.fields },
    timeoutMs: 45_000,
  });
}

/**
 * Swap two roles over on a hand-drawn card — the one tap behind "check this".
 * Writes nothing; the section comes back with the two markers exchanged and
 * reaches the website on the next Save like any other edit.
 */
export async function swapSectionRoles(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
  kind: string; list: string; roles: string[]; node: any;
}) {
  return requestJson<{ data: { section: ArionPageSection; swapped: number } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/sections/roles/swap`,
    body: { kind: p.kind, list: p.list, roles: p.roles, node: p.node },
    timeoutMs: 30_000,
  });
}

/** Where a picture is used — drafts included, because deleting breaks those too. */
export async function getSiteMediaUsage(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; attachmentId: number;
}) {
  return requestJson<{ data: SiteMediaUsage }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/media/${p.attachmentId}/usage`,
    timeoutMs: 60_000,
  });
}

/** Only offered when the usage answer is nowhere; the website re-checks. */
export async function deleteSiteMedia(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; attachmentId: number;
}) {
  return requestJson<{ data: { attachmentId: number; deleted: boolean; filename: string } }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'DELETE',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/media/${p.attachmentId}`,
    timeoutMs: 90_000,
  });
}

/** New file, same picture: every page using it updates at once. */
export async function replaceSiteMedia(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string; attachmentId: number;
  dataBase64?: string; url?: string; alt?: string;
}) {
  return requestJson<{
    data: {
      attachmentId: number; url: string; filename: string;
      width: number | null; height: number | null; bytes: number | null;
      sizeCount: number; usedOn: number; alt: string; cachePurged: boolean; note: string;
    };
  }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    method: 'POST',
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/media/${p.attachmentId}/replace`,
    body: { dataBase64: p.dataBase64, url: p.url, alt: p.alt },
    timeoutMs: 120_000,
  });
}

/**
 * What an AI action costs, read from argus.action_pricing. NEVER hardcode
 * this in the UI: the old AI Builder page does exactly that and the server
 * charges something else (memory: feedback_no_fabricated_catalog).
 */
export async function getSiteAiPricing(p: {
  baseUrl: string; bearerToken: string; tenantId: string; siteId: string;
}) {
  return requestJson<{ data: AiPricing }>({
    baseUrl: p.baseUrl, bearerToken: p.bearerToken, tenantId: p.tenantId,
    path: `/arion/sites/${encodeURIComponent(p.siteId)}/ai-pricing`,
  });
}

// ─── ARGUS pack 1 — the ARION Content & Social Agent's Portal surface ────────
//
// Before this the ARION Agents page was an honest "coming" row: the agent was
// real, tested and merged, and there was no screen for any of it. These are the
// four reads and four writes that page needs.
//
// requestJson does NOT strip a `{ data: … }` envelope (unlike lib/oliverApi.ts),
// so every type here is the envelope and the page reads `.data`. Getting that
// backwards is the double-unwrap bug the no-double-unwrap test exists for.

/** The queue, plus the escalated units kept visibly apart (AC2). */
export interface ArionAgentActivityEnvelope {
  data: AgentActivityPayload & {
    escalated: AgentActivityPayload['rows'];
    meta: AgentActivityPayload['meta'] & { approved_awaiting_publish: number };
  };
}

export async function getArionAgentActivity(params: { baseUrl: string; bearerToken: string; tenantId: string; limit?: number }) {
  const q = params.limit ? `?limit=${params.limit}` : '';
  return requestJson<ArionAgentActivityEnvelope>({ ...params, path: `/arion/agents/activity${q}` });
}

export async function getArionAgentRuns(params: { baseUrl: string; bearerToken: string; tenantId: string; limit?: number }) {
  const q = params.limit ? `?limit=${params.limit}` : '';
  return requestJson<{ data: AgentRunsPayload }>({ ...params, path: `/arion/agents/runs${q}` });
}

export async function getArionAgentSettings(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{ data: AgentSettingsResponse }>({ ...params, path: '/arion/agents/settings' });
}

/**
 * Switch the agent on for this business, set what it costs and how many posts a
 * week it writes.
 *
 * This is the write that did not exist. `arion.content_agent_tenant_config` IS
 * the product — no row, no runs, no cost — and until now nothing in the codebase
 * could create one, so the agent could not be sold to anybody and the 60% margin
 * rule reported "price not set" for every real business.
 */
export async function putArionAgentSettings(params: {
  baseUrl: string; bearerToken: string; tenantId: string;
  patch: Record<string, unknown>;
}) {
  return requestJson<{ data: AgentSettingsResponse }>({
    ...params, path: '/arion/agents/settings', method: 'PUT', body: { content: params.patch },
  });
}

/** "Run it now" — this business only, never the fleet. */
export async function postArionAgentRun(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<{ data: unknown }>({ ...params, path: '/arion/agents/run', method: 'POST', body: {}, timeoutMs: 120_000 });
}

/** Approve, optionally with YOUR wording — which is then what publishes (AC3). */
export async function approveArionDraft(params: {
  baseUrl: string; bearerToken: string; tenantId: string; outputId: string;
  edits?: { title?: string; body_markdown?: string };
}) {
  return requestJson<{ data: unknown }>({
    ...params, path: `/arion/content-agent/queue/${params.outputId}/approve`,
    method: 'POST', body: params.edits || {},
  });
}

/** A rejection with no reason teaches the agent nothing, so the reason is required. */
export async function rejectArionDraft(params: {
  baseUrl: string; bearerToken: string; tenantId: string; outputId: string; reason: string;
}) {
  return requestJson<{ data: unknown }>({
    ...params, path: `/arion/content-agent/queue/${params.outputId}/reject`,
    method: 'POST', body: { reason: params.reason },
  });
}

/** Publishing is a SEPARATE press. Approval never schedules anything (AC8). */
export async function publishArionDraft(params: {
  baseUrl: string; bearerToken: string; tenantId: string; outputId: string;
}) {
  return requestJson<{ data: unknown }>({
    ...params, path: `/arion/content-agent/queue/${params.outputId}/publish`,
    method: 'POST', body: {}, timeoutMs: 60_000,
  });
}

/** What the agent has learned about this business's voice. */
export interface ArionLearnedVoice {
  data: {
    version: number;
    evidence_count: number;
    confidence: number | null;
    formatting: { measured?: Record<string, unknown> | null } | null;
    vocabulary_banned_count: number;
    exemplar_count: number;
    learned_through: string | null;
  } | null;
  meta?: { message?: string };
}

export async function getArionLearnedVoice(params: { baseUrl: string; bearerToken: string; tenantId: string }) {
  return requestJson<ArionLearnedVoice>({ ...params, path: '/arion/content-agent/style' });
}

/** The propose-only code queue. Nothing here is ever applied automatically. */
export interface ArionCodeProposal {
  proposal_id: string;
  run_id: string | null;
  proposal_kind: string;
  target_repo: string | null;
  target_path: string | null;
  diff_text: string | null;
  rationale: string | null;
  risk_note: string | null;
  review_status: string;
  created_at: string;
}

export async function getArionCodeProposals(params: { baseUrl: string; bearerToken: string; tenantId: string; status?: string }) {
  const q = params.status ? `?status=${encodeURIComponent(params.status)}` : '';
  return requestJson<{ data: ArionCodeProposal[]; meta: { total: number; note: string } }>({
    ...params, path: `/arion/content-agent/proposals${q}`,
  });
}

export async function decideArionCodeProposal(params: {
  baseUrl: string; bearerToken: string; tenantId: string; proposalId: string;
  decision: 'approve' | 'reject';
}) {
  return requestJson<{ data: { applied: boolean; note: string } }>({
    ...params, path: `/arion/content-agent/proposals/${params.proposalId}/${params.decision}`,
    method: 'POST', body: {},
  });
}
