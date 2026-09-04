// LeadCorrectionButtons — the owner tells the Intelligence Layer it got one wrong.
//
// Two buttons, and they are the whole feature. The platform reads every enquiry
// and puts a number on it; sometimes it is wrong, and the person who can see
// that in half a second is the owner. This is the half-second.
//
// WHY IT IS ITS OWN COMPONENT AND NOT SIX LINES IN THE MODAL. SparkLeadModal is
// 700 lines and three other builders are in the same file this week; the modal
// gets one import and one line. It also means the same two buttons can be
// dropped on the inbox row later without moving any of this logic.
//
// WHAT PRESSING ONE DOES (LUMEN POST /leads/:id/il/correct):
//   · writes a row on the decision log marked as the owner's judgement,
//     carrying the message the model read — so it is a training example, not
//     just a verdict
//   · re-scores the lead there and then, so the badge moves while they are
//     still looking at it
//   · writes an activity row saying who said what
//
// WHAT IT DOES NOT DO: nothing is deleted, suppressed, dismissed or emailed. A
// lead marked "not a lead" is still in the inbox, still openable, and one click
// from being marked real again. The owner is allowed to change their mind, and
// the newest correction is the one that counts.
//
// Terminology: the second opinion is never named after a vendor, and the copy
// never says "tenant".

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";

interface CorrectionResult {
  summary: string;
  after: { composite: number; band: string; capped: boolean };
  reason: string | null;
}

interface Props {
  leadId: number;
  /** Called after a correction lands so the modal and the inbox re-read. */
  onChanged?: () => void;
}

export function LeadCorrectionButtons({ leadId, onChanged }: Props) {
  const { post, ready } = useSparkApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<CorrectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (label: "not_a_lead" | "real_lead") => {
    if (!ready) return;
    setBusy(label);
    setError(null);
    try {
      const r = await post<{ data: CorrectionResult }>(`/api/v1/leads/${leadId}/il/correct`, { label });
      setDone(r.data);
      onChanged?.();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Did we read this right?
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Tell us and we fix this lead now — and score the next one like it better. Nothing is deleted either way.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void send("not_a_lead")}
          disabled={busy != null || !ready}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          {busy === "not_a_lead" ? "Saving…" : "Not a lead"}
        </button>
        <button
          type="button"
          onClick={() => void send("real_lead")}
          disabled={busy != null || !ready}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {busy === "real_lead" ? "Saving…" : "This is real"}
        </button>
      </div>
      {done && (
        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
          {done.summary}
          {done.reason && <div className="mt-0.5 text-emerald-800">{done.reason}</div>}
        </div>
      )}
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">{error}</div>
      )}
    </div>
  );
}
