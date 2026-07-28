// journeys/index.ts — the help-system registry.
//
// One journey per client-facing product. STELLA isn't built, FORGE/ARGUS are
// thin, and Consulting is founder-facing — so those don't get a curriculum
// rather than getting a padded one.
//
// Everything that helps a user — the Tours menu, engagement alerts, ARGUS
// chat — resolves through here, so there is exactly one place that knows how
// to teach the product.
import { SPARK_JOURNEY } from "./sparkJourney";
import { OLIVER_JOURNEY } from "./oliverJourney";
import { ARION_JOURNEY } from "./arionJourney";
import type { Journey, JourneyProduct, JourneyStep } from "./types";

export * from "./types";
export { SPARK_JOURNEY, OLIVER_JOURNEY, ARION_JOURNEY };

export const ALL_JOURNEYS: Journey[] = [ARION_JOURNEY, OLIVER_JOURNEY, SPARK_JOURNEY];

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

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
