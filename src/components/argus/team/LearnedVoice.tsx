// LearnedVoice — "What I've learned about your writing" on the web person's
// What I know tab (contract ARGUS employees phase 1 §F.2). Moved unchanged
// from the deleted ARION Agents page; the data is GET /arion/content-agent/style.
//
// Nothing here is guessed: every line comes from an edit or a reason the owner
// gave. An approval given in advance (Automatic) teaches it nothing (§G.7).
import { BookOpen } from "lucide-react";
import type { ArionLearnedVoice } from "../../../lib/arionApi";

/** Plain words for what the agent has worked out about a business's voice. */
export function LearnedVoice({ voice }: { voice: ArionLearnedVoice | null }) {
  const d = voice?.data;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900">What I&apos;ve learned about your writing</div>
          {!d ? (
            <p className="mt-1 text-[11px] text-slate-600">
              Nothing yet. Every time you edit a draft or turn one down with a reason, it keeps the
              before and after and folds it in the following week. Until then it writes from the
              brand voice you wrote down.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] text-slate-600">
                {d.evidence_count} {d.evidence_count === 1 ? "thing" : "things"} you have decided,
                folded into version {d.version}.
                {d.confidence != null && d.confidence > 0
                  ? " It is leaning on this when it writes."
                  : " Not enough yet to lean on, so it still writes from the brand voice you wrote down."}
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                {d.formatting?.measured ? (
                  <>
                    {"avgSentenceWords" in (d.formatting.measured as Record<string, unknown>) && (
                      <li>
                        · Your sentences run about{" "}
                        {String((d.formatting.measured as Record<string, unknown>).avgSentenceWords)} words.
                      </li>
                    )}
                    {"usesHeadings" in (d.formatting.measured as Record<string, unknown>) && (
                      <li>
                        · You {(d.formatting.measured as Record<string, unknown>).usesHeadings ? "use" : "do not use"} section headings.
                      </li>
                    )}
                  </>
                ) : null}
                {d.exemplar_count > 0 && (
                  <li>· It keeps {d.exemplar_count} of your actual edits as examples to write like.</li>
                )}
                {d.vocabulary_banned_count > 0 && (
                  <li>· {d.vocabulary_banned_count} words it will now avoid, because you took them out.</li>
                )}
              </ul>
            </>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Nothing here is guessed. Every line comes from something you actually did.
          </p>
        </div>
      </div>
    </section>
  );
}

export default LearnedVoice;
