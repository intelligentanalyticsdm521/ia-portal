// useNavAddons — which add-ons the current tenant owns, for the feature wall.
//
// navVisibility.ts declares `addon: "leadgen" | "seo"` on nav items; this is
// the ONE place those keys are resolved, so the SubNav lock and the
// ServiceRouter route guard can never disagree.
//
//   leadgen — SPARK Lead Gen. LOCKED product-wide (see navVisibility
//             activeAddons); resolves synchronously to "not owned".
//   seo     — ARION SEO add-on (Starter / Essentials / Growth / Authority).
//             Pricing rework 2026-08-21 (Brandon): every SE Ranking-powered
//             surface — SEO Overview / Keywords / Rankings / Site Audit /
//             Competitors / AI Search Results / AI Prompts / Market Monitor —
//             is sold ONLY through the SEO add-on, never through a base tier.
//             The add-on lives on the ARION site (`arion.site.seo_addon_tier`,
//             surfaced as `seoAddonTier` on /arion/sites) — the same column
//             arion-api guards its SE Ranking client on — so that is what we
//             read. We follow the ARION site picker (?siteId, then the
//             per-tenant localStorage slot useArionContext writes, then the
//             first site) so a multi-site tenant sees the lock for the site
//             they are looking at.
//
// Returns `null` while the answer is unknown (request in flight, arion-api
// unreachable). navVisibility treats null as "fail open": an unresolved
// add-on never locks anything — only a positively-resolved "not owned" does.
// Standing rule since the 2026-08-17 incident.
//
// Only fetches when asked about ARION, so SPARK/OLIVER navs cost nothing.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../app/AppState";
import { useAccessToken } from "../auth/useAccessToken";
import { listArionSites, type ArionSiteSummary } from "../lib/arionApi";
import { getViewAsTenantId, subscribeViewAsTenant } from "../lib/viewAsTenant";
import { activeAddons, type GatedProduct, type NavAddon } from "../components/navVisibility";

const ARION_API_BASE_URL = import.meta.env.VITE_ARION_API_BASE_URL as string | undefined;

interface SitesState {
  /** Tenant (+ view-as target) the sites were loaded for — stale answers are ignored. */
  scope: string;
  /** null = the fetch failed → unresolved. */
  sites: ArionSiteSummary[] | null;
}

// SubNav and ServiceRouter both ask on every ARION page, and useArionContext
// loads the same list for the page itself — share ONE request per scope for
// a short while instead of three. Only successes are cached (a failure must
// be retried, not remembered), and the TTL keeps the nav honest after an
// add-on purchase (which round-trips through Stripe Checkout anyway).
const SITES_TTL_MS = 60_000;
const sitesCache = new Map<string, { at: number; sites: ArionSiteSummary[] }>();
const sitesInFlight = new Map<string, Promise<ArionSiteSummary[]>>();

function loadSites(scope: string, load: () => Promise<ArionSiteSummary[]>): Promise<ArionSiteSummary[]> {
  const hit = sitesCache.get(scope);
  if (hit && Date.now() - hit.at < SITES_TTL_MS) return Promise.resolve(hit.sites);
  const pending = sitesInFlight.get(scope);
  if (pending) return pending;
  const p = load()
    .then((sites) => { sitesCache.set(scope, { at: Date.now(), sites }); return sites; })
    .finally(() => { sitesInFlight.delete(scope); });
  sitesInFlight.set(scope, p);
  return p;
}

export function useNavAddons(product: GatedProduct | undefined): NavAddon[] | null {
  const appState = useAppState();
  const { activeTenantId } = appState;
  const { getToken } = useAccessToken();
  const [searchParams] = useSearchParams();
  const urlSiteId = searchParams.get("siteId");

  // View-as changes the EFFECTIVE tenant without touching activeTenantId
  // (the API clients inject the header themselves), so track it here to
  // refetch and to keep the founder bypass from leaking into a client view.
  const [viewAsTenantId, setViewAsTenantId] = useState<string | null>(() => getViewAsTenantId());
  useEffect(() => subscribeViewAsTenant(() => setViewAsTenantId(getViewAsTenantId())), []);

  const wantsArion = product === "arion";
  const scope = `${(activeTenantId || "").toLowerCase()}|${(viewAsTenantId || "").toLowerCase()}`;

  // Same platform-owner bypass as useProductTier: the agency's own tenant
  // owns the top of every product (OWNER_DEFAULTS arion addon = authority).
  // Scoped to the founder's OWN tenant and NOT in view-as, so a client view
  // never inherits it.
  const isFounder = !!appState.bootstrap?.user?.isFounder;
  const home = appState.bootstrap?.homeTenantId;
  const inOwnTenant =
    isFounder && !viewAsTenantId && !!activeTenantId && !!home &&
    String(activeTenantId).toLowerCase() === String(home).toLowerCase();

  const [state, setState] = useState<SitesState | null>(null);

  useEffect(() => {
    if (!wantsArion || !activeTenantId || inOwnTenant) return;
    if (!ARION_API_BASE_URL) {
      console.error("[useNavAddons] VITE_ARION_API_BASE_URL is not configured — SEO add-on unresolved (fail open).");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sites = await loadSites(scope, async () => {
          const t = await getToken();
          const r = await listArionSites({ baseUrl: ARION_API_BASE_URL, bearerToken: t.accessToken, tenantId: activeTenantId });
          return r.sites || [];
        });
        if (!cancelled) setState({ scope, sites });
      } catch (e) {
        console.error("[useNavAddons] could not load ARION sites — SEO add-on unresolved (fail open).", e);
        if (!cancelled) setState({ scope, sites: null });
      }
    })();
    return () => { cancelled = true; };
  }, [wantsArion, activeTenantId, inOwnTenant, scope, getToken]);

  return useMemo<NavAddon[] | null>(() => {
    const base = activeAddons();
    if (!wantsArion) return base;
    if (inOwnTenant) return [...base, "seo"];
    if (!state || state.scope !== scope || state.sites == null) return null; // unresolved

    // Mirror useArionContext's site selection exactly.
    const effectiveTenant = (viewAsTenantId || activeTenantId || "").toLowerCase();
    let stored: string | null = null;
    try { stored = effectiveTenant ? localStorage.getItem(`arion.activeSiteId.${effectiveTenant}`) : null; } catch { /* private mode */ }
    const want = (urlSiteId || stored || "").toLowerCase();
    const site =
      state.sites.find((s) => (s.siteId || "").toLowerCase() === want) || state.sites[0] || null;
    return site?.seoAddonTier != null ? [...base, "seo"] : base;
  }, [wantsArion, inOwnTenant, state, scope, viewAsTenantId, activeTenantId, urlSiteId]);
}
