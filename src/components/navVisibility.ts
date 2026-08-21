// navVisibility.ts — the product "feature wall" (SPARK, OLIVER, ARION).
//
// WHY THIS EXISTS
// ---------------
// SPARK_FEATURE_MAP_SIMPLIFIED.md (2026-07-27) cuts the client-visible product
// from ~39 SPARK nav items to ~7 for Standard, with the rest either gated to a
// paid tier, sold as an add-on, or hidden outright. The map says to do this
// "hide-not-delete, via feature flag (same as the Lead Gen lock)".
//
// That mechanism did not exist. `SubNavItem.gated` renders a padlock ICON and
// filters nothing; there was no feature-flag helper anywhere in the portal, and
// the Lead Gen lock was a deploy-time env var, not a per-tenant capability. So
// this module IS the mechanism, and it is deliberately small:
//
//   hidden    → cut from the client-visible product. Nobody sees it.
//   addon     → only for tenants who bought that add-on.
//   addonTier → only at or above that rung of the add-on ladder (SEO only).
//   minTier   → only at or above that subscription tier.
//
// 2026-08-21 (pricing rework, Brandon): the same declarations now carry the
// OLIVER tier gates (Invoicing = quotes/proposals/invoices/payments/reports
// only — every jobs / scheduling / portal / crew / team surface is Standard+)
// and the ARION SEO add-on gate (every SE Ranking-powered surface requires
// the SEO add-on; Market Monitor additionally requires the Authority rung —
// Phase B1 `addonTier`). See SubNav.tsx for the per-item declarations.
//
// NOTHING IS DELETED. Every page still exists and still routes; flipping a
// declaration off in SUB_NAV_CONFIGS brings a surface straight back if a real
// client turns out to need it.
//
// NO FOUNDER OVERRIDE, on purpose. Brandon walks the product as a client and
// needs to see exactly what they see — a founder bypass would hide the very
// thing he's checking. Dev walks other tiers with VITE_DEV_TIER instead (see
// useProductTier), which is a real tier change rather than a peek behind it.
//
// FAIL OPEN ON "UNKNOWN" (standing rule since the 2026-08-17 incident): a tier
// or add-on we could not resolve — oliver-api down, arion-api down, the
// request still in flight — is NOT a lower tier. Only a POSITIVELY resolved
// lower tier / missing add-on locks a surface. The alternative locked every
// customer out of their own product the moment one API hiccuped.
import { tierMeets, type TierKey } from "../lib/tierRank";

/** Tiers a nav surface can require. Mirrors useProductTier's ranking. */
export type NavTier = "standard" | "pro" | "business";

/**
 * Rungs of the ARION SEO add-on ladder (`arion.site.seo_addon_tier`), lowest
 * first. Mirrors arion-api seoOnboarding TIER_CONFIG / requireSeoAddon.
 */
export type SeoAddonTier = "starter" | "essentials" | "growth" | "authority";
const SEO_ADDON_RANK: Record<SeoAddonTier, number> = {
  starter: 1, essentials: 2, growth: 3, authority: 4,
};

/**
 * Add-ons sold separately from the subscription tiers.
 *   leadgen — SPARK Lead Gen (Lead Inbox).
 *   seo     — ARION SEO add-on (Starter / Essentials / Growth / Authority).
 *             Resolved from the selected ARION site's `seoAddonTier`, which is
 *             the same column arion-api gates its SE Ranking calls on.
 */
export type NavAddon = "leadgen" | "seo";

/** Customer-facing name of each add-on, for lock tooltips + FeatureLocked. */
export const ADDON_LABELS: Record<NavAddon, string> = {
  leadgen: "the Lead Gen add-on",
  seo: "the ARION SEO add-on",
};

/** The visibility declaration a nav item may carry. */
export interface VisibilityRules {
  /**
   * CUT from the client-visible product: no nav entry, and the route is
   * blocked too. For things we decided clients shouldn't see at all (Social
   * Scheduler, Deals, NPS, the extra automation builders).
   */
  hidden?: boolean;
  /**
   * MERGED into another surface: no nav entry, but the route STILL WORKS.
   *
   * This distinction matters and I got it wrong first time. Merged pages are
   * reached from their new parent — "Manage all tags →" on Contacts, the
   * Deliverability pill on Senders, "Templates" on Campaigns, "Contact
   * scoring →" on Insights. Treating them as `hidden` blocked those very
   * links, so every merge shipped a dead end. Merged means "you don't need it
   * in the menu", not "you can't go there".
   */
  merged?: boolean;
  /** Requires a purchased add-on, at any tier. */
  addon?: NavAddon;
  /**
   * Requires this rung of the add-on ladder or higher. Only meaningful with
   * `addon: "seo"` (the one add-on sold as a ladder) — Market Monitor is
   * Authority-only because it runs on SE Ranking page-change monitoring.
   */
  addonTier?: SeoAddonTier;
  /** Requires this subscription tier or higher. */
  minTier?: NavTier;
}

export interface VisibilityContext {
  /** Resolved SPARK/OLIVER/ARION tier, or null when unknown (→ fail open). */
  tier: TierKey;
  /**
   * Add-ons this tenant has actually purchased, or null while unresolved
   * (→ fail open). Produced by hooks/useNavAddons so the nav and the route
   * guard read the same answer.
   */
  addons: NavAddon[] | null;
  /**
   * Rung of the SEO add-on the selected ARION site is on (its
   * `seoAddonTier`), or null/undefined when unresolved (→ fail open). Only
   * consulted once `addons` says the SEO add-on is owned; a resolved LOWER
   * rung is the only thing that locks an `addonTier` surface.
   */
  seoAddonTier: string | null | undefined;
  /**
   * Products we gate. Anything else (STELLA/FORGE/ARGUS placeholders,
   * Settings, Consulting) passes through untouched — this wall is a
   * product-tier simplification, not a portal-wide policy.
   */
  gatingActive: boolean;
}

/**
 * Add-ons that resolve WITHOUT a network call.
 *
 * Lead Gen is LOCKED per the map ("Currently LOCKED until the taxonomy is
 * fixed"), so this never includes it. The SEO add-on needs the tenant's ARION
 * site and is resolved in hooks/useNavAddons — this stays the synchronous
 * baseline that hook starts from.
 */
export function activeAddons(): NavAddon[] {
  return [];
}

// Fail-open events are logged once per rule so a 200-row nav doesn't flood
// the console on every render while an API is down.
const warned = new Set<string>();
function warnFailOpen(what: string) {
  if (warned.has(what)) return;
  warned.add(what);
  console.error(`[navVisibility] ${what} is unresolved — allowing access (fail open). Only a positively-resolved lower tier / missing add-on locks a surface.`);
}

/**
 * Should this surface be visible?
 *
 * Order matters: `hidden` beats everything (it's a product decision, not an
 * upsell), then add-on ownership, then the add-on rung, then tier. An
 * undeclared item is visible — so adding a nav item never silently
 * disappears behind the wall.
 */
export function isVisible(rules: VisibilityRules | undefined, ctx: VisibilityContext): boolean {
  if (!rules) return true;
  if (rules.hidden || rules.merged) return false;  // neither belongs in the menu
  if (!ctx.gatingActive) return true;       // non-gated product: tier/add-on don't apply
  if (rules.addon) {
    if (ctx.addons == null) warnFailOpen(`add-on "${rules.addon}"`);
    else if (!ctx.addons.includes(rules.addon)) return false;
    else if (rules.addonTier && rules.addon === "seo") {
      // Owned — now the rung. An unknown/unrecognised rung is unresolved, not
      // "below": only a positively-resolved lower rung locks the surface.
      const have = SEO_ADDON_RANK[String(ctx.seoAddonTier ?? "").toLowerCase() as SeoAddonTier];
      if (have == null) warnFailOpen(`add-on "seo" tier`);
      else if (have < SEO_ADDON_RANK[rules.addonTier]) return false;
    }
  }
  if (rules.minTier) {
    if (ctx.tier == null) warnFailOpen("subscription tier");
    else if (!tierMeets(ctx.tier, rules.minTier)) return false;
  }
  return true;
}

/**
 * Can this surface be OPENED, whatever the nav shows?
 *
 * Merged pages are deliberately routable — their parent links to them. Cut
 * pages and unearned tiers/add-ons are not.
 */
export function isRoutable(rules: VisibilityRules | undefined, ctx: VisibilityContext): boolean {
  if (!rules) return true;
  if (rules.merged) return true;            // reached from its new home
  return isVisible(rules, ctx);
}

/** Products whose nav is subject to the feature wall. */
export const GATED_PRODUCTS = ["spark", "oliver", "arion"] as const;
export type GatedProduct = (typeof GATED_PRODUCTS)[number];

export function isGatedProduct(p: string | undefined): p is GatedProduct {
  return !!p && (GATED_PRODUCTS as readonly string[]).includes(p);
}

/**
 * Human-readable reason a surface is locked — "OLIVER Standard", "ARION Pro",
 * "the ARION SEO add-on", "the ARION SEO Authority add-on". Shared by the nav
 * lock tooltip and FeatureLocked so the menu and the page never disagree
 * about which plan a surface needs.
 */
export function requirementLabel(
  rules: { minTier?: string; addon?: string; addonTier?: string } | undefined,
  product: string | undefined,
): string {
  if (rules?.addon === "seo" && rules.addonTier) {
    const t = rules.addonTier;
    return `the ARION SEO ${t.charAt(0).toUpperCase()}${t.slice(1)} add-on`;
  }
  if (rules?.addon && rules.addon in ADDON_LABELS) return ADDON_LABELS[rules.addon as NavAddon];
  if (rules?.minTier) {
    const t = rules.minTier;
    const brand = (product || "spark").toUpperCase();
    return `${brand} ${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  }
  return "a higher plan";
}
