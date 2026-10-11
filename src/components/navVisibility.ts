// navVisibility.ts — the feature wall for every product menu and every page.
//
// ONE LIST, ONE ANSWER (Brandon, 11 Oct 2026: "I would think we have a feature
// list and then a subscription tier list and those are synced up").
//
// Until 11 Oct the Portal kept its own tier table: `minTier`, `addon`,
// `addonTier`, `tierProduct` and an `everyTier` note on 187 menu rows, plus 34
// ROUTE_ONLY_RULES for pages with no menu row, judged here against the tier
// and add-ons from /me/entitlements. The APIs kept three more tables of their
// own, and they disagreed (SCOPE_FEATURE_CATALOG_2026-10-11 Appendix A).
//
// Now every feature is one row in platform-api core.features with its
// product, its lowest tier and its add-on, and platform-api decides every row
// for the business and sends it on /me/entitlements as `features[key]`. This
// module only READS that answer. A menu row and a page name their key and
// nothing else; nothing in the Portal states a tier.
//
//   allowed true          -> open
//   allowed false         -> locked; the lock says the catalog's `needs`
//   allowed null          -> undecided: a page view is a READ, so it opens and
//                            logs (a paying business is never locked out by a
//                            hiccup; the API holds any send or spend)
//   availability hidden   -> cut from the product: no menu row, not routable
//   availability coming_soon -> the page's coming-soon treatment (ServiceRouter)
//   no answer at all      -> undecided for every key: open, one log line
//   key not in the answer -> a catalog mismatch: open (a read), logged at error
//
// `merged` stays on the menu rows because it is not a plan question: a merged
// page is folded into another page (Contact 360 into Contacts), so it has no
// menu row of its own but opens from its parent. The catalog has no column
// for "where in the menu", and should not.
//
// NO FOUNDER OVERRIDE, on purpose. Brandon walks the product as a client and
// needs to see exactly what they see. platform-api answers the platform owner
// and agencies as "owned, business" for everything, so the founder's own
// business is open by the answer, not by a bypass here.
import { featuresOf, type EntitlementPayload, type FeatureEntry, type FeatureMap } from "../lib/entitlements";

/** The one piece of menu structure a row may declare (see the header on why it is not in the catalog). */
export interface VisibilityRules {
  /**
   * MERGED into another surface: no nav entry, but the route STILL WORKS
   * (reached from its new parent: "Manage all tags" on Contacts, the
   * Deliverability pill on Senders, "Contact scoring" on Insights). Whether
   * the plan includes it is the catalog's answer, the same as any other page.
   */
  merged?: boolean;
}

export interface VisibilityContext {
  /**
   * platform-api's `features` for the active business (lib/entitlements
   * featuresOf), or null when there is no answer to read: undecided, which
   * opens every page and logs once.
   */
  features: FeatureMap | null | undefined;
  /**
   * The payload's product nodes, used only to tell "the product is off"
   * (ProductGate's notice) from "the plan is below this feature" (the wall).
   */
  products?: Record<string, { owned?: boolean; decided?: boolean }> | null;
}

/** The context every menu and page wall reads, from one /me/entitlements answer. */
export function featureContext(payload: EntitlementPayload | null | undefined): VisibilityContext {
  return { features: featuresOf(payload), products: payload?.products ?? null };
}

export type FeatureState = "open" | "locked" | "coming_soon" | "hidden";

// Undecided answers are logged once per product (and once for "no answer at
// all"), so a 200-row menu does not flood the console on every render; a key
// missing from a present answer is a catalog mismatch and is logged once per key.
const warned = new Set<string>();
function warnOnce(id: string, line: string, level: "error" | "warn" = "warn") {
  if (warned.has(id)) return;
  warned.add(id);
  (level === "error" ? console.error : console.warn)(line);
}

/** The answer's entry for one key, logging the two undecided cases. */
function entryFor(key: string, ctx: VisibilityContext): FeatureEntry | null {
  if (!ctx.features) {
    warnOnce("__no_answer__", "[navVisibility] no feature answer from platform-api for this business; every page opens (undecided allows a read).");
    return null;
  }
  const entry = ctx.features[key];
  if (!entry) {
    warnOnce(`missing:${key}`, `[navVisibility] feature "${key}" is not in the catalog answer (catalog mismatch); opening it as a read.`, "error");
    return null;
  }
  if (entry.allowed === null) {
    warnOnce(`undecided:${entry.product ?? key}`, `[navVisibility] ${entry.product ?? key}: ${entry.reason || "undecided"}; opening its pages (undecided allows a read).`);
  }
  return entry;
}

/** What the answer says about one key, for a page view. */
export function featureState(key: string, ctx: VisibilityContext): FeatureState {
  const entry = entryFor(key, ctx);
  if (!entry) return "open";
  if (entry.availability === "hidden") return "hidden";
  if (entry.allowed === false) return "locked";
  if (entry.availability === "coming_soon") return "coming_soon";
  return "open";
}

/**
 * Does the business's plan include this feature? Only a decided `allowed:
 * false` says no; undecided and a key missing from the answer open (and log).
 * Shared by the menu (isVisible) and the route (isRoutable) so the two can
 * never judge a plan differently.
 */
export function isEntitled(key: string, ctx: VisibilityContext): boolean {
  const entry = entryFor(key, ctx);
  return !entry || entry.allowed !== false;
}

/** Is this feature cut from the product (catalog availability "hidden")? */
export function isHiddenFeature(key: string, ctx: VisibilityContext): boolean {
  return ctx.features?.[key]?.availability === "hidden";
}

/** Is this feature not released yet (catalog availability "coming_soon")? */
export function isComingSoon(key: string, ctx: VisibilityContext): boolean {
  return ctx.features?.[key]?.availability === "coming_soon";
}

/**
 * Should a menu row show, unlocked? Merged rows and hidden features are not
 * menu rows; everything else shows when the plan includes it. (SubNav shows
 * a row the plan does NOT include too, with a lock: show, don't hide.)
 */
export function isVisible(item: { key: string } & VisibilityRules, ctx: VisibilityContext): boolean {
  if (item.merged || isHiddenFeature(item.key, ctx)) return false;
  return isEntitled(item.key, ctx);
}

/**
 * Can this page be OPENED, whatever the menu shows? Merged pages are
 * routable (their parent links to them); a hidden feature and a feature the
 * plan does not include are not.
 */
export function isRoutable(key: string, ctx: VisibilityContext): boolean {
  if (isHiddenFeature(key, ctx)) return false;
  return isEntitled(key, ctx);
}

/**
 * Is this feature refused because its whole PRODUCT is decided off (not in the
 * subscription), rather than because the plan is below it?
 */
export function productOffFor(key: string, ctx: VisibilityContext): boolean {
  const product = ctx.features?.[key]?.product;
  const node = product ? ctx.products?.[product] : null;
  return !!node && node.decided === true && node.owned === false;
}

/**
 * Does the page's "Not in your plan" card show? When the page is not
 * routable — except a page that stays open while its product is off (a
 * product's own plan page, the ARGUS pages that control work under other
 * products: productAccess.gateExemptServiceKey). For those the product gate
 * decides, and it leaves them open so the owner can buy the product back.
 */
export function planWallLocks(key: string, ctx: VisibilityContext, exemptWhenProductOff: boolean): boolean {
  if (isRoutable(key, ctx)) return false;
  if (exemptWhenProductOff && productOffFor(key, ctx)) return false;
  return true;
}

/**
 * What the lock says: the catalog's `needs` ("SPARK Business", "ARION Pro",
 * "ARION Standard or SPARK", "the ARION SEO add-on (Authority)", "the SPARK
 * Leads add-on"). Shared by the menu's lock pill and the "Not in your plan"
 * card so the two never disagree. "a higher plan" only when the answer names
 * nothing (a hidden feature, or no answer).
 */
export function requirementLabel(key: string | null | undefined, ctx: VisibilityContext): string {
  const needs = key ? ctx.features?.[key]?.needs : null;
  return needs && String(needs).trim() ? String(needs) : "a higher plan";
}

/**
 * The small plan badge a menu row may show (SubNav `planBadge`): the
 * catalog's lowest tier for the key, as the menu has always abbreviated it
 * ("S" for Standard, "Pro", "Business"). Read from the answer; null when
 * there is no answer or the row has no tier (every plan of its product).
 */
const PLAN_BADGE: Record<string, string> = { lite: "Lite", standard: "S", pro: "Pro", business: "Business", enterprise: "Enterprise" };
export function planBadgeLabel(key: string | null | undefined, ctx: VisibilityContext): string | null {
  const tier = key ? ctx.features?.[key]?.min_tier : null;
  if (!tier) return null;
  return PLAN_BADGE[String(tier).toLowerCase()] ?? String(tier);
}

/** The plan a row's badge stands for, in words ("the Standard plan"), for its tooltip. */
export function planBadgeTitle(key: string | null | undefined, ctx: VisibilityContext): string | null {
  const tier = key ? ctx.features?.[key]?.min_tier : null;
  if (!tier) return null;
  const t = String(tier).toLowerCase();
  return `Comes with the ${t.charAt(0).toUpperCase()}${t.slice(1)} plan`;
}

/**
 * Tour steps to offer, without the pages the catalog cuts from the product
 * (availability "hidden"). The tours are generated from the menu once, at
 * load, before any answer; this drops the cut pages at run time. A step id is
 * "<product>.<feature key>". No answer cuts nothing.
 */
export function stepsShown<T extends { id: string }>(steps: T[], ctx: VisibilityContext): T[] {
  return steps.filter((s) => !isHiddenFeature(s.id.slice(s.id.indexOf(".") + 1), ctx));
}

/**
 * Is a My Brand row locked because the PRODUCT is not owned? My Brand is
 * owned through ARION OR SPARK (platform-api products.my_brand.owned =
 * arion.owned || spark.owned, matrix 13), so the rows that sit in ARION's menu
 * take the product lock only when BOTH are known to be locked. The tier is the
 * catalog's answer like every other row.
 * null = not known -> open (undecided never locks a paying business out).
 */
export function myBrandLockedOnRail(arionLocked: boolean | null, sparkLocked: boolean | null): boolean {
  return arionLocked === true && sparkLocked === true;
}
