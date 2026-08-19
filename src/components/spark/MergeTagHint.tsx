// MergeTagHint — tells people the `{{` shortcut exists.
//
// The composer has always supported typing `{{` to open the merge-tag list,
// and there was a hint saying so under every field — at 11px in light grey,
// which is how you write something you do not mind being missed. Founder
// feedback 2026-08-19: "it's super tiny under the subject line."
//
// Personalization is the single highest-value thing in the composer and the
// keyboard path is faster than the button, so the hint earns real weight: the
// `{{` renders as an orange chip, the instruction is bold, and the sentence
// says what personalization actually DOES rather than naming the feature.
//
// One component for all three fields (subject, body, SMS) — they carried two
// slightly different copies of this sentence before, and a hint nobody owns
// is a hint that drifts.
import { Sparkles } from "lucide-react";

const SPARK_ORANGE = "#EF6C33";

interface Props {
  /** Label of this field's own insert button, so the hint names what is on screen. */
  buttonLabel?: string;
  /** The body editor also offers a call-to-action button. */
  mentionCta?: boolean;
}

export function MergeTagHint({ buttonLabel = "Insert", mentionCta = false }: Props) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: SPARK_ORANGE }} aria-hidden="true" />
      <span>
        <strong className="font-semibold text-slate-800">
          Type{" "}
          <code
            className="rounded px-1 py-px font-mono text-[11px] font-bold"
            style={{ color: SPARK_ORANGE, backgroundColor: `${SPARK_ORANGE}1A` }}
          >
            {"{{"}
          </code>{" "}
          to personalize
        </strong>{" "}
        — drops in each person's own details, like their first name or company,
        filled in automatically for every recipient when this sends. Or click{" "}
        <span className="font-semibold text-slate-700">{buttonLabel}</span>.
        {mentionCta && (
          <>
            {" "}Use <span className="font-semibold text-slate-700">CTA</span> to add a
            call-to-action button.
          </>
        )}
      </span>
    </p>
  );
}
