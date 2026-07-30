// navVisibility.ts — the SPARK "feature wall".
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
//   hidden  → cut from the client-visible product. Nobody sees it.
//   addon   → only for tenants who bought that add-on.
//   minTier → only at or above that subscription tier.
//
// NOTHING IS DELETED. Every page still exists and still routes; flipping a
// declaration off in SUB_NAV_CONFIGS brings a surface straight back if a real
// client turns out to need it.
//
// NO FOUNDER OVERRIDE, on purpose. Brandon walks the product as a client and
// needs to see exactly what they see — a founder bypass would hide the very
// thing he's checking. Dev walks other tiers with VITE_DEV_TIER instead (see
// useProductTier), which is a real tier change rather than a peek behind it.
import { tierMeets, type TierKey } from "../hooks/useProductTier";

/** Tiers a nav surface can require. Mirrors useProductTier's ranking. */
export type NavTier = "standard" | "pro" | "business";

/** Add-ons sold separately from the subscription tiers. */
export type NavAddon = "leadgen";

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
  /** Requires this subscription tier or higher. */
  minTier?: NavTier;
}

export interface VisibilityContext {
  /** Resolved SPARK/OLIVER/ARION tier, or null when unknown. */
  tier: TierKey;
  /** Add-ons this tenant has actually purchased. */
  addons: NavAddon[];
  /**
   * Products we gate. Anything else (STELLA/FORGE/ARGUS placeholders,
   * Settings, Consulting) passes through untouched — this wall is a SPARK
   * simplification, not a portal-wide policy.
   */
  gatingActive: boolean;
}

/**
 * A tenant's active add-ons.
 *
 * Lead Gen is LOCKED per the map ("Currently LOCKED until the taxonomy is
 * fixed"), so this returns none today. When the add-on entitlement lands, this
 * is the ONE place to wire it — nav and route guard both read from here, so
 * they cannot drift apart.
 */
export function activeAddons(): NavAddon[] {
  return [];
}

/**
 * Should this surface be visible?
 *
 * Order matters: `hidden` beats everything (it's a product decision, not an
 * upsell), then add-on ownership, then tier. An undeclared item is visible —
 * so adding a nav item never silently disappears behind the wall.
 */
export function isVisible(rules: VisibilityRules | undefined, ctx: VisibilityContext): boolean {
  if (!rules) return true;
  if (rules.hidden || rules.merged) return false;  // neither belongs in the menu
  if (!ctx.gatingActive) return true;       // non-gated product: tier/add-on don't apply
  if (rules.addon && !ctx.addons.includes(rules.addon)) return false;
  if (rules.minTier && !tierMeets(ctx.tier, rules.minTier)) return false;
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
