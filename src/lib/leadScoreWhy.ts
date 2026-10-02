/**
 * lib/leadScoreWhy.ts — the one line under a lead's score that says why.
 *
 * Brandon, 2 Oct 2026: "I'd want to understand why leads are hot/warm/cold …
 * lead score 26 - cold reason xyz." The run stores its reasons on the row
 * (lumen.lead.score_reasons_json, a JSON array of short phrases written by
 * LUMEN services/leadgen/scoring.js scoreReasons) and the same facts land on
 * the Activity tab as one sentence. This turns the stored array into the line
 * the Overview shows, and nothing when there is nothing to say.
 */
export function scoreWhyLine(reasonsJson: string | string[] | null | undefined): string | null {
  let reasons: unknown = reasonsJson;
  if (typeof reasons === "string") {
    try { reasons = JSON.parse(reasons); } catch { return null; }
  }
  if (!Array.isArray(reasons)) return null;
  const parts = reasons.map((r) => String(r ?? "").trim()).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return [first, ...parts.slice(1)].join(" · ");
}

/** "local" → "In your area" · "unknown" → "Could not confirm the area" · else null. */
export function localityLine(locality: string | null | undefined): string | null {
  if (locality === "local") return "In your area";
  if (locality === "unknown") return "Could not confirm the area";
  return null;
}
