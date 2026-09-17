/**
 * builder/adapters/website/siteCatalogue.ts — PRODUCTS & SERVICES, ON A PAGE.
 *
 * Brandon, 2026-09-16: *"I need to be able to call products and services."*
 *
 * D-23 of BUILDER_USER_TEST_2026-09-16: the website's "What you do" section did
 * not. Its inspector said **"SERVICES — typed on the page"**, and the three
 * cards it arrived with had been copied off the fixture's own content ("Garden
 * offices", "Studios and workshops") with the filler line *"What it is and why
 * somebody would want it."* The proposal's pricing table and property block had
 * the picker; the two website sections about what a business sells did not.
 *
 * ── ONE CATALOGUE, ONE CALL ───────────────────────────────────────────────
 * The source is arion-api's `GET /pricing-catalogue`, which already existed for
 * the pricing section's "Use my current prices" and reads the same OLIVER
 * catalogue the booking page and the invoices read. Nothing here fetches; this
 * is the shaping, and it is pure so "what does a picked service become" is a
 * test rather than a click.
 */

/** What the price list can offer, and why it cannot when it cannot. */
export interface SiteCatalogue {
  available: boolean;
  /** 'no_service_catalogue' when this business does not keep prices with us. */
  reason: string | null;
  services: SiteCatalogueService[];
}

export interface SiteCatalogueService {
  offeringId: string;
  name: string;
  description: string;
  price: string;
  /** The catalogue's OWN word for how it is billed. Never one we chose. */
  period: string;
  features: string[];
}

export const EMPTY_SITE_CATALOGUE: SiteCatalogue = { available: false, reason: null, services: [] };

/** Which website sections can be filled from the price list. */
export function takesCatalogue(kind: string): boolean {
  return kind === "services" || kind === "pricing";
}

/** The picker's heading, written for the section it is sitting in. */
export function catalogueHeading(kind: string): string {
  return kind === "pricing"
    ? "Add a package from your price list"
    : "Add a service from your price list";
}

/**
 * One row of the price list, shaped for the list it is being added to.
 *
 * `services` and `pricing` are two views of the same record, so they are filled
 * from it HERE rather than by two callers that can disagree about which column
 * is the price. The CADENCE is carried verbatim: a per-push tier printing
 * "billed monthly" is D-09 on a signed contract, and the same rule holds on a
 * web page.
 *
 * Returns null for a kind that does not take one, so a caller cannot quietly
 * put a package into a section that has no packages.
 */
export function catalogueRowFor(
  kind: string,
  s: SiteCatalogueService,
  cta: { text: string; href: string },
): Record<string, unknown> | null {
  if (kind === "services") {
    return { title: s.name, description: s.description || "", icon_name: "check" };
  }
  if (kind === "pricing") {
    return {
      name: s.name,
      price: s.price || "",
      period: s.period || "",
      summary: s.description || "",
      features: Array.isArray(s.features) ? s.features : [],
      cta_text: cta.text,
      cta_href: cta.href,
      // Which service in the price list this card came from, so a price that
      // changes there can be found here.
      offering_id: s.offeringId || "",
    };
  }
  return null;
}

/** arion-api's `/pricing-catalogue` payload, read tolerantly. */
export function readSiteCatalogue(payload: unknown): SiteCatalogue {
  const d = payload as { available?: unknown; reason?: unknown; services?: unknown } | null;
  if (!d || typeof d !== "object") return EMPTY_SITE_CATALOGUE;
  const rows = Array.isArray(d.services) ? d.services : [];
  return {
    available: !!d.available,
    reason: typeof d.reason === "string" ? d.reason : null,
    services: rows.map((raw) => {
      const s = raw as Record<string, unknown>;
      return {
        offeringId: String(s?.offeringId ?? ""),
        name: String(s?.name ?? ""),
        description: String(s?.description ?? ""),
        price: String(s?.price ?? ""),
        period: String(s?.period ?? ""),
        features: Array.isArray(s?.features) ? (s.features as unknown[]).map(String) : [],
      };
    }).filter((s) => s.name),
  };
}
