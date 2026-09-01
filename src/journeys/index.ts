// journeys/index.ts — the help-system registry.
//
// One journey per product WITH A NAV. FORGE/ARGUS/Consulting joined 2026-09-01:
// leaving them out meant a third of the nav could offer no help at all. Pages
// that are genuinely placeholders say so in their copy rather than being
// padded. STELLA joined 2026-08-14 (Ledger L1 + Unit Economics L2 live).
//
// Everything that helps a user — the Tours menu, engagement alerts, ARGUS
// chat — resolves through here, so there is exactly one place that knows how
// to teach the product.
import { SPARK_JOURNEY } from "./sparkJourney";
import { OLIVER_JOURNEY } from "./oliverJourney";
import { ARION_JOURNEY } from "./arionJourney";
import { STELLA_JOURNEY } from "./stellaJourney";
import { CONSULTING_JOURNEY } from "./consultingJourney";
import { ARGUS_JOURNEY } from "./argusJourney";
import { FORGE_JOURNEY } from "./forgeJourney";
import { SETTINGS_JOURNEY } from "./settingsJourney";
import type { Journey, JourneyProduct, JourneyStep } from "./types";

export * from "./types";
export { SPARK_JOURNEY, OLIVER_JOURNEY, ARION_JOURNEY, STELLA_JOURNEY, CONSULTING_JOURNEY, ARGUS_JOURNEY, FORGE_JOURNEY, SETTINGS_JOURNEY };

export const ALL_JOURNEYS: Journey[] = [
  ARION_JOURNEY, OLIVER_JOURNEY, SPARK_JOURNEY, STELLA_JOURNEY,
  CONSULTING_JOURNEY, ARGUS_JOURNEY, FORGE_JOURNEY, SETTINGS_JOURNEY,
];

export function journeyFor(product: JourneyProduct): Journey | undefined {
  return ALL_JOURNEYS.find((j) => j.product === product);
}

/** Every step across every journey, tagged with its journey. */
export function allJourneySteps(): Array<{ journey: Journey; step: JourneyStep }> {
  return ALL_JOURNEYS.flatMap((journey) => journey.steps.map((step) => ({ journey, step })));
}

/**
 * Keyword search across every journey step — the deterministic engine behind
 * ARGUS answering "how do I create an email list". Scores exact keyword hits
 * highest, then label matches, then a token-overlap fallback so
 * conversational phrasing ("i need to add someone to my crm") still lands.
 *
 * Deterministic and free by design: per KB_intelligence_layer the IL is
 * in-house and never an LLM call. No Claude anywhere in this path.
 */
export function searchJourneySteps(
  query: string,
  limit = 4,
): Array<{ journey: Journey; step: JourneyStep; score: number }> {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const qTokens = q.split(" ").filter((t) => t.length > 2);

  const scored = allJourneySteps().map(({ journey, step }) => {
    let score = 0;
    // Exact keyword phrase — every word of the phrase must appear.
    for (const kw of step.keywords || []) {
      const words = kw.toLowerCase().split(" ").filter(Boolean);
      if (words.every((w) => q.includes(w))) score += 10 + words.length * 2;
    }
    // Label / title match.
    const label = step.label.toLowerCase();
    if (q.includes(label)) score += 8;
    // Token overlap against label + keywords, for looser phrasing.
    if (qTokens.length) {
      const hay = `${label} ${(step.keywords || []).join(" ")}`.toLowerCase();
      const hits = qTokens.filter((t) => hay.includes(t)).length;
      score += hits * 2;
    }
    // Product named in the query is a strong signal.
    if (q.includes(journey.product) || q.includes(journey.productLabel.toLowerCase())) score += 3;
    return { journey, step, score };
  });

  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];
  // Only keep runners-up that are genuinely close to the winner. Without this
  // a query like "create a new email list" drags in "add your first customer"
  // purely on the shared tokens create/new/list, which reads as noise.
  const cutoff = ranked[0].score * 0.4;
  return ranked.filter((s, i) => i === 0 || s.score >= cutoff).slice(0, limit);
}
