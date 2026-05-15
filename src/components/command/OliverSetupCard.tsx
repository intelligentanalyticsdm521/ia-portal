// OliverSetupCard — the "onboarding is outstanding" spot on the Command
// Center and the OLIVER dashboard. Clicking it opens the guided modal that
// walks each setup section and writes to the right tables.
//
// Visibility rule (deliberately fail-OPEN so it never silently vanishes):
//   - hide ONLY when we have a definitive status saying every required step
//     is complete, OR there's no OLIVER for this tenant at all.
//   - if the status call fails or is slow, but OLIVER is active, STILL show
//     it (onboarding is presumably outstanding) rather than disappear.
import { useCallback, useEffect, useMemo, useState } from "react";
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
  // Stable api object so the wizard never re-mounts/reloads from prop churn.
  const api = useMemo(() => ({ get, post, patch }), [get, post, patch]);

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  // null = unknown yet, true/false once we've tried.
  const [oliverReachable, setOliverReachable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!ready) return;
    try {
      const s = await get<OnboardingStatus>("/onboarding/status");
      setStatus(s);
      setOliverReachable(true); // the call succeeding proves OLIVER is provisioned
    } catch {
      // Status unavailable. Don't blank the card — fail open if we have any
      // other signal that OLIVER is active for this tenant.
      setStatus(null);
      setOliverReachable(hasOliver ? true : false);
    }
  }, [get, ready, hasOliver]);

  useEffect(() => { reload(); }, [reload]);

  // Still figuring out whether OLIVER applies — render nothing transiently.
  if (oliverReachable === null && !hasOliver) return null;
  // Genuinely no OLIVER for this tenant.
  if (oliverReachable === false && !hasOliver) return null;
  // The ONLY "hide because done" case: a definitive all-complete status.
  if (status && status.all_required_complete) return null;

  const total = status?.total_steps ?? 5;
  const done = status?.completed_count ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const nextStep = status?.steps.find((s) => !s.complete && !s.optional);

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
                    : "Walk through business profile, payments, templates, portal & catalog."}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="text-xs px-3 py-1.5 rounded font-medium text-white flex-shrink-0"
              style={{ background: "#0C4A60" }}
            >
              {done > 0 ? "Continue setup" : "Start guided setup"}
            </button>
          </div>
          {status && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#FEC82C" }} />
              </div>
              <span className="font-semibold tabular-nums">{done}/{total}</span>
            </div>
          )}
        </div>
      </div>

      {open && (
        <OliverOnboardingWizard
          api={api}
          onClose={() => { setOpen(false); reload(); }}
          onFinished={() => { setOpen(false); reload(); }}
        />
      )}
    </>
  );
}

export default OliverSetupCard;
