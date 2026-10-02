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
 * The lead search rewrite (2 Oct 2026) added two real steps between the free
 * checks and the email lookup: every business's homepage is read once
 * (reading_websites), then each one is checked to be the kind of business the
 * search was for (checking_fit). Both happen before any credit is spent.
 *
 * Pure on purpose: the page imports the auth config through its API hook,
 * which reads import.meta.env, so a test cannot import the page; it imports
 * this.
 */

export type JobPhase =
  | "queued"
  | "discovery"
  | "placing"
  | "reading"
  | "checking"
  | "enriching"
  | "scoring"
  | "complete"
  | "failed";

export const PHASE_ORDER: JobPhase[] = [
  "queued",
  "discovery",
  "placing",
  "reading",
  "checking",
  "enriching",
  "scoring",
  "complete",
];

export const PHASE_LABELS: Record<JobPhase, { label: string; help: string }> = {
  queued:    { label: "Getting ready",        help: "Loading your saved search, your suppression list and the businesses you already have." },
  discovery: { label: "Finding businesses",   help: "Business records for each city in your area, then the web for your topics." },
  placing:   { label: "Checking each one",    help: "Free checks before anything is spent: is it a real business, is its website live, can it receive email?" },
  reading:   { label: "Reading websites",     help: "Each business's own homepage is read once for its phone, its address and the towns it names. Anything outside your area is set aside." },
  checking:  { label: "Right kind of business", help: "Is it the kind of business you searched for, working in your area? Directories, suppliers, head offices and schools are set aside before any email is looked up." },
  enriching: { label: "Finding emails",       help: "Best matches first: a named person and a verified work email. One credit per business, never more than the leads still needed." },
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
  reading_websites: "reading",
  checking_fit: "checking",
  enriching: "enriching",
  scoring: "scoring",
  persisting: "scoring",
  completed: "complete",
};

/** Something to read while the long steps run — one line every few seconds. */
export const WAITING_LINES: Record<JobPhase, string[]> = {
  queued:    ["Reading your saved search", "Checking what you already have", "Lining up the cities in your radius"],
  discovery: ["Looking up businesses in each city", "Searching the web for your topics", "Collecting candidates, one city at a time"],
  placing:   ["Making sure everything is bonita", "Setting aside unions, schools and suppliers", "Making sure each website is live", "Checking each one can receive email"],
  reading:   ["Reading each business's homepage", "Picking up the phone number and address they publish", "Checking the towns each website names"],
  checking:  ["Making sure each one does the work you searched for", "Setting aside directories, suppliers and head offices", "Checking each one works in your area"],
  enriching: ["Looking up a named person for each business", "Verifying work emails", "Adding expansive researched links", "Starting with the best matches", "Spending credits only where there is an email"],
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
