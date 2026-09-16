// scheduledDelivery — what "Run it now" says, and who a schedule emails.
//
// PRE-WALK 1b, 2026-09-16, walk row S8: "Run now says how many messages were
// queued, suppressed or held (not a note saying email would work if
// configured)."
//
// Three things were wrong, all on this page and none of them on the server:
//
//  1. Run it now printed the literal word **undefined**:
//       showNotice(`Ran now — ${r.row_count} rows into ${r.file_name}. ${r.note}`)
//     `note` was DELETED from the response when the tally replaced it
//     (oliver-api test: 'the "note" placeholder is DELETED, not reworded'). The
//     server now answers
//       { delivery: "email", recipients: 1,
//         sent: { attempted, queued, suppressed, held, failed, duplicate } }
//     and nothing on this page read it.
//
//  2. The schedule form had no recipients field at all, so "set a scheduled
//     report to email you" could not be done — every schedule was created
//     delivery_type "portal" with an empty recipient list, which is also why
//     there was no tally to print.
//
//  3. The form still carried the sentence the server's own test forbids:
//     "Email delivery uses the platform notification path when it is set up".
//
// ZERO IMPORTS on purpose — the page pulls in the msal config, which reads
// `import.meta.env` at module scope and cannot be loaded by `node --test`.

/** The delivery tally oliver-api returns from POST /reporting/scheduled/:id/run-now. */
export type SentTally = {
  attempted?: number; queued?: number; suppressed?: number;
  held?: number; failed?: number; duplicate?: number;
};

export type RunNowResult = {
  row_count?: number | null;
  file_name?: string | null;
  delivery?: string | null;
  recipients?: number | null;
  sent?: SentTally | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * "queued 1, suppressed 0, held 0" — the counts, in the walk's own words.
 *
 * Every number is printed, including the zeros: "queued 3" alone leaves the
 * reader wondering whether anything was held back, and that is the question
 * the tally exists to answer.
 */
export function deliverySummary(result: RunNowResult | null | undefined): string {
  const delivery = String(result?.delivery || "portal");
  if (delivery !== "email") {
    return "It was saved to Report history — this schedule emails nobody.";
  }
  const s = result?.sent || {};
  const recipients = n(result?.recipients);
  if (!recipients && !n(s.attempted)) {
    return "It was saved to Report history. Nobody is on this schedule, so no email was sent.";
  }
  const parts = [
    `queued ${n(s.queued)}`,
    `suppressed ${n(s.suppressed)}`,
    `held ${n(s.held)}`,
  ];
  if (n(s.failed)) parts.push(`failed ${n(s.failed)}`);
  if (n(s.duplicate)) parts.push(`already sent ${n(s.duplicate)}`);
  const who = `${recipients} ${recipients === 1 ? "recipient" : "recipients"}`;
  return `Emailed to ${who}: ${parts.join(", ")}.`;
}

/** The whole sentence the notice shows. Never contains "undefined". */
export function runNowSummary(result: RunNowResult | null | undefined): string {
  const rows = n(result?.row_count);
  const file = String(result?.file_name || "").trim();
  const into = file ? ` into ${file}` : "";
  return `Ran now — ${rows} ${rows === 1 ? "row" : "rows"}${into}. ${deliverySummary(result)}`;
}

/**
 * Typed addresses → the body POST /reporting/scheduled expects.
 *
 * Empty box = a portal-only schedule, which is what every schedule was before
 * this field existed. One address or more = email delivery to exactly those
 * people. Anything that is not an address is dropped rather than sent to the
 * server as a recipient it will keep and never reach.
 */
export function deliveryFromRecipients(raw: string): { delivery_type: "email" | "portal"; recipients: string[] } {
  const recipients = String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s));
  return recipients.length
    ? { delivery_type: "email", recipients: [...new Set(recipients)] }
    : { delivery_type: "portal", recipients: [] };
}

/** Anything typed that is NOT an address, so the form can say so rather than drop it quietly. */
export function unusableRecipients(raw: string): string[] {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s));
}
