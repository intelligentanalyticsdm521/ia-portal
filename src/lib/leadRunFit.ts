/**
 * lib/leadRunFit.ts — the Lead Inbox run banner's words for the website check.
 *
 * The lead search rewrite (Brandon, 2 Oct 2026: "Hunter emails are our huge
 * cost here and we need to make sure we send only the ones we really want to
 * verify through"). Before an email is looked up, each business's website is
 * checked: is it the kind of business the search was for, working in the area?
 * The run summary (LUMEN searchOrchestrator.js) counts what that set aside:
 *   skipped.not_relevant      not the kind of business searched for
 *   skipped.relevance_unsure  the website did not say enough to confirm it as a fit
 *   delivered_not_checked     saved, but the check could not be run for it
 * Neither of the first two is delivered or billed. Plain counts only; no codes.
 * A business that does the right work but serves somewhere else is NOT in
 * not_relevant: LUMEN counts it under skipped.out_of_area, which the banner
 * already reads as "outside your area" (2 Oct 2026 review).
 *
 * Pure on purpose, so a test can import it (the page reads import.meta.env).
 */

export interface RunFitCounts {
  skipped?: { not_relevant?: number; relevance_unsure?: number } | null;
  delivered_not_checked?: number | null;
}

const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/** The banner's "Skipped:" phrases for the website check, in order; none when zero. */
export function fitSkipPhrases(summary: RunFitCounts | null | undefined): string[] {
  const out: string[] = [];
  const notRelevant = n(summary?.skipped?.not_relevant);
  const unsure = n(summary?.skipped?.relevance_unsure);
  if (notRelevant) out.push(`${notRelevant} not the kind of business you searched for`);
  // "as a fit" — never read as an email that could not be confirmed.
  if (unsure) out.push(`${unsure} could not be confirmed as a fit`);
  return out;
}

/** How many of the run's skips the website check accounts for (for the banner's "anything skipped?" test). */
export function fitSkipCount(summary: RunFitCounts | null | undefined): number {
  return n(summary?.skipped?.not_relevant) + n(summary?.skipped?.relevance_unsure);
}

/** "2 leads not checked: …" — only when the check could not be run for some of the saved leads. */
export function notCheckedLine(summary: RunFitCounts | null | undefined): string | null {
  const c = n(summary?.delivered_not_checked);
  if (!c) return null;
  return `${c} ${c === 1 ? "lead" : "leads"} not checked: the website could not be reviewed, so ${c === 1 ? "it was" : "they were"} saved on the other checks alone.`;
}
