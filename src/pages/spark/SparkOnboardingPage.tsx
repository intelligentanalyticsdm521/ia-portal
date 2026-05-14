// SparkOnboardingPage — guided onboarding checklist for new tenants.
//
// Aggregates progress across the 5 key SPARK setup steps. Each step shows
// status (done/not-yet), a one-line description, and a primary action that
// links to the right page.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Check, Circle, ArrowRight, Sparkles } from "lucide-react";

interface Step {
  key: string;
  group: string;
  product: string;
  label: string;
  required: boolean;
  done: boolean;
}
interface Progress {
  done: number; total: number;
  required_done: number; required_total: number;
  percent: number; required_percent: number;
}

const ACTION_MAP: Record<string, { href: string; cta: string; help: string }> = {
  spark_account_profile:  { href: "/app/services/spark_overview",        cta: "Set up profile",  help: "Add your business name and From email so people know who's emailing them." },
  spark_sender_domain:    { href: "/app/services/spark_sender_domains",  cta: "Verify domain",   help: "Send from your own domain to dramatically improve deliverability and trust." },
  spark_import_contacts:  { href: "/app/services/spark_contacts",        cta: "Import contacts", help: "Upload your existing list — CSV import or paste emails. You need 10+ to enable campaigns." },
  spark_first_campaign:   { href: "/app/services/spark_campaigns",       cta: "Build campaign",  help: "Send a first email to your imported list. Test on yourself first using the Email Templates editor." },
  spark_first_automation: { href: "/app/services/spark_automation_builder", cta: "Build automation", help: "Set up a welcome sequence or re-engagement flow. Triggered automations run forever in the background." },
};

export function SparkOnboardingPage() {
  const { get, ready } = useSparkApi();
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: { steps: Step[]; progress: Progress } }>("/api/v1/onboarding/checklist");
      setSteps(r?.data?.steps || []);
      setProgress(r?.data?.progress || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allRequiredDone = progress && progress.required_done === progress.required_total;
  const allDone = progress && progress.done === progress.total;

  return (
    <SparkPageShell
      title="Get started"
      subtitle="Your IADM onboarding checklist"
      help="A guided 5-step setup. Required items unlock the core platform; the optional ones (custom domain, first campaign, first automation) sharpen your results once you're past the basics."
      loading={loading}
      error={error}
    >
      {/* Progress hero */}
      <div className="rounded-xl bg-gradient-to-br from-[#0B1C24] to-[#1a3540] text-white p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#EF6C33]">Setup progress</div>
            <div className="text-2xl font-bold mt-1">
              {progress ? `${progress.done} of ${progress.total} complete` : "Loading…"}
            </div>
            {progress && progress.required_done < progress.required_total && (
              <div className="text-xs text-white/70 mt-1">{progress.required_done} of {progress.required_total} required steps done</div>
            )}
            {allDone && <div className="text-sm text-emerald-300 mt-1 flex items-center gap-1"><Sparkles className="h-4 w-4" /> You're fully onboarded.</div>}
            {!allDone && allRequiredDone && <div className="text-sm text-amber-300 mt-1">Required steps complete — the optional ones will accelerate results.</div>}
          </div>
          <div className="text-right">
            <div className="text-6xl font-bold tabular-nums">{progress?.percent ?? 0}<span className="text-2xl">%</span></div>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-[#EF6C33] transition-all" style={{ width: `${progress?.percent ?? 0}%` }} />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((s, i) => {
          const a = ACTION_MAP[s.key] || { href: "#", cta: "Open", help: "" };
          return (
            <div key={s.key} className={`flex items-start gap-3 p-4 rounded-lg border-2 ${s.done ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}>
              <div className="flex-shrink-0 mt-0.5">
                {s.done ? (
                  <div className="rounded-full bg-emerald-600 text-white w-7 h-7 flex items-center justify-center">
                    <Check className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="rounded-full border-2 border-slate-300 text-slate-400 w-7 h-7 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-semibold text-slate-900">{s.label}</div>
                  {s.required && !s.done && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">required</span>}
                  {s.done && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">complete</span>}
                </div>
                <div className="text-sm text-slate-600">{a.help}</div>
              </div>
              <div className="flex-shrink-0">
                <Link to={a.href} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] hover:bg-[#d75a25] text-white inline-flex items-center gap-1">
                  {s.done ? "Review" : a.cta} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resources */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Resource title="Plug-in your website" href="/app/services/arion_plugin_provisioning" body="Already running on WordPress? Install the IA Plugin to sync visitor + form data into SPARK automatically." />
        <Resource title="Connect Stripe payouts" href="/app/services/oliver_payouts" body="If you charge customers, connect Stripe so payouts hit your bank automatically." />
        <Resource title="STELLA send intelligence" href="/app/services/spark_stella" body="Once you've sent a few campaigns, STELLA learns when your audience is most likely to open." />
      </div>
    </SparkPageShell>
  );
}

function Resource({ title, href, body }: { title: string; href: string; body: string }) {
  return (
    <Link to={href} className="block border border-slate-200 rounded p-3 bg-white hover:border-[#EF6C33] transition">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-600 mt-1">{body}</div>
    </Link>
  );
}

export default SparkOnboardingPage;
