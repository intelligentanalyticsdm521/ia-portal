/**
 * builder/adapters/email/emailCatalogue.ts — WHICH PRICES AN EMAIL OFFERS.
 *
 * D-38 of BUILDER_USER_TEST_2026-09-16: *"the same product offers different
 * prices in different builders. Add Snow Removal in the proposal pricing table,
 * then in a newsletter … Proposal offers all six push tiers; email offers only
 * 'Single visit · $525.00'."*
 *
 * The email picked the DEFAULT price and listed one row per service, so a
 * business with per-inch snow pricing could put one of its six rates in a
 * newsletter and had to type the others by hand — which is how a price in an
 * inbox comes to disagree with the price on a contract.
 *
 * The READER is shared already: `buildPick` in ProposalCatalogPicker knows that
 * `unit_amount` is dollars, that a price's own label is what distinguishes the
 * tiers of one service, and what the catalogue's word for the billing basis is.
 * What differed was only WHICH prices got handed to it, and that answer lives
 * here, pure, so it is a test rather than a screen you have to compare.
 */
import type { CatalogOffering, CatalogPrice } from "../../../components/oliver/ProposalCatalogPicker";

export interface CatalogueTier {
  offering: CatalogOffering;
  /** null only when the service carries no catalogue price at all. */
  price: CatalogPrice | null;
}

/**
 * EVERY TIER OF EVERY SERVICE, in the catalogue's own order.
 *
 * The default price comes first within a service, because it is the one the
 * business marked; the rest follow in the order the catalogue holds them.
 * Nothing is invented and nothing is hidden — a service with no prices at all
 * is still offered once, with `null`, which `buildPick` reads as "no price to
 * inherit" rather than as $0.
 */
export function catalogueTiers(offerings: CatalogOffering[]): CatalogueTier[] {
  const out: CatalogueTier[] = [];
  for (const offering of offerings || []) {
    const list = Array.isArray(offering.prices) ? offering.prices : [];
    if (!list.length) { out.push({ offering, price: null }); continue; }
    const ordered = [...list.filter((x) => x.is_default), ...list.filter((x) => !x.is_default)];
    for (const price of ordered) out.push({ offering, price });
  }
  return out;
}
