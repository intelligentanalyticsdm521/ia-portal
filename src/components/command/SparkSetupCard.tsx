// SparkSetupCard — OLIVER-parity "onboarding outstanding" card for SPARK.
// Lives on the Command Center AND on the SPARK Overview dashboard.
//
// F-87 — clicking the CTA now opens the SparkOnboardingWizard modal
// (previously it navigated to /spark_onboarding page). The page version
// still exists for now (deep-link compatibility) but the dashboard banner
// is the primary surface.
//
// Same fail-OPEN rule as OliverSetupCard: hide ONLY when required steps
// are genuinely all done, or there's no SPARK for this tenant.
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useSparkApi } from "../../hooks/useSparkApi";
import { ClientTenantModal } from "../consulting/ClientTenantModal";

interface Checklist {
  steps: Array<{ key: string; label: string; required: boolean; done: boolean; locked?: boolean }>;
  progress: { done: number; total: number; required_done: number; required_total: number; percent: number };
}

export function SparkSetupCard() {
  const { enabledServices, activeTenantId } = useAppState();
  const { get, ready } = useSparkApi();
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [cl, setCl] = useState<Checklist | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: Checklist }>("/api/v1/onboarding/checklist");
      setCl(r?.data || null);
      setReachable(true);
    } catch {
      setCl(null);
      setReachable(hasSpark ? true : false);
    }
  }, [get, ready, hasSpark]);

  useEffect(() => { reload(); }, [reload]);

  // When the wizard closes, refresh the checklist so the banner reflects
  // any steps the user completed while the modal was open.
  useEffect(() => {
    if (!wizardOpen) reload();
  }, [wizardOpen, reload]);

  if (reachable === null && !hasSpark) return null;
  if (reachable === false && !hasSpark) return null;
  // Hide only when every required step is genuinely complete.
  if (cl && cl.progress.required_total > 0 && cl.progress.required_done >= cl.progress.required_total) return null;

  const p = cl?.progress;
  const done = p?.done ?? 0;
  const total = p?.total ?? 7;
  const pct = p?.percent ?? 0;
  const next = cl?.steps.find((s) => !s.done && !s.locked && s.required)
    || cl?.steps.find((s) => !s.done && !s.locked);

  return (
    <>
      <div className="iadm-card" style={{ borderLeft: "4px solid #EF6C33" }}>
        <div className="iadm-card-body p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5" style={{ color: "#EF6C33" }} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Finish setting up SPARK</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {next ? `Next: ${next.label}` : "Profile, contacts, sending domain, first campaign & automation."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="text-xs px-3 py-1.5 rounded font-medium text-white flex-shrink-0"
              style={{ background: "#EF6C33" }}
            >
              {done > 0 ? "Continue setup" : "Start setup"}
            </button>
          </div>
          {p && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#EF6C33" }} />
              </div>
              <span className="font-semibold tabular-nums">{done}/{total}</span>
            </div>
          )}
        </div>
      </div>
      <ClientTenantModal
        open={wizardOpen}
        tenantId={activeTenantId || null}
        mode="onboarding"
        onClose={() => setWizardOpen(false)}
        onFinished={() => setWizardOpen(false)}
      />
    </>
  );
}

export default SparkSetupCard;
