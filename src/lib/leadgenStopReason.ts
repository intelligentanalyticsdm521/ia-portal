/**
 * lib/leadgenStopReason.ts — what the job page says when a lead search stopped
 * early (lumen.search_job.budget_stop_reason).
 *
 * Before 2 Oct 2026 the page knew two reasons and called everything else an
 * "internal budget cap … 10× the requested target". The lead search rewrite's
 * review added stops that have nothing to do with a cap (LUMEN
 * searchOrchestrator.js): the email lookup allowance ran out, the lookup
 * service asked us to slow down, the service that confirms each email stopped
 * answering, or new leads could not be saved. Each gets its own true sentence.
 * Plain words for a small-business owner: no vendor names, no codes.
 *
 * Pure on purpose, so a test can import it.
 */

export interface StopReasonWords {
  /** Follows "Run stopped early — ". */
  title: string;
  body: string;
}

const NOTHING_MORE = "Nothing more was spent once that happened.";

const WORDS: Record<string, StopReasonWords> = {
  hunter_cap: {
    title: "safety limit on email lookups",
    body: "We stopped after looking up emails for 5 times the leads you asked for. This protects you from runaway charges. Narrow your topics or area and try again.",
  },
  hunter_balance: {
    title: "email lookups ran out",
    body: `Our allowance for looking up emails ran out partway through, so we stopped. ${NOTHING_MORE} Try again later.`,
  },
  hunter_rate_limited: {
    title: "the email lookup service was busy",
    body: `The service we use to look up emails asked us to slow down, so we stopped. ${NOTHING_MORE} Try again in a few minutes.`,
  },
  hunter_verifier_balance: {
    title: "email checks ran out",
    body: `Our allowance for confirming emails ran out partway through, so new leads could not be confirmed and we stopped. ${NOTHING_MORE} Try again later.`,
  },
  verifier_unavailable: {
    title: "email checks were not answering",
    body: `The service that confirms each email stopped answering, so new leads could not be confirmed and we stopped. ${NOTHING_MORE} Try again later.`,
  },
  save_failed: {
    title: "new leads could not be saved",
    body: `New leads could not be saved to your inbox, so we stopped. ${NOTHING_MORE} Try again later.`,
  },
};

const WEB_SEARCH_CAP: StopReasonWords = {
  title: "safety limit on web searches",
  body: "We stopped at our safety limit of 10 web searches for each lead you asked for. This protects you from runaway charges. Narrow your topics or area and try again.",
};

const FALLBACK: StopReasonWords = {
  title: "a safety limit",
  body: "We stopped at a safety limit that protects you from runaway charges. Narrow your topics or area and try again.",
};

/** The words for a stop reason; a web-search cap (cse_cap, brave_cap, …) shares one sentence. */
export function stopReasonWords(reason: string | null | undefined): StopReasonWords {
  const r = String(reason || "");
  if (WORDS[r]) return WORDS[r];
  if (/_cap$/.test(r)) return WEB_SEARCH_CAP;
  return FALLBACK;
}
