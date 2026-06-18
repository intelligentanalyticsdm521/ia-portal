// WalkthroughRunner — the modal that plays a walkthrough.
// Used both during onboarding (auto-runs first-time walkthroughs after
// Finish) and from Settings → Walkthroughs (user clicks "Run again").

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IadmModal } from "../IadmModal";
import { Walkthrough } from "./walkthroughRegistry";
import { ArrowRight, ArrowLeft } from "lucide-react";

interface WalkthroughRunnerProps {
  open: boolean;
  walkthrough: Walkthrough | null;
  onClose: () => void;
  onComplete?: (id: string) => void;
}

const PRODUCT_ACCENTS: Record<string, string> = {
  arion: "#22ABA2",
  spark: "#F69132",
  oliver: "#FEC82C",
  consulting: "#1A7DB5",
  platform: "#1A3A4A",
};

export function WalkthroughRunner({ open, walkthrough, onClose, onComplete }: WalkthroughRunnerProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const navigate = useNavigate();
  if (!open || !walkthrough) return null;

  const step = walkthrough.steps[stepIdx];
  const isLast = stepIdx === walkthrough.steps.length - 1;
  const isFirst = stepIdx === 0;
  const accent = PRODUCT_ACCENTS[walkthrough.product] || "#1A3A4A";

  function next() {
    if (isLast) {
      onComplete?.(walkthrough!.id);
      onClose();
      return;
    }
    setStepIdx((i) => i + 1);
  }
  function ctaPress() {
    if (step.ctaPath) {
      onComplete?.(walkthrough!.id);
      onClose();
      navigate(step.ctaPath);
    } else {
      next();
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product={(walkthrough.product === "arion" || walkthrough.product === "spark") ? walkthrough.product : "oliver"}
      eyebrow={`Walkthrough · ${walkthrough.title}`}
      title={step.title}
      subtitle={`Step ${stepIdx + 1} of ${walkthrough.steps.length} · ~${walkthrough.estimatedMinutes} min total`}
      size="info"
      footer={
        <div className="flex justify-between w-full gap-2">
          {!isFirst ? (
            <button onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                    className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5">
              <ArrowLeft className="inline h-4 w-4 mr-1" /> Back
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose}
                    className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5">
              Close
            </button>
            {step.kind === "cta" && step.ctaPath ? (
              <button onClick={ctaPress}
                      style={{ background: accent }}
                      className="text-sm text-white font-medium rounded-md px-4 py-1.5 hover:opacity-90">
                {step.ctaLabel || "Open"} <ArrowRight className="inline h-4 w-4 ml-1" />
              </button>
            ) : (
              <button onClick={next}
                      style={{ background: accent }}
                      className="text-sm text-white font-medium rounded-md px-4 py-1.5 hover:opacity-90">
                {isLast ? "Done" : "Next"} {!isLast && <ArrowRight className="inline h-4 w-4 ml-1" />}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="p-1 space-y-3">
        <p className="text-xs text-slate-500 italic">{walkthrough.oneLiner}</p>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 leading-relaxed text-sm text-slate-800 whitespace-pre-line">
          {step.body}
        </div>
        <div className="flex items-center justify-center gap-1 pt-2">
          {walkthrough.steps.map((_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i === stepIdx ? "bg-slate-900" : "bg-slate-300"}`} />
          ))}
        </div>
      </div>
    </IadmModal>
  );
}
