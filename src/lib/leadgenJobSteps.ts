/**
 * lib/leadgenJobSteps.ts — the lead search job page's steps, PURE.
 *
 * The run's REAL steps (2 Oct 2026). The bar used to have eight named stops
 * and lit each one as the percentage passed it — "Expanding keywords",
 * "Resolving locations" and "Scoring" lit within seconds of starting while
 * nothing of the kind had run, then "Enriching contacts" sat for ten minutes.
 * Brandon: "I think this may actually just be skipping the previous steps …
 * maybe add some little text for the steps so that people know it's still
 * working." Every stop below is a progress_step the orchestrator writes
 * (LUMEN services/leadgen/searchOrchestrator.js updateProgress).
 *
 * Pure on purpose: the page imports the auth config through its API hook,
 * which reads import.meta.env, so a test cannot import the page; it imports
 * this.
 */

export type JobPhase =
  | "queued"
  | "discovery"
  | "placing"
  | "enriching"
  | "scoring"
  | "complete"
  | "failed";

export const PHASE_ORDER: JobPhase[] = [
  "queued",
  "discovery",
  "placing",
  "enriching",
  "scoring",
  "complete",
];

export const PHASE_LABELS: Record<JobPhase, { label: string; help: string }> = {
  queued:    { label: "Getting ready",        help: "Loading your saved search, your suppression list and the businesses you already have." },
  discovery: { label: "Finding businesses",   help: "Hunter's business records for each city in your area, then the web for your topics." },
  placing:   { label: "Checking each one",    help: "Is it a real business, and is it in your area? Each homepage is read for its phone and its address." },
  enriching: { label: "Finding emails",       help: "A named person and a verified work email from Hunter's records. One credit per business." },
  scoring:   { label: "Scoring and saving",   help: "Each lead is scored on contact, place, record and source, and the reasons are written on it." },
  complete:  { label: "Done",                 help: "Review your leads below." },
  failed:    { label: "Failed",               help: "Something went wrong — see the error above." },
};

/** progress_step (what the orchestrator writes) → the stop on the bar. */
export const STEP_TO_PHASE: Record<string, JobPhase> = {
  starting: "queued",
  loading_filters: "queued",
  checking_cache: "queued",
  discovering: "discovery",
  placing: "placing",
  enriching: "enriching",
  scoring: "scoring",
  persisting: "scoring",
  completed: "complete",
};

/** Something to read while the long steps run — one line every few seconds. */
export const WAITING_LINES: Record<JobPhase, string[]> = {
  queued:    ["Reading your saved search", "Checking what you already have", "Lining up the cities in your radius"],
  discovery: ["Asking Hunter for businesses in each city", "Searching the web for your topics", "Collecting candidates, one city at a time"],
  placing:   ["Making sure everything is bonita", "Reading each homepage for a phone and an address", "Checking the area code", "Setting aside unions, schools and suppliers"],
  enriching: ["Looking up a named person for each business", "Verifying work emails", "Adding expansive researched links", "Spending credits only where there is an email"],
  scoring:   ["Scoring each lead and writing down why", "Buttoning everything up so it's glorious", "Saving your leads to the inbox"],
  complete:  ["Done"],
  failed:    [""],
};

/** "37 of 100 saved so far" — the count that proves the run is moving. */
export function savedSoFarLine(delivered: number | undefined, target: number | undefined): string | null {
  const d = Number(delivered) || 0;
  const t = Number(target) || 0;
  if (!t || d <= 0) return null;
  return `${d} of ${t} saved so far`;
}
