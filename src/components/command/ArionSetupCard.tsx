// ArionSetupCard — OLIVER/SPARK-parity onboarding card for ARION on the
// Command Center. Fail-OPEN: hide only when required steps are genuinely all
// done, or there's no ARION for this tenant. Links to the ARION onboarding
// page (ARION's flow is the checklist page).
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useAccessToken } from "../../auth/useAccessToken";
import { ClientTenantModal } from "../consulting/ClientTenantModal";

interface Checklist {
  steps: Array<{ key: string; label: string; required: boolean; done: boolean; locked?: boolean }>;
  progress: { done: number; total: number; required_done: number; required_total: number; percent: number };
}

export function ArionSetupCard() {
  const { enabledServices, activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const hasArion = enabledServices.has("arion_overview") || enabledServices.has("arion_dashboard");

  const [cl, setCl] = useState<Checklist | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!activeTenantId || !apiBaseUrl) return;
    try {
      const t = await getToken();
      const res = await globalThis.fetch(`${apiBaseUrl}/arion/onboarding/checklist`, {
        headers: { Authorization: `Bearer ${t.accessToken}`, "x-tenant-key": activeTenantId },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setCl(body?.data || null);
      setReachable(true);
    } catch {
      setCl(null);
      setReachable(hasArion ? true : false);
    }
  }, [activeTenantId, apiBaseUrl, getToken, hasArion]);

  useEffect(() => { reload(); }, [reload]);

  if (reachable === null && !hasArion) return null;
  if (reachable === false && !hasArion) return null;
  if (cl && cl.progress.required_total > 0 && cl.progress.required_done >= cl.progress.required_total) return null;

  const p = cl?.progress;
  const done = p?.done ?? 0;
  const total = p?.total ?? 6;
  const pct = p?.percent ?? 0;
  const next = cl?.steps.find((s) => !s.done && !s.locked && s.required)
    || cl?.steps.find((s) => !s.done && !s.locked);

  return (
    <>
      <div className="iadm-card" style={{ borderLeft: "4px solid #1A7DB5" }}>
        <div className="iadm-card-body p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5" style={{ color: "#1A7DB5" }} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Finish setting up ARION</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {next ? `Next: ${next.label}` : "Connect GA4, Search Console, Business Profile & Bing."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs px-3 py-1.5 rounded font-medium text-white flex-shrink-0"
              style={{ background: "#1A7DB5" }}
            >
              {done > 0 ? "Continue setup" : "Start setup"}
            </button>
          </div>
          {p && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#1A7DB5" }} />
              </div>
              <span className="font-semibold tabular-nums">{done}/{total}</span>
            </div>
          )}
        </div>
      </div>
      <ClientTenantModal
        open={open}
        tenantId={activeTenantId || null}
        mode="onboarding"
        onClose={() => { setOpen(false); reload(); }}
        onFinished={() => { setOpen(false); reload(); }}
      />
    </>
  );
}

export default ArionSetupCard;
