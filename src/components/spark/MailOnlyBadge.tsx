// MailOnlyBadge — the one place the words "direct mail only" are written.
//
// LOCKED (G-3 / C2 / N2): a household record bought from a licensed list may be
// posted to and nothing else. The database enforces that — a `mail_only` row
// physically cannot hold an email address or a phone number (LUMEN migration
// 164 CHECK constraints). This badge is what makes that visible instead of
// mysterious: the client sees WHY the email field is empty and locked, in one
// sentence, wherever the record appears.
//
// One component, mounted in three places (lead modal, contact modal, and the
// New Search explainer), because three copies of a legal sentence become three
// different legal sentences.

import { Mailbox } from "lucide-react";

/** The sentence. Kept as an export so a test can assert the same words appear
 *  wherever the badge is used, and so nobody paraphrases it in a hurry. */
export const MAIL_ONLY_SENTENCE =
  "We find households, you reach them by mail — no email or text, ever. The system cannot store an email address or phone number for these records.";

/** The short form, for a tight row where the full sentence will not fit. */
export const MAIL_ONLY_SHORT = "Household record — direct mail only (licensed data; no email or SMS).";

export function MailOnlyBadge({
  variant = "full",
  className = "",
}: {
  /** "full" = the badge plus the explanation; "chip" = just the pill. */
  variant?: "full" | "chip";
  className?: string;
}) {
  if (variant === "chip") {
    return (
      <span
        title={MAIL_ONLY_SHORT}
        className={`inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 ${className}`}
      >
        <Mailbox className="h-3 w-3" /> Direct mail only
      </span>
    );
  }
  return (
    <div
      className={`flex items-start gap-2 rounded border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900 ${className}`}
    >
      <Mailbox className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>
        <strong className="font-semibold">Direct mail only.</strong> {MAIL_ONLY_SENTENCE}
      </span>
    </div>
  );
}

/** Is this row a household we may only post to? One reader for the one column,
 *  so a typo in the string cannot quietly unlock the fields on one screen. */
export function isMailOnly(policy?: string | null): boolean {
  return String(policy || "").toLowerCase() === "mail_only";
}

export default MailOnlyBadge;
