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
export function scoreWhyLine(reasonsJson: string | string[] | null | undefined, omit: string[] = []): string | null {
  let reasons: unknown = reasonsJson;
  if (typeof reasons === "string") {
    try { reasons = JSON.parse(reasons); } catch { return null; }
  }
  if (!Array.isArray(reasons)) return null;
  // `omit`: phrases the Overview already shows elsewhere (the website check's
  // sentence and services, which the run also appends to the stored reasons).
  const skip = new Set(omit.map((o) => String(o ?? "").trim()).filter(Boolean));
  const parts = reasons.map((r) => String(r ?? "").trim()).filter((r) => r && !skip.has(r));
  if (!parts.length) return null;
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return [first, ...parts.slice(1)].join(" · ");
}

/**
 * What the website check found, as stored on the lead (lumen.lead.relevance_json,
 * written by LUMEN services/leadgen/relevanceCheck.js relevanceForLead, 2 Oct
 * 2026): a checked lead carries one plain sentence and the services its website
 * lists; a lead the check could not review says so in words.
 */
export interface LeadRelevance {
  status: "checked" | "not_checked";
  reason: string | null;
  services: string[];
}

export function parseRelevance(json: string | object | null | undefined): LeadRelevance | null {
  let v: unknown = json;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const status = o.status === "checked" ? "checked" : o.status === "not_checked" ? "not_checked" : null;
  if (!status) return null;
  const reason = typeof o.reason === "string" && o.reason.trim() ? o.reason.trim() : null;
  const services = Array.isArray(o.services)
    ? o.services.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];
  return { status, reason, services: status === "checked" ? services : [] };
}

/**
 * The phrases the run appended to score_reasons_json for this check
 * (relevanceCheck.js relevanceReasons) — so the score's one line can leave out
 * what the "About this business" block already says.
 */
export function relevancePhrases(rel: LeadRelevance | null): string[] {
  if (!rel) return [];
  if (rel.status !== "checked") return ["not checked for relevance"];
  const out: string[] = [];
  if (rel.reason) out.push(rel.reason);
  if (rel.services.length) out.push(`offers: ${rel.services.join(", ")}`);
  return out;
}

/** "local" → "In your area" · "unknown" → "Could not confirm the area" · else null. */
export function localityLine(locality: string | null | undefined): string | null {
  if (locality === "local") return "In your area";
  if (locality === "unknown") return "Could not confirm the area";
  return null;
}
