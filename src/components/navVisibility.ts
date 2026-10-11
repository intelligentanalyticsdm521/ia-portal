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
 *   seo — ARION SEO add-on (Starter / Essentials / Growth / Authority).
 *         Resolved from the selected ARION site's `seoAddonTier`, which is the
 *         same column arion-api gates its SE Ranking calls on.
 *
 * `leadgen` WAS a member here and is gone (SPARK pack 1, 2026-09-08). It gated
 * the Lead Inbox and Lead sources rows, which hid a SPARK business's OWN leads —
 * a web chat, a text, a missed call, a website form — behind an add-on that is
 * about leads we FIND and sell. The API already masks the purchased ones for a
 * business that has not paid. With no row declaring it, keeping the member would
 * be a gate with nothing behind it.
 */
export type NavAddon = "seo";

/** Customer-facing name of each add-on, for lock tooltips + FeatureLocked. */
export const ADDON_LABELS: Record<NavAddon, string> = {
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
  /**
   * Judge `minTier` against a DIFFERENT entitlement node than the nav's own
   * product. Only "my_brand": My Brand sits in ARION's menu, but its tier is
   * platform-api's derived products.my_brand (max of the ARION tier and
   * "standard" when SPARK is owned), the same answer LUMEN gates on
   * (FEATURE_TIER_MATRIX_FULL.md section 13). Judging it against the ARION tier
   * alone would lock an ARION Lite + SPARK business out of what it pays for.
   */
  tierProduct?: "my_brand";
  /**
   * Documentation, never a lock: WHY this item is in every tier of its
   * product. Rule (Brandon 2026-10-11, "it's by their subscription"): every
   * item in a product menu carries a tier rule or says why it has none, so a
   * missing gate is a decision someone wrote down, not an accident. The test
   * test/nav-tier-every-item.test.mjs reads it.
   */
  everyTier?: string;
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
   * The derived My Brand tier (platform-api products.my_brand), for rules with
   * `tierProduct: "my_brand"`. null/undefined = unresolved -> fail open.
   */
  myBrandTier?: TierKey;
  /**
   * Products we gate (GATED_PRODUCTS). Anything else (FORGE, ARGUS,
   * Settings, Consulting) passes through untouched here: ARGUS has no tiers
   * (it is owned or not, which lib/productAccess answers), and FORGE is
   * gated per build by its forge_<slug> service key.
   */
  gatingActive: boolean;
}

/**
 * Add-ons that resolve WITHOUT a network call.
 *
 * There are none: the SEO add-on needs the tenant's ARION site and is resolved in
 * hooks/useNavAddons. This stays the synchronous baseline that hook starts from,
 * so adding a purchase-resolved add-on later has one obvious home.
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
  return isEntitled(rules, ctx);
}

/**
 * Does the subscription (tier + add-ons) include this surface? The
 * entitlement half of the wall, shared by the menu (isVisible) and the route
 * (isRoutable) so the two can never judge a plan differently. Undecided
 * (null tier / null add-ons) ALLOWS and logs: only a positively-resolved
 * lower tier or missing add-on says no.
 */
export function isEntitled(rules: VisibilityRules | undefined, ctx: VisibilityContext): boolean {
  if (!rules) return true;
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
    const tier = rules.tierProduct === "my_brand" ? (ctx.myBrandTier ?? null) : ctx.tier;
    if (tier == null) warnFailOpen(rules.tierProduct === "my_brand" ? "My Brand tier" : "subscription tier");
    else if (!tierMeets(tier, rules.minTier)) return false;
  }
  return true;
}

/**
 * Can this surface be OPENED, whatever the nav shows?
 *
 * Merged pages are deliberately routable — their parent links to them. Cut
 * pages and unearned tiers/add-ons are not.
 *
 * 2026-10-11: a merged page is routable only if the plan includes it. Before,
 * `merged` returned true before the tier was read, so a Standard SPARK
 * business could open Contact 360 / Health Score / Contact Scoring (Business)
 * by URL, which is exactly the "locked in the menu, open by deep link" hole.
 */
export function isRoutable(rules: VisibilityRules | undefined, ctx: VisibilityContext): boolean {
  if (!rules) return true;
  if (rules.hidden) return false;           // cut from the product
  return isEntitled(rules, ctx);            // merged or not: the plan decides
}

/**
 * Products whose nav is subject to the feature wall.
 *
 * STELLA joined 2026-10-11 (Brandon: "it's by their subscription"). Its menu
 * carries two tier rules today (SQL Editor and IA Insights Intelligence = Pro,
 * FEATURE_TIER_MATRIX_FULL.md sections 6 and 9); everything else is every
 * STELLA tier and says so on the row.
 */
export const GATED_PRODUCTS = ["spark", "oliver", "arion", "stella"] as const;
export type GatedProduct = (typeof GATED_PRODUCTS)[number];

export function isGatedProduct(p: string | undefined): p is GatedProduct {
  return !!p && (GATED_PRODUCTS as readonly string[]).includes(p);
}

/**
 * The product whose feature wall judges a service key's page. Normally the
 * key's own prefix; My Brand pages (my_brand_*) live in ARION's menu, so the
 * route guard judges them where the menu does. Without this a deep link to a
 * locked My Brand page opened as if it were unlocked, because "my" is not a
 * product.
 */
export function wallProductOfServiceKey(serviceKey: string | null | undefined): string {
  const key = String(serviceKey || "").toLowerCase();
  if (key.startsWith("my_brand_")) return "arion";
  return key.split("_")[0];
}

/**
 * Human-readable reason a surface is locked — "OLIVER Standard", "ARION Pro",
 * "the ARION SEO add-on", "the ARION SEO Authority add-on". Shared by the nav
 * lock tooltip and FeatureLocked so the menu and the page never disagree
 * about which plan a surface needs.
 */
export function requirementLabel(
  rules: { minTier?: string; addon?: string; addonTier?: string; tierProduct?: string } | undefined,
  product: string | undefined,
): string {
  if (rules?.tierProduct === "my_brand" && rules.minTier) {
    // My Brand's tier is the higher of the ARION tier and Standard-with-SPARK
    // (section 13), so Standard is reachable two ways and the label says both.
    const t = rules.minTier;
    const word = `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
    return t === "standard" ? "ARION Standard or any SPARK plan" : `ARION ${word}`;
  }
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
