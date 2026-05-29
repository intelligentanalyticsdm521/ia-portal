// SparkOnboardingWizard — modal version of the SPARK setup checklist.
//
// F-87 — Get Started moved out of the SPARK nav (was a permanent nav item
// that signalled "you're a beginner here forever"). Now it's a dashboard
// banner (SparkSetupCard) that opens this modal on click. Mirrors OLIVER's
// OliverOnboardingWizard pattern: finite task, dismiss when done, self-hide
// when 100% complete.
//
// F-101 — refactored to host on IadmModal so the wizard inherits the
// standard ink-gradient header + Core Blue / SPARK accent button policy
// + drag-text-safe backdrop close. The progress strip (numbers + bar) now
// renders as the first body row instead of fighting the standard header.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { Check, ArrowRight, Sparkles, Lock } from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";

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

  // Esc + click-outside close handled by IadmModal.

  if (!open) return null;

  const allRequiredDone = progress && progress.required_done === progress.required_total;
  const allDone = progress && progress.done === progress.total;

  // The big % indicator lives in the header's right slot (headerActions) so
  // the standard IadmModal eyebrow + title + subtitle pattern still owns the
  // left side. The progress bar itself drops into the body's first row.
  const headerPct = (
    <div className="text-right">
      <div className="text-3xl font-bold tabular-nums leading-none">
        {progress?.percent ?? 0}<span className="text-base text-white/60">%</span>
      </div>
    </div>
  );

  const subtitle = !progress ? "Loading checklist…"
    : allDone ? "You're fully onboarded."
    : allRequiredDone ? "Required complete. Optional steps will sharpen results."
    : progress.required_done < progress.required_total
      ? `${progress.required_done} of ${progress.required_total} required steps done`
      : undefined;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · GET STARTED"
      title={progress ? `${progress.done} of ${progress.total} complete` : "Get started"}
      subtitle={subtitle}
      headerActions={headerPct}
      size="info"
      footer={
        <>
          <div className="mr-auto text-[11px] text-slate-500">
            Skip what you don't need — required steps unlock the core platform; optional ones sharpen results.
          </div>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
        </>
      }
    >
      <div className="p-5 space-y-3">
        {/* Progress bar — first row of the body so the standard ink header
            stays untouched but the visual cue is still front-and-center. */}
        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-[#EF6C33] transition-all" style={{ width: `${progress?.percent ?? 0}%` }} />
        </div>

        {allDone && (
          <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" /> Every checklist item is done. You can close this.
          </div>
        )}

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
    </IadmModal>
  );
}

export default SparkOnboardingWizard;
