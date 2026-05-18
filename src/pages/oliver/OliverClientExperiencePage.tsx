// OliverClientExperiencePage — manage the Client Experience ADD-ON.
//
// Separate axis from the OLIVER product tier. Shows the three add-on levels
// (Essentials / Growth / Authority), what each unlocks (honest built status),
// and lets the tenant subscribe / change / cancel. Billing is IA → tenant.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { Check, Lock, Sparkles } from "lucide-react";

interface CxFeature {
  key: string; minTier: string; built: boolean | "partial" | "unverified" | string;
  label: string; unlocked: boolean;
}
interface CxState {
  cxTier: string;
  pricing: Record<string, { price: number; label: string }>;
  features: CxFeature[];
  entitlements: string[];
  canDesignPortal: boolean;
  canEditAutomations: boolean;
}

const ORDER = ["essentials", "growth", "authority"] as const;
const RANK: Record<string, number> = { none: 0, essentials: 1, growth: 2, authority: 3 };

const BUILT_PILL: Record<string, { label: string; cls: string }> = {
  true:       { label: "Available",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partial:    { label: "Beta",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  unverified: { label: "Beta",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  false:      { label: "Roadmap",    cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export function OliverClientExperiencePage() {
  const { get, post, ready } = useOliverApi();
  const [state, setState] = useState<CxState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await get<{ data: CxState }>("/client-experience");
      setState(res?.data || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function subscribe(tier: string) {
    setBusy(tier); setNotice(null);
    try {
      await post("/client-experience/subscribe", { tier });
      setNotice(`Client Experience ${tier} is now active.`);
      await load();
    } catch (err) {
      setNotice(`Could not change plan: ${err instanceof Error ? err.message : "error"}`);
    } finally { setBusy(null); }
  }

  async function cancel() {
    setBusy("cancel"); setNotice(null);
    try {
      await post("/client-experience/cancel", {});
      setNotice("Client Experience add-on cancelled.");
      await load();
    } catch (err) {
      setNotice(`Could not cancel: ${err instanceof Error ? err.message : "error"}`);
    } finally { setBusy(null); }
  }

  const current = state?.cxTier || "none";

  return (
    <OliverPageWrapper
      title="Client Experience"
      subtitle="An optional add-on that makes the client experience 100% yours"
      error={error}
      loading={loading}
    >
      {notice && (
        <div className="mb-4 rounded-md border border-[#1A7DB5]/30 bg-[#1A7DB5]/5 px-4 py-2 text-sm text-[#1A3A4A]">
          {notice}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {ORDER.map((tier) => {
          const p = state?.pricing?.[tier];
          const isCurrent = current === tier;
          const isDowngrade = RANK[current] > RANK[tier];
          return (
            <div key={tier}
              className={`rounded-xl p-5 border-2 ${isCurrent ? "border-[#FEC82C] bg-[#1A3A4A] text-white" : "border-slate-200 bg-white"}`}>
              <div className={`text-[10px] uppercase tracking-wider font-bold ${isCurrent ? "text-[#FEC82C]" : "text-[#1A7DB5]"}`}>
                {tier}
              </div>
              <div className="text-2xl font-bold mt-1">
                ${p?.price?.toFixed(2) ?? "—"}
                <span className={`text-xs font-normal ${isCurrent ? "text-white/60" : "text-slate-400"}`}>/mo</span>
              </div>
              <div className={`text-xs mt-1 ${isCurrent ? "text-white/70" : "text-slate-500"}`}>
                {p?.label || ""}
              </div>
              <button
                type="button"
                disabled={isCurrent || busy === tier}
                onClick={() => subscribe(tier)}
                className={`mt-4 w-full py-2 rounded-md text-sm font-semibold transition disabled:opacity-60 ${
                  isCurrent
                    ? "bg-white/10 text-white/70 cursor-default"
                    : "bg-[#FEC82C] hover:bg-[#e3b424] text-[#1A3A4A]"
                }`}
              >
                {isCurrent ? "Current plan" : busy === tier ? "Working…" : isDowngrade ? `Switch to ${tier}` : `Upgrade to ${tier}`}
              </button>
            </div>
          );
        })}
      </div>

      {current !== "none" && (
        <div className="mb-5">
          <button
            type="button"
            onClick={cancel}
            disabled={busy === "cancel"}
            className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel Client Experience add-on"}
          </button>
        </div>
      )}

      {/* Quick links to the editors */}
      {(state?.canDesignPortal || state?.canEditAutomations) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <a href="/app/services/oliver_portal_designer"
             className="card flex items-center gap-3 px-4 py-3 hover:ring-2 hover:ring-[#1A7DB5]/30 transition">
            <Sparkles className="h-5 w-5 text-[#1A7DB5]" />
            <div>
              <div className="font-semibold text-slate-800 text-sm">White Label Design Editor</div>
              <div className="text-xs text-slate-500">Buttons, labels, fonts, header/footer, custom CSS</div>
            </div>
          </a>
          <a href="/app/services/oliver_automations"
             className="card flex items-center gap-3 px-4 py-3 hover:ring-2 hover:ring-[#1A7DB5]/30 transition">
            <Sparkles className="h-5 w-5 text-[#1A7DB5]" />
            <div>
              <div className="font-semibold text-slate-800 text-sm">Automations & Notifications</div>
              <div className="text-xs text-slate-500">Notification copy, triggers, reminder cadence</div>
            </div>
          </a>
        </div>
      )}

      {/* Feature matrix */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">What each level unlocks</div>
            <div className="card-sub">Honest status — roadmap items are not gated until they ship</div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <ul className="divide-y divide-slate-100">
            {(state?.features || []).map((f) => {
              const pill = BUILT_PILL[String(f.built)] || BUILT_PILL.false;
              return (
                <li key={f.key} className="py-2.5 flex items-start gap-3">
                  <span className="mt-0.5">
                    {f.unlocked
                      ? <Check className="h-4 w-4 text-emerald-600" />
                      : <Lock className="h-4 w-4 text-slate-300" />}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-slate-800">{f.label}</div>
                    <div className="text-[11px] text-slate-400 uppercase tracking-wide mt-0.5">
                      {f.minTier}
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border self-center ${pill.cls}`}>
                    {pill.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default OliverClientExperiencePage;
