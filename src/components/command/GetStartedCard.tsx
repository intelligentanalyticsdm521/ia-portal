// v7.0 — Get Started card hosted on the Command Dashboard.
//
// Surfaces the first 5 remaining onboarding steps across ARION / SPARK / OLIVER.
// Each step has a completion probe (an API check or feature-flag) and a route to
// jump to. A "Walk through" button opens a modal wizard that steps through each
// remaining item one screen at a time.
//
// This consolidates the per-product "Get Started" banners that previously lived
// inside the IA Insights Trends pages — see release note in CHANGES.md.
import { useEffect, useMemo, useState } from "react";
import { GBP_ENABLED } from "../../config/featureFlags";
import { Link } from "react-router-dom";
import { CheckCircle, Circle, ArrowRight, Sparkles, X, ChevronRight, ChevronLeft } from "lucide-react";
import { useAppState } from "../../app/AppState";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useAccessToken } from "../../auth/useAccessToken";

type Product = "ARION" | "SPARK" | "OLIVER";

interface Step {
  product: Product;
  label: string;
  description: string;
  route: string;
  completed: boolean;
}

const PRODUCT_COLOR: Record<Product, string> = {
  ARION: "#1A7DB5",
  SPARK: "#EF6C33",
  OLIVER: "#FEC82C",
};

export function GetStartedCard() {
  const { activeTenantId, enabledServices } = useAppState();
  const spark = useSparkApi();
  const oliver = useOliverApi();
  const { getToken } = useAccessToken();

  const hasArion = enabledServices.has("arion_dashboard") || enabledServices.has("arion_ia_insights_trends");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");
  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");

  const [steps, setSteps] = useState<Step[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // Probe each product's known endpoints to derive completion flags. All
  // failures degrade to `completed=false` — the worst case is showing a step
  // that's already done, which is recoverable.
  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;

    (async () => {
      const next: Step[] = [];

      // ── ARION ──
      if (hasArion) {
        try {
          const token = await getToken();
          const apiBase = (import.meta.env.VITE_ARION_API_BASE_URL as string)?.replace(/\/$/, "") || "";
          const headers: HeadersInit = {
            Authorization: `Bearer ${token.accessToken}`,
            "x-tenant-key": activeTenantId,
          };
          // Pull a single overview to check GA4 + GSC + service area presence.
          const overviewRes = apiBase
            ? await globalThis.fetch(`${apiBase}/arion/overview`, { headers }).catch(() => null)
            : null;
          const ovBody = overviewRes && overviewRes.ok ? await overviewRes.json().catch(() => null) : null;
          const ov = ovBody?.data || ovBody;
          next.push({ product: "ARION", label: "Connect Google Analytics 4", description: "Required for traffic, audience, and conversion trend reports.", route: "/app/settings/integrations", completed: !!ov?.integrations?.googleAnalytics });
          next.push({ product: "ARION", label: "Connect Google Search Console", description: "Powers the Search trend report (clicks, impressions, CTR, position).", route: "/app/settings/integrations", completed: !!ov?.integrations?.googleSearchConsole });
          // GBP connect is gated off (dead-end until Workspace migration) — no nag.
          if (GBP_ENABLED) next.push({ product: "ARION", label: "Connect Google Business Profile", description: "Enables Local Presence trend (reviews, calls, direction asks).", route: "/app/settings/integrations", completed: !!ov?.integrations?.googleBusinessProfile });
          next.push({ product: "ARION", label: "Configure your service area", description: "Drives the geographic relevance check in Visibility & Reach.", route: "/app/services/arion_service_area", completed: !!ov?.serviceArea?.city || !!ov?.serviceArea?.state });
        } catch { /* skip ARION */ }
      }

      // ── SPARK ──
      if (hasSpark && spark.ready) {
        try {
          const inputsRes = await spark
            .get<{ data: any }>("/api/v1/ia-insights/inputs?product=spark&days=30")
            .catch(() => null);
          const d = inputsRes?.data || null;
          next.push({ product: "SPARK", label: "Import or capture your first contacts", description: "Use the CSV import wizard or wire a form to start the contact base.", route: "/app/services/spark_contact_import", completed: (d?.contact_totals?.active ?? 0) > 0 });
          next.push({ product: "SPARK", label: "Capture your first leads", description: "Lead funnel powers conversion + revenue attribution reports.", route: "/app/services/spark_leads", completed: (d?.lead_funnel?.length ?? 0) > 0 });
          next.push({ product: "SPARK", label: "Send your first campaign", description: "Email + SMS engagement signals feed Campaign Performance.", route: "/app/services/spark_campaigns", completed: (d?.campaign_recent?.sent ?? 0) > 0 });
          next.push({ product: "SPARK", label: "Define your first segment", description: "Segmentation report compares engagement across cohorts.", route: "/app/services/spark_segments", completed: (d?.segments?.length ?? 0) > 0 });
        } catch { /* skip SPARK */ }
      }

      // ── OLIVER ──
      if (hasOliver && oliver.ready) {
        try {
          const inputsRes = await oliver
            .get<{ data: any }>("/api/v1/ia-insights/inputs?product=oliver&days=30")
            .catch(() => null);
          const d = inputsRes?.data || null;
          const jobCount = (d?.job_status || []).reduce((s: number, r: any) => s + (r.n || 0), 0);
          next.push({ product: "OLIVER", label: "Create your first job", description: "Drives Operations Health + Crew Capacity reports.", route: "/app/services/oliver_job_board", completed: jobCount > 0 });
          next.push({ product: "OLIVER", label: "Send your first invoice", description: "Revenue Performance + Cash Flow report inputs.", route: "/app/services/oliver_invoices", completed: (d?.revenue_recent?.invoices ?? 0) > 0 });
          next.push({ product: "OLIVER", label: "Send your first quote", description: "Quote Win Rate report tracks conversion + cycle time.", route: "/app/services/oliver_proposals", completed: (d?.quote_funnel?.total ?? 0) > 0 });
          next.push({ product: "OLIVER", label: "Assign at least one crew member", description: "Crew Utilisation + Capacity reports need worker assignments.", route: "/app/services/oliver_workers", completed: (d?.crew?.workers_with_assignments ?? 0) > 0 });
        } catch { /* skip OLIVER */ }
      }

      if (!cancelled) setSteps(next);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, hasArion, hasSpark, hasOliver, spark.ready, oliver.ready]);

  const remaining = useMemo(() => steps.filter((s) => !s.completed), [steps]);
  const top5 = remaining.slice(0, 5);
  const completedCount = steps.length - remaining.length;
  const pct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  // Hide entirely once everything is done.
  if (steps.length > 0 && remaining.length === 0) return null;
  if (steps.length === 0) return null;

  return (
    <>
      <div className="iadm-card">
        <div className="iadm-card-body p-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#EF6C33]" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Get started</h3>
                <p className="text-[11px] text-slate-500">First {Math.min(5, remaining.length)} remaining steps across your products.</p>
              </div>
            </div>
            <button
              onClick={() => { setIdx(0); setOpen(true); }}
              className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Walk through
            </button>
          </div>
          <div className="mb-2 flex items-center gap-2 text-[10px] text-slate-500">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#16A34A" }} />
            </div>
            <span className="font-semibold tabular-nums">{completedCount}/{steps.length}</span>
          </div>
          <ul className="space-y-1">
            {top5.map((s, i) => (
              <li key={`${s.product}-${i}`}>
                <Link
                  to={s.route}
                  className="flex items-start gap-2 rounded p-2 text-xs hover:bg-slate-50"
                >
                  <Circle className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-300" />
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5"
                    style={{ background: `${PRODUCT_COLOR[s.product]}22`, color: PRODUCT_COLOR[s.product] }}
                  >
                    {s.product}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{s.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{s.description}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {open && remaining.length > 0 && (
        <WalkthroughModal
          steps={remaining}
          idx={Math.min(idx, remaining.length - 1)}
          onPrev={() => setIdx((i) => Math.max(0, i - 1))}
          onNext={() => setIdx((i) => Math.min(remaining.length - 1, i + 1))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function WalkthroughModal({
  steps, idx, onPrev, onNext, onClose,
}: {
  steps: Step[];
  idx: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const s = steps[idx];
  const atFirst = idx === 0;
  const atLast = idx === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#EF6C33]" />
            <span className="font-semibold text-slate-900 text-sm">Get started — step {idx + 1} of {steps.length}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" aria-label="Close">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: `${PRODUCT_COLOR[s.product]}22`, color: PRODUCT_COLOR[s.product] }}
            >
              {s.product}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">{s.label}</h2>
          <p className="text-sm text-slate-600 mb-4">{s.description}</p>

          <Link
            to={s.route}
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded font-medium text-white"
            style={{ background: PRODUCT_COLOR[s.product] }}
          >
            Open page <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50 rounded-b-lg">
          <button
            onClick={onPrev}
            disabled={atFirst}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <div className="flex items-center gap-1">
            {steps.map((_step, i) => (
              <CheckCircle
                key={i}
                className={`h-3 w-3 ${i === idx ? "text-emerald-600" : "text-slate-200"}`}
              />
            ))}
          </div>
          <button
            onClick={atLast ? onClose : onNext}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            {atLast ? "Done" : "Next"} <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default GetStartedCard;
