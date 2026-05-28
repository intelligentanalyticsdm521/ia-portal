// SparkOnboardingWizard — modal version of the SPARK setup checklist.
//
// F-87 — Get Started moved out of the SPARK nav (was a permanent nav item
// that signalled "you're a beginner here forever"). Now it's a dashboard
// banner (SparkSetupCard) that opens this modal on click. Mirrors OLIVER's
// OliverOnboardingWizard pattern: finite task, dismiss when done, self-hide
// when 100% complete.
//
// The content mirrors SparkOnboardingPage (same checklist API + same action
// map) but renders as an overlay instead of a routed page. The /spark_onboarding
// page is being phased out — anyone deep-linking there will see the same
// content with a "this is now in your dashboard" banner.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { Check, ArrowRight, Sparkles, Lock, X } from "lucide-react";

interface Step {
  key: string;
  group: string;
  product: string;
  label: string;
  required: boolean;
  done: boolean;
  locked?: boolean;
  requiredTier?: string | null;
}
interface Progress {
  done: number; total: number;
  required_done: number; required_total: number;
  percent: number; required_percent: number;
}

const ACTION_MAP: Record<string, { href: string; cta: string; help: string }> = {
  spark_account_profile:  { href: "/app/services/spark_account_profile",  cta: "Review profile",  help: "Your shared business profile (name, contact, address, branding) is reused across every product. Review what's prefilled and save — no re-entry." },
  spark_sender_domain:    { href: "/app/services/spark_sender_domains",  cta: "Verify domain",   help: "Send from your own domain to dramatically improve deliverability and trust." },
  spark_import_contacts:  { href: "/app/services/spark_contacts",        cta: "Import contacts", help: "Upload your existing list — CSV import or paste emails. You need 10+ to enable campaigns." },
  spark_first_campaign:   { href: "/app/services/spark_campaigns",       cta: "Build campaign",  help: "Send a first email to your imported list. Test on yourself first using the Email Templates editor." },
  spark_first_automation: { href: "/app/services/spark_automation_builder", cta: "Build automation", help: "Set up a welcome sequence or re-engagement flow. Triggered automations run forever in the background." },
  spark_review_destinations: { href: "/app/services/spark_review_widget", cta: "Add destinations", help: "Add at least one public review link (Google Business Profile is highest impact). Promoters see these after a 4-5 star widget review." },
  spark_api_key_issued:      { href: "/app/services/spark_api_keys", cta: "Issue key", help: "Issue an API key for Zapier or your custom integrations." },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SparkOnboardingWizard({ open, onClose }: Props) {
  const { get, ready } = useSparkApi();
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchData = useCallback(async () => {
    if (!ready || !open) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: { steps: Step[]; progress: Progress } }>("/api/v1/onboarding/checklist");
      setSteps(r?.data?.steps || []);
      setProgress(r?.data?.progress || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, open]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const allRequiredDone = progress && progress.required_done === progress.required_total;
  const allDone = progress && progress.done === progress.total;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spark-onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#0B1C24] to-[#1a3540] px-6 py-5 text-white rounded-t-xl">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">Get started</div>
              <h2 id="spark-onboarding-title" className="text-xl font-bold mt-1">
                {progress ? `${progress.done} of ${progress.total} complete` : "Loading checklist…"}
              </h2>
              {progress && progress.required_done < progress.required_total && (
                <div className="text-xs text-white/70 mt-1">{progress.required_done} of {progress.required_total} required steps done</div>
              )}
              {allDone && <div className="text-xs text-emerald-300 mt-1 flex items-center gap-1"><Sparkles className="h-3 w-3" /> You're fully onboarded.</div>}
              {!allDone && allRequiredDone && <div className="text-xs text-amber-300 mt-1">Required complete. Optional steps will sharpen results.</div>}
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold tabular-nums">{progress?.percent ?? 0}<span className="text-lg">%</span></div>
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-3">
            <div className="h-full bg-[#EF6C33] transition-all" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-2">
          {loading && <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>}
          {Boolean(error) && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Couldn't load checklist. {String((error as Error)?.message || error)}
            </div>
          )}
          {!loading && steps.map((s, i) => {
            const a = ACTION_MAP[s.key] || { href: "#", cta: "Open", help: "" };
            const locked = !!s.locked;
            return (
              <div
                key={s.key}
                className={`flex items-start gap-3 p-3 rounded-lg border-2 ${
                  locked ? "border-slate-200 bg-slate-50 opacity-60"
                    : s.done ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {locked ? (
                    <div className="rounded-full border-2 border-slate-300 text-slate-400 w-6 h-6 flex items-center justify-center" title="Locked — upgrade required">
                      <Lock className="h-3 w-3" />
                    </div>
                  ) : s.done ? (
                    <div className="rounded-full bg-emerald-600 text-white w-6 h-6 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <div className="rounded-full border-2 border-slate-300 text-slate-400 w-6 h-6 flex items-center justify-center text-[11px] font-bold">
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="font-semibold text-slate-900 text-sm">{s.label}</div>
                    {locked && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{s.requiredTier} plan</span>}
                    {!locked && s.required && !s.done && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">required</span>}
                    {!locked && s.done && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">complete</span>}
                  </div>
                  <div className="text-xs text-slate-600 leading-snug">{a.help}</div>
                </div>
                <div className="flex-shrink-0">
                  {locked ? (
                    <Link
                      to="/app/spark/pricing"
                      onClick={onClose}
                      className="text-xs px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                    >
                      Upgrade <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <Link
                      to={a.href}
                      onClick={onClose}
                      className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] hover:bg-[#d75a25] text-white inline-flex items-center gap-1"
                    >
                      {s.done ? "Review" : a.cta} <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-xl">
          <div className="text-[11px] text-slate-500">
            Skip what you don't need — required steps unlock the core platform; the optional ones sharpen results.
          </div>
          <button
            onClick={onClose}
            className="rounded bg-white border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SparkOnboardingWizard;
