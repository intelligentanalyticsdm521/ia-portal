// planRefusal — one reader for "your plan doesn't include this" from any API.
//
// 2026-10-11 (feature catalog, SCOPE_FEATURE_CATALOG_2026-10-11 §2.4). The
// four APIs refuse a feature the plan does not include with ONE body:
//   403 { error: "feature_not_in_plan", feature, needs, message }
// where `needs` is what to buy in the catalog's words ("SPARK Business") and
// `message` is the sentence ("Not in your plan. This needs SPARK Business.").
// Until every API ships it, the older shapes still arrive:
//   tier_required / tier_upgrade_required / feature_not_available
// with the tier under required_tier / requiredTier / tier_required /
// details.required_tier. Every API client (lumenApi, sparkApi, oliverApi,
// stellaApi, arionApi) reads the body here, so a page shows the API's own
// words and the Portal never fills in a tier of its own (the clients used to
// default a missing tier to "pro").
//
// A held send (503 { error: "subscription_undecided" } from LUMEN,
// "plan_not_confirmed" from arion-api) is NOT a refusal: the plan could not
// be confirmed, nothing was sent, and trying again is right.
// heldSendMessage() gives that sentence.

export interface PlanRefusal {
  type: "tier_gate";
  /** The catalog key the API refused (or the older feature name). */
  feature?: string;
  /** What to buy, in the catalog's words; null/absent when the API named nothing. */
  needs?: string | null;
  /** The API's sentence, when it sent one. */
  message?: string;
  /** The tier an OLDER API named, verbatim; "" when it named none. Never filled in here. */
  tierRequired: string;
  /** The tier an older API said the business has; "" when it named none. */
  currentTier: string;
}

const PLAN_CODES = new Set(["feature_not_in_plan", "tier_required", "tier_upgrade_required", "feature_not_available"]);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The error code of a body: `{ error: "code" }` or `{ error: { code } }`. */
export function errorCodeOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const e = (body as { error?: unknown }).error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") return str((e as { code?: unknown }).code);
  return "";
}

/** A plan refusal read from a 403 body, or null when the body is something else. */
export function planRefusalFromBody(body: unknown): PlanRefusal | null {
  const code = errorCodeOf(body);
  if (!PLAN_CODES.has(code)) return null;
  const b = body as Record<string, unknown>;
  const details = (b.details && typeof b.details === "object" ? b.details : {}) as Record<string, unknown>;
  const needs = str(b.needs).trim() || null;
  const message = str(b.message).trim() || undefined;
  const feature = str(b.feature) || undefined;
  return {
    type: "tier_gate",
    feature,
    needs,
    message,
    tierRequired: str(b.required_tier) || str(b.requiredTier) || str(b.tier_required) || str(details.required_tier),
    currentTier: str(b.current_tier) || str(b.currentTier) || str(details.current_tier),
  };
}

/** Parse a raw response text; null when it is not JSON or not a plan refusal. */
export function planRefusalFromText(text: string): PlanRefusal | null {
  try {
    return planRefusalFromBody(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The sentence a locked card shows: the API's own words, else built from `needs`. */
export function planRefusalSentence(r: Pick<PlanRefusal, "needs" | "message" | "tierRequired">, fallbackNeeds?: string | null): string {
  if (r.message) return r.message;
  const needs = r.needs || fallbackNeeds || (r.tierRequired ? `the ${r.tierRequired.charAt(0).toUpperCase()}${r.tierRequired.slice(1)} plan` : "");
  return needs ? `Not in your plan. This needs ${needs}.` : "Not in your plan.";
}

/** What the "Upgrade to …" label names: the catalog's needs, else the older API's tier word. */
export function planRefusalNeeds(r: Pick<PlanRefusal, "needs" | "tierRequired">): string {
  if (r.needs) return r.needs;
  if (r.tierRequired) return `${r.tierRequired.charAt(0).toUpperCase()}${r.tierRequired.slice(1)}`;
  return "a higher plan";
}

const HELD_CODES = new Set(["subscription_undecided", "plan_not_confirmed"]);

/** A send the API held because the plan could not be confirmed (503 subscription_undecided / plan_not_confirmed). */
export function isHeldSend(status: number, body: unknown): boolean {
  return status === 503 && HELD_CODES.has(errorCodeOf(body));
}

export const HELD_SEND_MESSAGE = "We couldn't confirm your plan just now, so nothing was sent. Try again in a minute.";
