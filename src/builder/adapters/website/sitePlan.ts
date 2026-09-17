/**
 * adapters/website/sitePlan.ts — what this business's plan lets them add.
 *
 * D-157 (DECISIONS_QUEUE, 2026-09-17), Brandon: "ARION Lite plan does not get
 * elementor pro so we need to lock down some of those widgets based on their
 * specific plan."
 *
 * ── ONE MECHANISM, AND IT IS THE SERVER'S ─────────────────────────────────
 * Nothing in this file decides what a plan includes. It cannot: the answer is
 * `allowProFor(site, capability)` on the server, which ASKS THE WEBSITE what
 * it is running and only falls back to `arion_tier !== 'lite'` when the site
 * cannot be asked (D-ARION-E, `lib/websiteBuilder/siteCapability.js`). That
 * answer already reaches the Portal, twice, in the reply the builder makes on
 * open:
 *
 *   data.sections[].tier               'free' | 'pro' | 'ia:<product>'
 *   data.sections[].available          false when this plan cannot have it
 *   data.sections[].unavailableReason  the sentence the client reads
 *   data.elementorProAvailable         the same answer, once, for the page
 *
 * So this module READS that reply. A second table of "which widgets are paid"
 * in the Portal would be a second answer to a question the server has already
 * answered, and the first time the two disagreed a client would be locked out
 * of something they pay for — which is exactly the shape of the defect
 * D-ARION-E existed to remove.
 *
 * ── WHAT A LOCK LOOKS LIKE ────────────────────────────────────────────────
 * Never a hidden row. A widget a plan does not carry stays IN the picker,
 * greyed, with the sentence under it — a missing option is indistinguishable
 * from a bug, and a client who cannot see what they would get cannot decide
 * whether they want it.
 *
 * Pure: no React, no fetch, so the test can import it.
 */

import type { SectionCatalogEntry } from "../../../lib/arionApi";

/** The three words a plan answer can be. Same vocabulary as the server's. */
export type WidgetTier = "free" | "pro" | `ia:${string}`;

export interface SitePlan {
  /** What the SITE answered, through the server. Null = we were not told. */
  proAvailable: boolean | null;
  /** kind → the sentence, for every section this plan cannot add. */
  locked: Record<string, string>;
}

/**
 * The plain-words lock, when the server did not send one.
 *
 * It says the PLAN, because that is the only thing the business can act on,
 * and it names no vendor — the client never chose the page engine
 * (`feedback_no_third_party_product_surface`).
 */
export const DEFAULT_LOCK = "Available on ARION Standard and above.";

export const EMPTY_PLAN: SitePlan = { proAvailable: null, locked: {} };

/**
 * Read the plan off the reply the builder already makes on open.
 *
 * Tolerant in one direction only: a catalogue row with no `available` key
 * (an older server) is NOT locked. Refusing on silence would take a section
 * away from a business that pays for it, and the server refuses the write
 * anyway — the same "we could not ask is not there is none" rule
 * siteCapability follows.
 */
export function readSitePlan(data: {
  sections?: Array<Partial<SectionCatalogEntry> & { tier?: string }>;
  elementorProAvailable?: boolean;
} | null | undefined): SitePlan {
  const locked: Record<string, string> = {};
  for (const row of data?.sections || []) {
    if (!row?.kind) continue;
    if (row.available === false) locked[row.kind] = row.unavailableReason || DEFAULT_LOCK;
  }
  return {
    proAvailable: typeof data?.elementorProAvailable === "boolean" ? data.elementorProAvailable : null,
    locked,
  };
}

/** The sentence for one section kind, or null when this plan carries it. */
export function lockFor(plan: SitePlan, kind: string | null | undefined): string | null {
  if (!kind) return null;
  return plan.locked[kind] ?? null;
}

/** Can this business add this section at all? */
export function canAdd(plan: SitePlan, kind: string | null | undefined): boolean {
  return lockFor(plan, kind) === null;
}

/**
 * What the picker shows on a locked row: the widget stays, greyed, and says
 * why. `widgetKind` is the BUILDER's name for it (`site_contact`), which the
 * adapter maps to the section kind it builds.
 */
export function pickerLock(
  plan: SitePlan,
  arionKindOf: (widgetKind: string) => string | null,
  widgetKind: string,
): string | null {
  return lockFor(plan, arionKindOf(widgetKind));
}
