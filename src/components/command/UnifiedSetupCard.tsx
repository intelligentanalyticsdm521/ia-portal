// UnifiedSetupCard — the ONE "Finish setup" card on the Command Center.
//
// Replaces three legacy cards (OliverSetupCard, SparkSetupCard, ArionSetupCard)
// per Brandon's 2026-06-17 rule: there is ONE onboarding, ONE design, ONE flow.
// Whatever products the tenant has, this single card opens the unified
// ClientTenantModal in onboarding mode. The modal's section list filters
// itself by what's in cart. Prefill hydrates anything already saved so the
// user never re-enters information.
//
// Hide rule: hide ONLY when the unified onboarding_state.finished_at is set.
// Fail-OPEN otherwise — show the card if status is unknown.
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { ClientTenantModal } from "../consulting/ClientTenantModal";

interface OnboardingProgress {
  state?: Record<string, unknown> | null;
  prefill?: { cart?: string[]; signup_product?: string | null } & Record<string, unknown>;
  step?: number;
  section_id?: string | null;
  finished_at?: string | null;
  last_saved_at?: string | null;
}

type ProductKey = "arion" | "spark" | "oliver" | "consulting";

export function UnifiedSetupCard() {
  const { activeTenantId } = useAppState();
  const { getFounder, ready } = useOliverApi();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!ready || !activeTenantId) return;
    try {
      const r = await getFounder<{ data: OnboardingProgress | null }>(
        `/admin/onboard-client/onboarding-progress?tenant_id=${encodeURIComponent(activeTenantId)}`
      );
      setProgress((r as { data: OnboardingProgress | null })?.data || null);
      setReachable(true);
    } catch {
      setProgress(null);
      setReachable(false);
    }
  }, [getFounder, ready, activeTenantId]);

  useEffect(() => { reload(); }, [reload]);

  // Hide if finished. Otherwise fail-open.
  if (progress?.finished_at) return null;
  // Don't render until we know what tenant we're acting on.
  if (!activeTenantId) return null;

  const hasResumeState = !!progress?.last_saved_at && !progress?.finished_at;
  const buttonLabel = hasResumeState ? "Continue setup" : "Finish setup";

  return (
    <>
      <div className="iadm-card" style={{ borderLeft: "4px solid #1A3A4A" }}>
        <div className="iadm-card-body p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5" style={{ color: "#1A3A4A" }} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Finish setup</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {hasResumeState
                    ? "Pick up where you left off — your saved progress and existing settings are already loaded."
                    : "One guided walkthrough — business profile, brand, payments, and per-product setup. Skip anything you don't need."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs px-3 py-1.5 rounded font-medium text-white flex-shrink-0"
              style={{ background: "#1A3A4A" }}
            >
              {buttonLabel}
            </button>
          </div>
          {reachable === false && (
            <div className="mt-2 text-[10px] text-amber-700">Could not read setup progress — opening starts a fresh walkthrough.</div>
          )}
        </div>
      </div>
      <ClientTenantModal
        open={open}
        tenantId={activeTenantId}
        mode="onboarding"
        cart={
          (Array.isArray(progress?.prefill?.cart) && progress!.prefill!.cart!.length
            ? (progress!.prefill!.cart as string[]).filter(
                (k): k is ProductKey => k === "arion" || k === "spark" || k === "oliver" || k === "consulting"
              )
            : undefined)
        }
        onClose={() => { setOpen(false); reload(); }}
        onFinished={() => { setOpen(false); reload(); }}
      />
    </>
  );
}

export default UnifiedSetupCard;
