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

/**
 * Where the business is, as the run placed it (2 Oct 2026): LUMEN keeps the
 * address in parts on relevance_json.place (searchOrchestrator placeForLead) —
 * the town, the state, where the address came from and how far it is from the
 * nearest town the search was centred on. The lead row's full_address holds
 * the one clean line.
 */
export interface LeadPlace {
  city: string | null;
  state: string | null;
  source: string | null;
  miles: number | null;
  anchor: string | null;
}

export function parsePlace(json: string | object | null | undefined): LeadPlace | null {
  let v: unknown = json;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const p = (v as Record<string, unknown>).place;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  const miles = typeof o.miles === "number" && Number.isFinite(o.miles) && o.miles >= 0 ? o.miles : null;
  const place = { city: str(o.city), state: str(o.state), source: str(o.source), miles, anchor: str(o.anchor) };
  return place.city || place.state ? place : null;
}

/**
 * "9 miles from Des Moines" · "right next to Des Moines" · null when it
 * was not measured. Distances are town centre to town centre, so a business in
 * the centre town itself gets no distance (the Address field already names it).
 */
export function distanceLine(place: LeadPlace | null): string | null {
  if (!place || place.miles == null || !place.anchor) return null;
  const where = place.anchor.split(",")[0].trim();
  if (!where) return null;
  if (place.miles < 1 && (place.city || "").trim().toLowerCase() === where.toLowerCase()) return null;
  // Town centre to town centre: a different town whose centre is under a mile
  // away is "right next to" the anchor, never "less than a mile from" it (LUMEN
  // locality.js says the same).
  if (place.miles < 1) return `right next to ${where}`;
  const n = Math.round(place.miles);
  return `${n} mile${n === 1 ? "" : "s"} from ${where}`;
}

/** "Ankeny, IA" for the lead list · null when the town is not known. */
export function cityLine(place: LeadPlace | null): string | null {
  if (!place || !place.city) return null;
  return place.state ? `${place.city}, ${place.state}` : place.city;
}

/**
 * Where the address came from, in words, under the Address field. A website
 * is a stranger's claim and is said to be one; a company database is not
 * named (no third-party product names on screen).
 */
export function addressSourceLine(place: LeadPlace | null): string | null {
  if (!place || !place.source) return null;
  if (place.source === "structured_data" || place.source === "model" || place.source === "page_text") return "From their website";
  if (place.source === "hunter" || place.source === "business_record") return "From a business database";
  return null;
}
