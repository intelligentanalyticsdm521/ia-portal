// navRoleFilter — what an accountant's nav holds, and where a product's rail
// icon opens. Pure (no React, no hooks), so a node test can run the real rule.
//
// Moved out of AppShell.tsx (2 Oct 2026, independent review of the STELLA
// Dashboard): AppShell filtered the SubNav by the accountant's allowed keys,
// but defaultRouteFor read the UNFILTERED nav. So when STELLA's first nav item
// became the Dashboard (stella_dashboard, not then on the accountant's list),
// the accountant's nav dropped it while the STELLA rail icon still opened it —
// a page that was not in their own menu. The rail target now comes from the
// SAME filtered config the menu is drawn from.
import type { SubNavConfig } from "./SubNav";

// Strip nav items that aren't in allowedServiceKeys, and drop any group that
// becomes empty. Returns the original config when no filter applies (admin
// users / null allowedServiceKeys).
//
// STELLA pack 1, item 6: this runs for STELLA as well as OLIVER now. The server
// list (oliver-api lib/accountantRole.js ACCOUNTANT_SERVICE_KEYS) gained the
// stella_* keys, and applying the filter to only one of the two products would
// have meant an accountant either saw no STELLA nav at all or saw all of it
// including the bank-link settings — neither of which is the answer.
//
// `prefixes` is what makes this safe to point at the SETTINGS hub as well. The
// Settings SubNav mixes PRODUCT settings (stella_settings_bank,
// stella_settings_period_close, oliver_settings_*) with TENANT-level account
// settings that every member of a business is entitled to see whatever their
// product role is (reference_account_settings_not_product_gated). Filtering the
// whole hub against a product allowlist would strip the account settings too;
// filtering nothing would leave an accountant able to reach the bank-link page,
// which the server list deliberately withholds. So only items whose key starts
// with one of `prefixes` are subject to the allowlist, and everything else is
// left exactly as it was.
export function applyRoleNavFilter(
  config: SubNavConfig,
  allowedServiceKeys: string[] | null,
  prefixes: string[] | null = null,
): SubNavConfig {
  if (!allowedServiceKeys) return config;
  const allowSet = new Set(allowedServiceKeys);
  const inScope = (key: string) => !prefixes || prefixes.some((p) => key.startsWith(p));
  const filteredGroups = config.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !inScope(i.key) || allowSet.has(i.key)) }))
    .filter((g) => g.items.length > 0);
  return { ...config, groups: filteredGroups };
}

/** The products whose daily-work nav is role-filtered (AppShell draws the same). */
export const ROLE_FILTERED_PRODUCTS: readonly string[] = ["oliver", "stella"];

/** First-item-wins: a product's rail icon opens the first item of its nav, or null. */
export function firstNavRoute(config: SubNavConfig | null | undefined): string | null {
  if (!config) return null;
  for (const group of config.groups) {
    if (group.items.length > 0) return group.items[0].route;
  }
  return null;
}

/**
 * Where a product's rail icon opens for this person: the first item of the
 * nav THEY see — role-filtered for OLIVER and STELLA, exactly as the menu is.
 */
export function railRouteFor(
  product: string,
  config: SubNavConfig | null | undefined,
  allowedServiceKeys: string[] | null,
): string | null {
  if (!config) return null;
  const seen = ROLE_FILTERED_PRODUCTS.includes(product) ? applyRoleNavFilter(config, allowedServiceKeys) : config;
  return firstNavRoute(seen);
}
