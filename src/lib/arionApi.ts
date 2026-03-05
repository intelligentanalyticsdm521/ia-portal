export interface ArionSiteSummary {
  siteId: string;
  tenantId: string;
  wpUrl: string;
  status: string;
  hostingerWebsiteId: string | null;
  hostingerPlanId: string | null;
  templateKey: string | null;
  primaryDomain: string | null;
  sslStatus: string | null;
  createdAt: string;
  updatedAt: string;
  packageCode: string | null;
  packagePriceUsd: number | null;
  isEcommerceEnabled: boolean;
  notes: string | null;
  health: {
    siteStatus: string | null;
    sslStatus: string | null;
    pluginUpdatesAvailable: number | null;
    themeUpdatesAvailable: number | null;
    performanceScore: number | null;
    formDeliveryStatus: string | null;
    lastHealthCheckAt: string | null;
  };
  seo: {
    ga4Connected: boolean;
    searchConsoleConnected: boolean;
    bingWebmasterConnected: boolean;
    sitemapDetected: boolean;
    indexedPages: number | null;
    lastCheckedAt: string | null;
  };
  latestSnapshot: {
    snapshotDate: string;
    sessions: number | null;
    users: number | null;
    pageviews: number | null;
    conversions: number | null;
    leads: number | null;
    orders: number | null;
    revenueUsd: number | null;
    sourceSystem: string | null;
  } | null;
  integrationCount: number;
  openRequestCount: number;
}

export interface ArionSiteDashboard {
  tenant: {
    tenantId: string;
    tenantName: string;
    tenantFullName: string | null;
  };
  site: {
    siteId: string;
    tenantId: string;
    wpUrl: string;
    status: string;
    hostingerWebsiteId: string | null;
    hostingerPlanId: string | null;
    templateKey: string | null;
    primaryDomain: string | null;
    sslStatus: string | null;
    createdAt: string;
    updatedAt: string;
    packageCode: string | null;
    packagePriceUsd: number | null;
    isEcommerceEnabled: boolean;
    notes: string | null;
  };
  health: {
    siteHealthId: string;
    wordpressVersion: string | null;
    phpVersion: string | null;
    pluginUpdatesAvailable: number | null;
    themeUpdatesAvailable: number | null;
    sslStatus: string | null;
    siteStatus: string | null;
    lastHealthCheckAt: string | null;
    formDeliveryStatus: string | null;
    lastFormTestAt: string | null;
    performanceScore: number | null;
    lastPerfCheckAt: string | null;
  } | null;
  seo: {
    siteSeoStatusId: string;
    ga4Connected: boolean;
    searchConsoleConnected: boolean;
    bingWebmasterConnected: boolean;
    sitemapDetected: boolean;
    robotsOk: boolean | null;
    indexedPages: number | null;
    lastCheckedAt: string | null;
  } | null;
  presence: {
    sitePresenceId: string;
    businessName: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    googleBusinessProfileUrl: string | null;
    appleBusinessConnectUrl: string | null;
    bingPlacesUrl: string | null;
    googleMapsUrl: string | null;
    appleMapsUrl: string | null;
    bingMapsUrl: string | null;
    mapEmbedUrl: string | null;
  } | null;
  integrations: Array<{
    siteIntegrationId: string;
    providerCode: string;
    integrationAccountId: string | null;
    status: string;
    config: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
  plugins: Array<{
    sitePluginId: string;
    pluginKey: string;
    pluginName: string | null;
    pluginVersion: string | null;
    isRequired: boolean;
    isActive: boolean;
    lastCheckedAt: string | null;
    createdAt: string;
  }>;
  requests: Array<{
    siteRequestId: string;
    requestType: string;
    requestStatus: string;
    requestedByEmail: string | null;
    notes: string | null;
    requestedAt: string;
    closedAt: string | null;
    isTest: boolean;
  }>;
  analytics: {
    latest: {
      snapshotId: string;
      snapshotDate: string;
      sessions: number | null;
      users: number | null;
      pageviews: number | null;
      conversions: number | null;
      leads: number | null;
      orders: number | null;
      revenueUsd: number | null;
      sourceSystem: string | null;
      createdAt: string;
    } | null;
    series: Array<{
      snapshotId: string;
      snapshotDate: string;
      sessions: number | null;
      users: number | null;
      pageviews: number | null;
      conversions: number | null;
      leads: number | null;
      orders: number | null;
      revenueUsd: number | null;
      sourceSystem: string | null;
      createdAt: string;
    }>;
  };
  events: Array<{
    siteEventId: string;
    eventType: string;
    eventStatus: string;
    message: string | null;
    details: unknown;
    jobKey: string | null;
    isTest: boolean;
    createdAt: string;
  }>;
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
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as any).error)
        : `Request failed (${res.status})`;
    throw new ArionApiError(msg, res.status, body);
  }

  return body as T;
}

export async function listArionSites(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
}): Promise<{ sites: ArionSiteSummary[] }> {
  return requestJson<{ sites: ArionSiteSummary[] }>({
    ...params,
    path: '/arion/sites'
  });
}

export async function getArionDashboard(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  siteId: string;
}): Promise<ArionSiteDashboard> {
  return requestJson<ArionSiteDashboard>({
    baseUrl: params.baseUrl,
    bearerToken: params.bearerToken,
    tenantId: params.tenantId,
    path: `/arion/sites/${params.siteId}/dashboard`
  });
}

export async function createArionRequest(params: {
  baseUrl: string;
  bearerToken: string;
  tenantId: string;
  siteId: string;
  requestType: string;
  notes: string;
}): Promise<{ request: unknown }> {
  return requestJson<{ request: unknown }>({
    baseUrl: params.baseUrl,
    bearerToken: params.bearerToken,
    tenantId: params.tenantId,
    path: `/arion/sites/${params.siteId}/requests`,
    method: 'POST',
    body: {
      requestType: params.requestType,
      notes: params.notes
    }
  });
}
