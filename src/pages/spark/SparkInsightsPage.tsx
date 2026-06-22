// @deprecated 2026-06-12 - orphan after refactor. Superseded by F-86 cross-product Settings SubNav + spark/SparkOverviewPage IA Insights cards. Confirm with founder before deletion (task #174).
import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { ArgusInsightBox } from "../../components/oliver/ArgusInsightBox";
import { Sparkles } from "lucide-react";

// ─ Types ─────────────────────────────────────────────────────────────────────
interface CustomerHealth { tier_distribution: { tier: string | null; n: number }[]; }
interface CommPerf {
  window_days: number;
  totals: { sent: number; opened: number; clicked: number; bounced: number; unsubscribed: number };
  open_rate: number; click_rate: number; bounce_rate: number;
}
interface PipelineVel {
  by_stage: { stage: string; deal_count: number; total_value: number }[];
  win_loss: { status: string; n: number; total_value: number }[];
  window_days: number;
}
interface Reputation {
  nps: { total: number; promoters: number; passives: number; detractors: number; score: number };
  reviews_by_source: { source: string; n: number; avg_rating: number }[];
  window_days: number;
}
interface RevenueAttrib { by_source: { source: string; deals: number; revenue: number }[]; window_days: number; }
interface LeadGenRoi {
  total_leads: number; accepted: number; from_cache: number; avg_score: number; hot: number;
  deals_from_leads: number; revenue_from_leads: number;
}
interface GrowthVelocity {
  window_days: number; new_contacts: number; total_contacts: number;
  deals_won: number; revenue_won: number; active_automations: number; posts_published: number;
  growth_velocity_score: number;
}

export function SparkInsightsPage() {
  const { get, ready } = useSparkApi();
  const [ch, setCh] = useState<CustomerHealth | null>(null);
  const [cp, setCp] = useState<CommPerf | null>(null);
  const [pv, setPv] = useState<PipelineVel | null>(null);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [ra, setRa] = useState<RevenueAttrib | null>(null);
  const [lg, setLg] = useState<LeadGenRoi | null>(null);
  const [gv, setGv] = useState<GrowthVelocity | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [a, b, c, d, e, f, g] = await Promise.all([
        get<{ data: CustomerHealth }>("/api/v1/insights/customer-health"),
        get<{ data: CommPerf }>("/api/v1/insights/communication-performance"),
        get<{ data: PipelineVel }>("/api/v1/insights/pipeline-velocity"),
        get<{ data: Reputation }>("/api/v1/insights/reputation"),
        get<{ data: RevenueAttrib }>("/api/v1/insights/revenue-attribution"),
        get<{ data: LeadGenRoi }>("/api/v1/insights/lead-gen-roi"),
        get<{ data: GrowthVelocity }>("/api/v1/insights/growth-velocity"),
      ]);
      setCh(a.data); setCp(b.data); setPv(c.data); setRep(d.data); setRa(e.data); setLg(f.data); setGv(g.data);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  // ─ Argus observation generators ────────────────────────────────────────────
  const customerHealthArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!ch) return { observations: obs, actions: act };
    const tiers = ch.tier_distribution || [];
    const total = tiers.reduce((a, t) => a + t.n, 0);
    if (total === 0) { obs.push("No contact intelligence data yet — scoring will populate as contacts engage."); return { observations: obs, actions: act }; }
    const xTier = tiers.find(t => t.tier === "X")?.n || 0;
    const zTier = tiers.find(t => t.tier === "Z")?.n || 0;
    if (xTier > 0) obs.push(`${xTier} contacts (${Math.round(xTier * 100 / total)}%) are Tier X — your highest-value, most-engaged segment.`);
    if (zTier > total * 0.5) {
      obs.push(`${zTier} contacts (${Math.round(zTier * 100 / total)}%) are Tier Z — cold or stale, dragging down deliverability.`);
      act.push("Run a winback automation on Tier Z contacts; suppress those who don't engage after 2 attempts.");
    }
    if (xTier > 0) act.push("Build a 'VIP' segment from Tier X contacts and target with high-value offers.");
    return { observations: obs, actions: act };
  }, [ch]);

  const commPerfArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!cp) return { observations: obs, actions: act };
    if (cp.totals.sent === 0) { obs.push("No campaigns sent in the last 90 days."); return { observations: obs, actions: act }; }
    if (cp.open_rate < 15) {
      obs.push(`Open rate is ${cp.open_rate}% — well below the 22% small-business benchmark.`);
      act.push("Test new subject lines (use the AI Writer); verify your from-name/email isn't being treated as suspicious by inbox providers.");
    } else if (cp.open_rate > 30) {
      obs.push(`Open rate is ${cp.open_rate}% — strong; you're well above the industry benchmark.`);
    }
    if (cp.bounce_rate > 3) {
      obs.push(`Bounce rate is ${cp.bounce_rate}% — anything above 2% will hurt sender reputation.`);
      act.push("Run a list-cleaning pass (NeverBounce, ZeroBounce) and suppress hard-bounced addresses.");
    }
    if (cp.click_rate < 1.5 && cp.totals.opened > 50) {
      obs.push(`Click-to-open is ${cp.click_rate}% — readers open but don't act.`);
      act.push("Strengthen calls-to-action; one primary CTA per email outperforms multiple.");
    }
    return { observations: obs, actions: act };
  }, [cp]);

  const pipelineArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!pv) return { observations: obs, actions: act };
    const won = pv.win_loss.find(w => w.status === "won");
    const lost = pv.win_loss.find(w => w.status === "lost");
    if (won && lost) {
      const winRate = Math.round((won.n / (won.n + lost.n)) * 100);
      obs.push(`Win rate is ${winRate}% (${won.n} won / ${lost.n} lost) in the last ${pv.window_days} days.`);
      if (winRate < 25) act.push("Review the loss reasons on recent deals — most common loss reasons reveal positioning or qualification gaps.");
    }
    const big = pv.by_stage.find(s => s.deal_count > 0 && s.deal_count === Math.max(...pv.by_stage.map(x => x.deal_count)));
    if (big && big.deal_count > 5) obs.push(`Largest concentration of open deals is in "${big.stage}" — $${Number(big.total_value).toLocaleString()} pipeline value waiting.`);
    return { observations: obs, actions: act };
  }, [pv]);

  const reputationArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!rep) return { observations: obs, actions: act };
    if (rep.nps.total > 0) {
      obs.push(`NPS is ${rep.nps.score} (${rep.nps.promoters} promoters / ${rep.nps.detractors} detractors out of ${rep.nps.total} responses).`);
      if (rep.nps.score >= 50) act.push("Route promoters to your review-request flow — Google + Yelp reviews follow naturally from this segment.");
      if (rep.nps.detractors > rep.nps.promoters) act.push("Each detractor is a churn risk — reach out personally before they leave bad reviews publicly.");
    }
    const negativeBySource = rep.reviews_by_source.find(r => Number(r.avg_rating || 5) < 4);
    if (negativeBySource) {
      obs.push(`Average rating on ${negativeBySource.source} is ${Number(negativeBySource.avg_rating).toFixed(1)} ★ — below the 4.0 threshold most buyers screen for.`);
      act.push(`Audit recent ${negativeBySource.source} reviews and respond to every 1–3 star review publicly to demonstrate accountability.`);
    }
    return { observations: obs, actions: act };
  }, [rep]);

  const revenueArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!ra || ra.by_source.length === 0) { obs.push("No attributed revenue in the window — UTM tagging across campaigns will unlock attribution."); return { observations: obs, actions: act }; }
    const top = ra.by_source[0];
    const totalRev = ra.by_source.reduce((a, r) => a + Number(r.revenue || 0), 0);
    if (totalRev > 0) {
      obs.push(`Top revenue source is "${top.source}" — $${Number(top.revenue).toLocaleString()} (${Math.round(Number(top.revenue) * 100 / totalRev)}% of attributed revenue).`);
      if (Number(top.revenue) > totalRev * 0.6) act.push("You're concentrated in one channel — diversify before that channel changes algorithms or pricing.");
    }
    return { observations: obs, actions: act };
  }, [ra]);

  const leadGenArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!lg) return { observations: obs, actions: act };
    if (lg.total_leads === 0) { obs.push("No leads pulled yet — configure a Search Profile to start lead generation."); return { observations: obs, actions: act }; }
    const acceptRate = lg.total_leads ? Math.round((lg.accepted / lg.total_leads) * 100) : 0;
    obs.push(`Pulled ${lg.total_leads} leads, accepted ${lg.accepted} (${acceptRate}%). ${lg.hot} were scored Hot.`);
    if (lg.from_cache > 0) obs.push(`${lg.from_cache} of those came from the shared platform cache (free for you, paid by the original enricher).`);
    if (lg.revenue_from_leads > 0) obs.push(`Closed-won deals from lead-generated contacts: $${Number(lg.revenue_from_leads).toLocaleString()}.`);
    if (acceptRate < 20 && lg.total_leads > 10) act.push("Acceptance rate is low — tighten your search profile (smaller geos, fewer categories) for higher-fit leads.");
    return { observations: obs, actions: act };
  }, [lg]);

  const growthArgus = useMemo(() => {
    const obs: string[] = []; const act: string[] = [];
    if (!gv) return { observations: obs, actions: act };
    obs.push(`Growth Velocity score: ${gv.growth_velocity_score} / 100 (composite over the last ${gv.window_days} days).`);
    if (gv.new_contacts === 0) act.push("No new contacts captured this window — add a lead capture form to your highest-traffic pages.");
    if (gv.deals_won > 0) obs.push(`Closed-won: ${gv.deals_won} deals worth $${Number(gv.revenue_won).toLocaleString()}.`);
    if (gv.active_automations === 0) act.push("No active automations — even a single welcome sequence captures revenue you currently miss.");
    return { observations: obs, actions: act };
  }, [gv]);

  return (
    <SparkPageShell title="Insights" subtitle="7 cross-platform insight categories" error={error} loading={loading}>
      {/* v2 banner — current rules are basic heuristics; full IA Intelligence Layer in v2 */}
      <div className="rounded-md bg-gradient-to-r from-lime-50 to-emerald-50 border border-emerald-200 px-4 py-2.5 mb-4 flex items-center gap-2 text-xs">
        <Sparkles className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
        <span className="text-emerald-900">
          <strong>Preview.</strong> Full IA Intelligence Layer launches in v2 with regression
          modeling, forecasting, and prescriptive analytics across 100+ rules per category.
        </span>
      </div>

      <div className="space-y-4">
        {/* 1. Customer Health */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">1. Customer Health</span></div>
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {ch?.tier_distribution.map(t => (
                <div key={t.tier || "none"} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="text-xs uppercase text-gray-500">Tier {t.tier || "—"}</div>
                  <div className="text-2xl font-semibold mt-1">{t.n}</div>
                </div>
              ))}
            </div>
            <ArgusInsightBox domainLabel="SPARK · Customer Health" observations={customerHealthArgus.observations} actions={customerHealthArgus.actions} />
          </div>
        </section>

        {/* 2. Communication Performance */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">2. Communication Performance</span></div>
          <div>
            {cp && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Sent" value={cp.totals.sent} />
                <Stat label="Open rate" value={`${cp.open_rate}%`} accent="emerald" />
                <Stat label="Click rate" value={`${cp.click_rate}%`} accent="blue" />
                <Stat label="Bounce rate" value={`${cp.bounce_rate}%`} accent={cp.bounce_rate > 3 ? "rose" : "gray"} />
              </div>
            )}
            <ArgusInsightBox domainLabel="SPARK · Communication" observations={commPerfArgus.observations} actions={commPerfArgus.actions} />
          </div>
        </section>

        {/* 3. Pipeline Velocity */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">3. Pipeline Velocity</span></div>
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {pv?.win_loss.map(w => (
                <Stat key={w.status} label={w.status} value={`${w.n} · $${Number(w.total_value).toLocaleString()}`} accent={w.status === "won" ? "emerald" : w.status === "lost" ? "rose" : "gray"} />
              ))}
            </div>
            <ArgusInsightBox domainLabel="SPARK · Pipeline" observations={pipelineArgus.observations} actions={pipelineArgus.actions} />
          </div>
        </section>

        {/* 4. Reputation */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">4. Reputation</span></div>
          <div>
            {rep && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="NPS" value={rep.nps.score} accent={rep.nps.score >= 50 ? "emerald" : rep.nps.score >= 0 ? "amber" : "rose"} />
                <Stat label="Promoters" value={rep.nps.promoters} accent="emerald" />
                <Stat label="Detractors" value={rep.nps.detractors} accent="rose" />
                <Stat label="Reviews" value={rep.reviews_by_source.reduce((a, r) => a + r.n, 0)} />
              </div>
            )}
            <ArgusInsightBox domainLabel="SPARK · Reputation" observations={reputationArgus.observations} actions={reputationArgus.actions} />
          </div>
        </section>

        {/* 5. Revenue Attribution */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">5. Revenue Attribution</span></div>
          <div>
            <table className="data-table text-sm mb-4">
              <thead><tr><th>Source</th><th>Deals</th><th>Revenue</th></tr></thead>
              <tbody>
                {ra?.by_source.slice(0, 8).map(s => (
                  <tr key={s.source}><td className="capitalize">{s.source}</td><td>{s.deals}</td><td>${Number(s.revenue).toLocaleString()}</td></tr>
                ))}
                {(!ra || ra.by_source.length === 0) && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No attributed revenue yet</td></tr>}
              </tbody>
            </table>
            <ArgusInsightBox domainLabel="SPARK · Revenue" observations={revenueArgus.observations} actions={revenueArgus.actions} />
          </div>
        </section>

        {/* 6. Lead Gen ROI */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">6. Lead Gen ROI</span></div>
          <div>
            {lg && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Total leads" value={lg.total_leads} />
                <Stat label="Accepted" value={lg.accepted} accent="emerald" />
                <Stat label="From cache" value={lg.from_cache} accent="blue" />
                <Stat label="Hot" value={lg.hot} accent="rose" />
                <Stat label="Avg score" value={Number(lg.avg_score || 0).toFixed(1)} />
                <Stat label="Deals won" value={lg.deals_from_leads} accent="emerald" />
                <Stat label="Revenue" value={`$${Number(lg.revenue_from_leads || 0).toLocaleString()}`} accent="emerald" />
              </div>
            )}
            <ArgusInsightBox domainLabel="SPARK · Lead Gen" observations={leadGenArgus.observations} actions={leadGenArgus.actions} />
          </div>
        </section>

        {/* 7. Growth Velocity */}
        <section className="spark-mini-card">
          <div className="spark-mini-card-header"><span className="spark-mini-card-title">7. Growth Velocity</span></div>
          <div>
            {gv && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Velocity score" value={`${gv.growth_velocity_score} / 100`} accent="emerald" />
                <Stat label="New contacts" value={gv.new_contacts} />
                <Stat label="Deals won" value={gv.deals_won} accent="emerald" />
                <Stat label="Revenue won" value={`$${Number(gv.revenue_won || 0).toLocaleString()}`} />
                <Stat label="Active automations" value={gv.active_automations} accent="blue" />
                <Stat label="Posts published" value={gv.posts_published} />
              </div>
            )}
            <ArgusInsightBox domainLabel="SPARK · Growth" observations={growthArgus.observations} actions={growthArgus.actions} />
          </div>
        </section>
      </div>
    </SparkPageShell>
  );
}

function Stat({ label, value, accent = "gray" }: { label: string; value: string | number; accent?: "gray" | "emerald" | "amber" | "rose" | "blue" }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    blue: "text-blue-600",
    gray: "text-gray-900",
  };
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="text-xs uppercase text-gray-500 capitalize">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${colors[accent]}`}>{value}</div>
    </div>
  );
}

export default SparkInsightsPage;
