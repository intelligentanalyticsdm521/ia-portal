// OliverSetupCard — Command-center banner that nudges a tenant to finish the
// OLIVER billing/branding/payments setup. Distinct from GetStartedCard (which
// tracks product *usage* steps like "create your first job") — this one is
// about getting the account ready to send a paid invoice, and it opens the
// guided OliverOnboardingWizard inline.
//
// Auto-hides once /onboarding/status reports completion (explicit completion
// flag OR all required steps done).
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverOnboardingWizard } from "../oliver/OliverOnboardingWizard";

interface OnboardingStatus {
  onboarding_completed_at: string | null;
  all_required_complete: boolean;
  completed_count: number;
  total_steps: number;
  steps: Array<{ key: string; title: string; complete: boolean; optional?: boolean }>;
}

export function OliverSetupCard() {
  const { enabledServices } = useAppState();
  const { get, post, patch, ready } = useOliverApi();
  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!hasOliver || !ready) return;
    try {
      setStatus(await get<OnboardingStatus>("/onboarding/status"));
    } catch { /* degrade silently — card just won't show */ }
  }, [get, hasOliver, ready]);

  useEffect(() => { reload(); }, [reload]);

  if (!hasOliver || !status) return null;
  // Show until onboarding is GENUINELY 100% (every required step satisfied).
  // We deliberately ignore onboarding_completed_at / "skip" — a stale flag
  // from a prior session should never blank the setup entry point.
  if (status.all_required_complete) return null;

  const pct = status.total_steps > 0
    ? Math.round((status.completed_count / status.total_steps) * 100)
    : 0;
  const nextStep = status.steps.find((s) => !s.complete && !s.optional);

  return (
    <>
      <div className="iadm-card" style={{ borderLeft: "4px solid #FEC82C" }}>
        <div className="iadm-card-body p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5" style={{ color: "#FEC82C" }} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Finish setting up OLIVER</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {nextStep
                    ? `Next: ${nextStep.title} — get ready to send your first paid invoice.`
                    : "A few steps left before you can send a paid invoice."}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="text-xs px-3 py-1.5 rounded font-medium text-white flex-shrink-0"
              style={{ background: "#0C4A60" }}
            >
              {status.completed_count > 0 ? "Continue setup" : "Start guided setup"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#FEC82C" }} />
            </div>
            <span className="font-semibold tabular-nums">
              {status.completed_count}/{status.total_steps}
            </span>
          </div>
        </div>
      </div>

      {open && (
        <OliverOnboardingWizard
          api={{ get, post, patch }}
          onClose={() => { setOpen(false); reload(); }}
          onFinished={() => { setOpen(false); reload(); }}
        />
      )}
    </>
  );
}

export default OliverSetupCard;
