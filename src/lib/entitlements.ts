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
// products, the add-ons, the limits and (since 11 Oct 2026) every catalog
// feature decided for this business — the same document the API gates on. tierRank.ts keeps `tierMeets` for the pure nav
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

/* ══════════════════════════════════════════════════════════════════════════
   The feature catalog answer (scope SCOPE_FEATURE_CATALOG_2026-10-11 §2.3/2.5)
   ══════════════════════════════════════════════════════════════════════════
   ONE list of features (platform-api core.features, seeded from
   db/seed/feature_catalog.json) and ONE answer per business: platform-api
   decides every feature against the subscription and sends it here as
   `features[key]`. The Portal states no tier of its own any more: the menu
   lock, the route wall, the "Not in your plan" card and the coming-soon
   treatment all read this entry.

     allowed true  -> open
     allowed false -> locked; `needs` is what to buy ("SPARK Business")
     allowed null  -> could not tell; a page view is a READ, so it opens and logs
     availability  -> live | coming_soon | hidden (cut from the product)          */

export type FeatureAvailability = 'live' | 'coming_soon' | 'hidden';
export type FeatureKind = 'page' | 'action' | 'job' | 'send' | 'limit';

export interface FeatureEntry {
  allowed: boolean | null;
  /** Plain words: why it is allowed, refused or undecided. */
  reason: string;
  /** What to buy, in a customer's words ("SPARK Business", "the SPARK Leads add-on"); null when allowed. */
  needs: string | null;
  product: string | null;
  min_tier: string | null;
  addon: string | null;
  addon_min_tier?: string | null;
  kind: FeatureKind;
  availability: FeatureAvailability;
}

export type FeatureMap = Record<string, FeatureEntry>;

export interface EntitlementPayload {
  tenant_id: string | null;
  resolved_at: string;
  decided: boolean;
  rule?: { feature: string; spend: string; why?: string };
  rank?: Record<string, number>;
  product_label?: Record<string, string>;
  tenant_tier?: EntitlementNode;
  products: Record<string, EntitlementNode>;
  addons: Record<string, EntitlementNode>;
  limits: Record<string, unknown>;
  /** Every active catalog feature, decided for this business. Absent from an older platform-api. */
  features?: FeatureMap;
  /** The catalog's version (newest row's updated_at), or null. */
  catalog_version?: string | null;
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

/**
 * The catalog answer for this business, or null when there is none to read:
 * no payload, an older platform-api that sends no `features`, or a catalog
 * platform-api could not read (`sources.catalog: "unreadable"`). null means
 * UNDECIDED for every key, which opens a page (a read) and never a spend.
 */
export function featuresOf(payload: EntitlementPayload | null | undefined): FeatureMap | null {
  if (!payload || !payload.features || typeof payload.features !== 'object') return null;
  if (payload.sources && (payload.sources as Record<string, unknown>).catalog === 'unreadable') return null;
  return payload.features;
}

/** One feature's entry from the answer, or null (undecided / not in the answer). */
export function featureOf(payload: EntitlementPayload | null | undefined, key: string): FeatureEntry | null {
  return featuresOf(payload)?.[key] ?? null;
}

/**
 * What a gate may do with one feature, the same rule platform-api exports as
 * featureGate(features, key, intent) and the four APIs enforce:
 *   allowed true                      -> runs
 *   allowed false                     -> refused (the screen names `needs`)
 *   allowed null, or no entry at all  -> a READ or WRITE runs (a paying business
 *                                        is never locked out by a hiccup); a
 *                                        SEND, a cross-product write, a model
 *                                        SPEND or a JOB is held
 * No answer at all (features null) is undecided for every key.
 */
export type FeatureIntent = 'read' | 'write' | 'send' | 'cross_write' | 'spend' | 'job';
const HOLD_WHEN_UNDECIDED: ReadonlySet<string> = new Set(['send', 'cross_write', 'spend', 'job']);

export function featureAllows(
  features: FeatureMap | null | undefined,
  key: string,
  intent: FeatureIntent = 'read',
): boolean {
  const entry = features?.[key];
  if (entry && entry.allowed === false) return false;
  if (entry && entry.allowed === true) return true;
  return !HOLD_WHEN_UNDECIDED.has(intent);
}

/** What to buy for one feature, in the catalog's words ("SPARK Business"); null when nothing is named. */
export function featureNeeds(features: FeatureMap | null | undefined, key: string): string | null {
  const needs = features?.[key]?.needs;
  return needs && String(needs).trim() ? String(needs) : null;
}

/**
 * The keys this business may open: every key the answer does not refuse
 * (allowed true or undecided) whose availability is live. This replaces the
 * hand-written per-product lists AppState used to build (ARION keys, OLIVER
 * keys, HESTIA keys): the catalog answer is the only source.
 */
export function enabledFeatureKeys(features: FeatureMap | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const [key, entry] of Object.entries(features || {})) {
    if (entry && entry.allowed !== false && entry.availability === 'live') out.add(key);
  }
  return out;
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
