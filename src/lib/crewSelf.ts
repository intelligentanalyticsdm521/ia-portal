// crewSelf — the words for "Add yourself as a crew member" on the OLIVER Team
// page (on-site flow v1, Phase A, 1 Oct 2026).
//
// An owner-operator works in the Portal for the office and in the crew app on
// site. The crew app only lets in someone who is on the crew list
// (oliver.worker), and an owner was never on it — so the owner could not open
// the crew app on their own job. POST /workers/me (oliver-api routes/workers.js,
// business admins only) adds the signed-in person as an active employee when
// no crew member has their email, and answers { worker_id, created }.
//
// Pure, so test/crew-self.test.mjs runs the real thing. The answer is checked
// for what it must CONTAIN — a reply without `created` is not read as success.

import { apiErrorMessage } from "./apiErrorMessage";

export interface AddSelfResult {
  worker_id: string;
  created: boolean;
}

export interface AddSelfNote {
  ok: boolean;
  text: string;
}

/** Same id, whatever case SQL Server returned it in. */
export function sameWorkerId(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** What to tell the person after POST /workers/me answered. */
export function addSelfNote(result: unknown, email: string | null | undefined): AddSelfNote {
  const r = result as Partial<AddSelfResult> | null | undefined;
  if (!r || typeof r !== "object" || typeof r.created !== "boolean" || !r.worker_id) {
    return { ok: false, text: "We could not tell whether you were added to the crew list. Refresh the page to check." };
  }
  if (!r.created) return { ok: true, text: "You were already on the crew list." };
  const who = email && email.trim() ? email.trim() : "the email you use here";
  return { ok: true, text: `You're on the crew list. Sign in to the crew app with ${who}.` };
}

/** What to tell the person when the request itself failed. */
export function addSelfFailureNote(err: unknown): AddSelfNote {
  const said = apiErrorMessage(err);
  // A machine code ("forbidden", "tier_required") is not a sentence.
  const sentence = /\s/.test(said.trim()) ? said.trim() : null;
  return {
    ok: false,
    text: sentence
      ? `You were not added to the crew list: ${sentence}`
      : "You were not added to the crew list. Please try again.",
  };
}
