// lib/entitlements.ts — what the Portal reads instead of keeping its own copy
// of the tier table.
//
// SEAMS AUDIT §3 / SEAM-3-A. The browser used to hold THREE copies of one
// table and refresh them with N HTTP calls to the service that owns checkout:
//
//   src/lib/tierRank.ts         the RANK ladder, hand-copied from LUMEN
//   src/config/serviceCatalog.ts  per-feature minimums, hand-copied from
//                               LUMEN's FEATURE_CATALOG (with a comment on the
//                               LUMEN side asking the next person to keep them
//                               in sync BY HAND)
//   src/hooks/useProductTier.ts one GET oliver-api /billing/subscriptions per
//                               product per mount
//
// The screen and the server therefore disagreed, and on 2026-08-17 they did:
// the Portal showed every SPARK Pro feature unlocked while every Pro route
// 403'd, because LUMEN had no OLIVER_API_BASE_URL and the browser did not care.
//
// Now: ONE GET /me/entitlements from platform-api returns the ladder, the
// feature minimums, the products, the add-ons and the limits — the same
// document the API gates on. tierRank.ts keeps `tierMeets` for the pure nav
// tests and takes its ladder from here.
//
// ═══ SEAM-3-B — allow the FEATURE, refuse the SPEND ═════════════════════════
// mayUseFeature() and maySpend() below are a DECLARED COPY of platform-api
// lib/entitlements.js, byte-for-byte the same rule as oliver-api
// lib/entitlementsRule.js, LUMEN src/lib/entitlementsRule.js and arion-api
// lib/entitlementsRule.js. They cannot drift:
// test/fixtures/entitlement-rule-cases.json is byte-identical in all five
// repos, every suite runs every case, and each repo has a mutation test that
// inverts one half and proves the suite goes red.
//
// In a browser the SPEND half rarely applies — the browser cannot spend, only
// ask a server to. It is here anyway so a page never renders "Run this search"
// as ready when the server is going to refuse it, and so the rule reads the
// same in all five places.

export type TierKey = 'lite' | 'standard' | 'pro' | 'business' | 'active' | null;

/** The one ladder. 'active' = paid but the Stripe product name carried no tier
 *  word, treated as Standard so a naming accident never locks a paying
 *  customer out. */
export const RANK: Record<string, number> = {
  lite: 1,
  standard: 2,
  active: 2,
  pro: 3,
  business: 4,
  enterprise: 5,
};

export function rankOf(tier: string | null | undefined): number {
  if (!tier) return 0;
  return RANK[String(tier).toLowerCase()] ?? 0;
}

export function tierMeets(current: string | null | undefined, required: string | null | undefined): boolean {
  return rankOf(current) >= rankOf(required);
}

/** One node of the payload: a product, an add-on, or the tenant-wide tier. */
export interface EntitlementNode {
  owned?: boolean;
  active?: boolean;
  tier?: string | null;
  tier_source?: string;
  source?: string;
  reason?: string;
  decided: boolean;
  [k: string]: unknown;
}

export interface EntitlementPayload {
  tenant_id: string | null;
  resolved_at: string;
  decided: boolean;
  rule?: { feature: string; spend: string; why?: string };
  rank?: Record<string, number>;
  feature_min_tier?: Record<string, { minTier: string; product: string }>;
  product_label?: Record<string, string>;
  tenant_tier?: EntitlementNode;
  products: Record<string, EntitlementNode>;
  addons: Record<string, EntitlementNode>;
  limits: Record<string, unknown>;
  sources?: Record<string, unknown>;
}

/** May this business USE a feature? An entry we could not decide ALLOWS. */
export function mayUseFeature(entry: EntitlementNode | null | undefined, minTier: string | null = null): boolean {
  if (!entry) return true;
  if (entry.decided === false) return true;
  if (minTier) {
    if (!entry.tier) return true;
    return rankOf(entry.tier) >= rankOf(minTier);
  }
  if (typeof entry.active === 'boolean') return entry.active;
  if (typeof entry.owned === 'boolean') return entry.owned;
  return true;
}

/** May this business make us SPEND? An entry we could not decide REFUSES. */
export function maySpend(entry: EntitlementNode | null | undefined, minTier: string | null = null): boolean {
  if (!entry) return false;
  if (entry.decided === false) return false;
  if (minTier) return !!entry.tier && rankOf(entry.tier) >= rankOf(minTier);
  if (typeof entry.active === 'boolean') return entry.active;
  if (typeof entry.owned === 'boolean') return entry.owned;
  return false;
}

export function productOf(payload: EntitlementPayload | null, product: string): EntitlementNode | null {
  return payload?.products?.[String(product || '').toLowerCase()] ?? null;
}

export function addonOf(payload: EntitlementPayload | null, addon: string): EntitlementNode | null {
  return payload?.addons?.[String(addon || '').toLowerCase()] ?? null;
}

/** The tier a product's gate reads. `null` = we do not know, which ALLOWS. */
export function tierOf(payload: EntitlementPayload | null, product: string): TierKey {
  const node = productOf(payload, product);
  if (!node || node.decided === false || !node.tier) return null;
  return String(node.tier).toLowerCase() as TierKey;
}

/** The minimum tier a feature needs, from the payload's table (never a local copy). */
export function featureMinTier(
  payload: EntitlementPayload | null,
  feature: string,
): { minTier: string; product: string } | null {
  const row = payload?.feature_min_tier?.[feature];
  return row ? { minTier: row.minTier, product: row.product } : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   The fetch — ONE per business, cached for a minute, shared by every hook
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE_TTL_MS = 60 * 1000;
type CacheEntry = { at: number; payload: EntitlementPayload };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<EntitlementPayload | null>>();

export function clearEntitlementCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId.toLowerCase());
    inFlight.delete(tenantId.toLowerCase());
  } else {
    cache.clear();
    inFlight.clear();
  }
}

function normalizeBaseUrl(raw: string): string {
  return String(raw || '').replace(/\/+$/, '');
}

export interface FetchEntitlementsParams {
  baseUrl: string;
  token: string;
  tenantId: string;
  fetchImpl?: typeof fetch;
  force?: boolean;
}

/**
 * GET {platform-api}/me/entitlements for the ACTIVE business.
 *
 * Returns null when we could not get an answer, and null means UNDECIDED,
 * which means the same two things everywhere: features open, spending shut.
 * Several hooks mounting at once share ONE request (inFlight), which is the
 * whole reason the old arrangement's N-calls-per-page problem does not come
 * back in a different shape.
 */
export async function fetchEntitlements(
  params: FetchEntitlementsParams,
): Promise<EntitlementPayload | null> {
  const key = String(params.tenantId || '').toLowerCase();
  if (!key || !params.baseUrl || !params.token) return null;

  if (!params.force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const doFetch = params.fetchImpl || fetch;
  const run = (async () => {
    try {
      const res = await doFetch(`${normalizeBaseUrl(params.baseUrl)}/me/entitlements`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'x-tenant-key': params.tenantId,
        },
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as EntitlementPayload;
      // Only a DECIDED answer is cached. An undecided one is re-asked, so a
      // blip costs one slow minute rather than a minute of a locked page.
      if (payload && payload.decided) cache.set(key, { at: Date.now(), payload });
      return payload || null;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}
