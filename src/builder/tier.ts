/**
 * builder/tier.ts — THREE STATES, THREE SENTENCES, ONE PLACE.
 *
 * Catalogue G.4, and `reference_nav_visibility_semantics` behind it: *"the
 * widget pane shows a widget in one of exactly three states, each with its own
 * sentence: **offered** · **not on this plan** (tier) · **needs a product you
 * don't have** (ownership). A widget is never silently absent."*
 *
 * Before this the two refusals arrived as ONE thing — a `Record<kind, string>`
 * of sentences — so "your website plan does not include this" and "your
 * business does not own this product" were the same bucket at the only surface
 * a client reads. That is the collapse the memory rule forbids by name.
 *
 * ── WHAT DECIDES WHAT ─────────────────────────────────────────────────────
 * Two different questions, and each is answered exactly once:
 *
 *   WHICH GATE applies to a widget is a fact about the WIDGET. A heading is
 *   free on every website on earth; a price table is paid; a product card
 *   needs a catalogue to read. That fact cannot vary by business, so it lives
 *   on the widget definition as `tier` and nowhere else.
 *
 *   WHETHER THIS BUSINESS PASSES that gate is the SERVER's answer, and it
 *   stays the server's: `adapters/website/sitePlan.ts` reads the reply the
 *   builder already makes on open and holds no tier table of its own. A second
 *   table in the Portal would lock a client out of something they pay for the
 *   first time the two disagreed.
 *
 * So `tier` is not a second copy of the plan. It is the reason, which the
 * refusal needs and did not have.
 *
 * Pure: no React, no fetch, so the tests import it directly.
 */

/** The three words a gate can be. `ia:<product>` names the product it needs. */
export type WidgetTier = "free" | "pro" | `ia:${string}`;

/** Which of the three states a row of the pane is in. */
export type WidgetState = "offered" | "plan" | "ownership";

export interface WidgetLock {
  /**
   * WHY it cannot be added. `plan` is the website's design plan; `ownership` is
   * a product this business does not have. Never one word for both.
   */
  reason: Exclude<WidgetState, "offered">;
  /** The sentence the client reads, in plain words, naming no vendor. */
  sentence: string;
  /** The gate this came from, for the data attribute a test can read. */
  tier: WidgetTier;
}

/** Product key → what it is called on a client's screen. */
const PRODUCT_NAMES: Record<string, string> = {
  oliver: "OLIVER",
  spark: "SPARK",
  arion: "ARION",
  stella: "STELLA",
  argus: "ARGUS",
  forge: "FORGE",
};

/** The product an `ia:<product>` gate needs, in the words a client reads. */
export function productOf(tier: WidgetTier | undefined | null): string | null {
  const t = String(tier ?? "");
  if (!t.startsWith("ia:")) return null;
  const key = t.slice(3).trim().toLowerCase();
  if (!key) return null;
  return PRODUCT_NAMES[key] ?? key.toUpperCase();
}

/**
 * THE PLAN SENTENCE — a paid page widget on a plan that does not carry them.
 *
 * It names the PLAN, because that is the only thing the business can act on,
 * and it names no vendor: the client never chose the page engine
 * (`feedback_no_third_party_product_surface`). The word "locked" appears
 * nowhere, here or on any screen.
 */
export const PLAN_SENTENCE = "Not on your website plan. It comes with ARION Standard and above.";

/** THE OWNERSHIP SENTENCE — a widget that reads a product's own data. */
export function ownershipSentence(product: string): string {
  return `Needs ${product}, which this business does not have.`;
}

/**
 * Which state a widget is in for this business, and the sentence for it.
 *
 * @param tier     the widget's own gate, off its definition.
 * @param refused  what the SERVER said about this widget: `true` when it
 *                 cannot be added, a string when the server also sent the
 *                 sentence to say so, `false`/absent when it can.
 *
 * Silence is never a refusal (the `siteCapability` rule): a server that says
 * nothing about a widget locks nothing, because refusing on silence takes a
 * widget away from a business that pays for it.
 */
export function widgetLock(
  tier: WidgetTier | undefined | null,
  refused: boolean | string | null | undefined,
): WidgetLock | null {
  if (refused === false || refused == null || refused === "") return null;
  const gate: WidgetTier = (tier || "free") as WidgetTier;
  const product = productOf(gate);
  const sentence = typeof refused === "string" && refused.trim()
    ? refused.trim()
    : (product ? ownershipSentence(product) : PLAN_SENTENCE);
  return { reason: product ? "ownership" : "plan", sentence, tier: gate };
}

/** The state alone, for a surface that only needs to know which of the three. */
export function widgetState(
  tier: WidgetTier | undefined | null,
  refused: boolean | string | null | undefined,
): WidgetState {
  return widgetLock(tier, refused)?.reason ?? "offered";
}
