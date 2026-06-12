// @deprecated 2026-06-12 � orphan after refactor. Superseded by ArionDashboard onboarding banner (task #173) � Get Started removed from nav 2026-06-12. Confirm with founder before deletion (task #174).
// ArionOnboardingPage — in-app ARION onboarding checklist (parity with
// SPARK/OLIVER). Site creation happens in the signup flow; this surfaces the
// post-provision connection steps (GA4/GSC/GBP/Bing) + the SEO add-on.
// SEO step shows "Add Intelligent Analytics SEO package to access this".
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../app/AppState";
import { useAccessToken } from "../../auth/useAccessToken";
import { Check, ArrowRight, Sparkles, Lock } from "lucide-react";

interface Step {
  key: string; group: string; label: string; required: boolean;
  done: boolean; locked?: boolean; requiredAddon?: string | null; seoAddon?: boolean;
}
interface Progress {
  done: number; total: number; required_done: number; required_total: number;
  percent: number; required_percent: number;
}

const ACTION: Record<string, { href: string; cta: string; help: string }> = {
  arion_site:      { href: "/app/services/arion_dashboard",                cta: "Open site",      help: "Your AI-built website. Created during signup from your questionnaire." },
  arion_ga4:       { href: "/app/settings?tab=Connected%20Accounts",        cta: "Connect GA4",    help: "Required for traffic, audience, and conversion reporting." },
  arion_gsc:       { href: "/app/settings?tab=Connected%20Accounts",        cta: "Connect GSC",    help: "Powers the Search report — clicks, impressions, CTR, position." },
  arion_gbp:       { href: "/app/settings?tab=Connected%20Accounts",        cta: "Connect GBP",    help: "Enables Local Presence — reviews, calls, direction requests." },
  arion_bing:      { href: "/app/settings?tab=Connected%20Accounts",        cta: "Connect Bing",   help: "One-click Bing Webmaster Tools via the master account." },
  arion_seranking: { href: "/app/services/arion_seo_overview",              cta: "Open SEO",       help: "Keyword tracking, audits, and competitor monitoring (SE Ranking)." },
};

export function ArionOnboardingPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTenantId || !apiBaseUrl) return;
    setLoading(true); setError(null);
    try {
      const t = await getToken();
      const res = await globalThis.fetch(`${apiBaseUrl}/arion/onboarding/checklist`, {
        headers: { Authorization: `Bearer ${t.accessToken}`, "x-tenant-key": activeTenantId },
      });
      if (!res.ok) throw new Error(`ARION API ${res.status}`);
      const body = await res.json();
      setSteps(body?.data?.steps || []);
      setProgress(body?.data?.progress || null);
    } catch (e) {
      setError((e as Error).message || "Failed to load onboarding");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, apiBaseUrl, getToken]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Get started with ARION</h1>
      <p className="mt-1 text-sm text-slate-600">
        Connect your data sources so ARION can report on visibility, search, and local presence.
      </p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-6 text-sm text-slate-500">Loading…</div>}

      {progress && (
        <div className="mt-4 rounded-xl bg-gradient-to-br from-[#0B1C24] to-[#1a3540] text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#1A7DB5]">Setup progress</div>
              <div className="text-2xl font-bold mt-1">{progress.done} of {progress.total} complete</div>
            </div>
            <div className="text-5xl font-bold tabular-nums">{progress.percent}<span className="text-xl">%</span></div>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[#1A7DB5] transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {steps.map((s, i) => {
          const a = ACTION[s.key] || { href: "#", cta: "Open", help: "" };
          const locked = !!s.locked;
          return (
            <div key={s.key} className={`flex items-start gap-3 p-4 rounded-lg border-2 ${
              locked ? "border-slate-200 bg-slate-50 opacity-60"
                : s.done ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}>
              <div className="flex-shrink-0 mt-0.5">
                {locked ? (
                  <div className="rounded-full border-2 border-slate-300 text-slate-400 w-7 h-7 flex items-center justify-center"><Lock className="h-3.5 w-3.5" /></div>
                ) : s.done ? (
                  <div className="rounded-full bg-emerald-600 text-white w-7 h-7 flex items-center justify-center"><Check className="h-4 w-4" /></div>
                ) : (
                  <div className="rounded-full border-2 border-slate-300 text-slate-400 w-7 h-7 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-semibold text-slate-900">{s.label}</div>
                  {locked && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">SEO add-on</span>}
                  {!locked && s.required && !s.done && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">required</span>}
                  {!locked && s.done && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">complete</span>}
                </div>
                <div className="text-sm text-slate-600">{a.help}</div>
              </div>
              <div className="flex-shrink-0">
                {locked ? (
                  <Link to="/app/services/arion_usage" className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1">
                    Add Intelligent Analytics SEO package <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : (
                  <Link to={a.href} className="text-sm px-3 py-1.5 rounded bg-[#1A7DB5] hover:bg-[#156a9c] text-white inline-flex items-center gap-1">
                    {s.done ? "Review" : a.cta} <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {progress && progress.done === progress.total && (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <Sparkles className="h-4 w-4" /> ARION is fully connected.
        </div>
      )}
    </div>
  );
}

export default ArionOnboardingPage;
