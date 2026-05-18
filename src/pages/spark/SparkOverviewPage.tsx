import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Mail, MessageSquare, Users, Target, TrendingUp, Briefcase,
  Heart, Sparkles, Megaphone, Calendar as CalendarIcon, FileText, Star,
  Activity, ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { TimeRangeSelector, rangeForPreset } from "../../components/oliver/ui";
import { ArgusInsightBox } from "../../components/oliver/ArgusInsightBox";
import { Sparkline } from "../../components/iainsights/Sparkline";

// ─ Types ──────────────────────────────────────────────────────────────────────
interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
  };
}
interface Contact {
  id: number; first_name: string; last_name: string; email: string;
  phone: string; company: string; contact_intelligence_tier?: string | null;
  created_at: string;
}
interface GrowthVelocity {
  growth_velocity_score: number; new_contacts: number; total_contacts: number;
  deals_won: number; revenue_won: number; active_automations: number; posts_published: number;
  window_days: number;
}
interface CommPerf {
  totals: { sent: number; opened: number; clicked: number; bounced: number };
  by_type: { type: string; sent: number; opened: number; clicked: number }[];
  open_rate: number; click_rate: number; bounce_rate: number;
}
interface NpsSummary { nps: number; total: number; promoters: number; passives: number; detractors: number; }
interface LeadRoi { total_leads: number; accepted: number; hot: number; avg_score: number; }
interface PipelineFunnel { stage_name: string; deal_count: number; total_value: number; }
interface PriorScores { data: Record<string, { score: number; periodEnd: string }> }
interface RealtimeData {
  today?: { emails_today?: number; sms_today?: number; form_submissions_today?: number; new_contacts_today?: number; alerts_today?: number };
  open_alerts?: Array<{ severity: string; n: number }>;
}

const TIER_COLORS = { X: "#10b981", Y: "#3b82f6", Z: "#94a3b8" } as const;

export function SparkOverviewPage() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [growth, setGrowth] = useState<GrowthVelocity | null>(null);
  const [comm, setComm] = useState<CommPerf | null>(null);
  const [nps, setNps] = useState<NpsSummary | null>(null);
  const [leads, setLeads] = useState<LeadRoi | null>(null);
  const [funnel, setFunnel] = useState<PipelineFunnel[]>([]);
  const [trendScore, setTrendScore] = useState<number | null>(null);
  const [trendHistory, setTrendHistory] = useState<Array<{ period_end: string; score: number }>>([]);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => rangeForPreset("last_30_days"));
  const days = useMemo(() => {
    if (!range.fromISO || !range.toISO) return 365;
    return Math.max(1, Math.round((new Date(range.toISO).getTime() - new Date(range.fromISO).getTime()) / 86400000));
  }, [range]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      // best-effort: any endpoint failure degrades gracefully (card shows "—")
      const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
        try { return await p; } catch { return null; }
      };
      const [u, c, g, cp, n, l, ps, th, rt] = await Promise.all([
        safe(get<UsageResponse>("/api/v1/usage")),
        safe(get<{ data: Contact[] }>("/api/v1/contacts?limit=5")),
        safe(get<{ data: GrowthVelocity }>(`/api/v1/insights/growth-velocity?days=${days}`)),
        safe(get<{ data: CommPerf }>(`/api/v1/insights/communication-performance?days=${days}`)),
        safe(get<{ data: NpsSummary }>(`/api/v1/nps/summary?days=${days}`)),
        safe(get<{ data: LeadRoi }>("/api/v1/insights/lead-gen-roi")),
        // v6.7 — IA Insights cross-page summary fetch
        safe(get<PriorScores>(`/api/v1/ia-insights/prior-scores?product=spark&beforeDate=${new Date(Date.now() + 86400_000).toISOString().slice(0,10)}`)),
        safe(get<{ data: Array<{ period_end: string; score: number }> }>(`/api/v1/ia-insights/score-history?product=spark&reportKey=presence&limit=${Math.min(36, Math.max(3, Math.ceil(days / 30)))}`)),
        safe(get<RealtimeData>("/api/v1/usage/realtime?minutes=60")),
      ]);
      // pipelines → if any pipeline exists, pull the first one's funnel
      let f: PipelineFunnel[] = [];
      const pipes = await safe(get<{ data: { id: number; is_default?: boolean }[] }>("/api/v1/pipelines"));
      if (pipes?.data?.length) {
        const def = pipes.data.find(p => p.is_default) || pipes.data[0];
        const ff = await safe(get<{ data: PipelineFunnel[] }>(`/api/v1/deals/funnel/${def.id}`));
        f = ff?.data || [];
      }
      if (!cancelled) {
        setUsage(u?.data || null);
        setContacts(c?.data || []);
        setGrowth(g?.data || null);
        setComm(cp?.data || null);
        setNps(n?.data || null);
        setLeads(l?.data || null);
        setFunnel(f);
        // v6.7 — IA Insights at-a-glance state
        setTrendScore(ps?.data?.presence?.score ?? null);
        setTrendHistory((th?.data || []).filter((row) => row && row.period_end));
        setRealtime(rt || null);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready, days]);

  // ─ Computed ────────────────────────────────────────────────────────────────
  const usageBars = useMemo(() => usage ? [
    { label: "Emails", used: usage.usage.emails_sent, limit: usage.limits.emails_per_month, icon: Mail, accent: "blue" },
    { label: "SMS", used: usage.usage.sms_sent, limit: usage.limits.sms_per_month, icon: MessageSquare, accent: "purple" },
    { label: "Contacts", used: usage.usage.contacts_count, limit: usage.limits.contacts_max, icon: Users, accent: "emerald" },
    { label: "Leads", used: usage.usage.leads_issued, limit: 50, icon: Target, accent: "amber" },
  ] : [], [usage]);

  const tierDist = useMemo(() => {
    const counts: Record<string, number> = { X: 0, Y: 0, Z: 0, none: 0 };
    for (const c of contacts) {
      const t = c.contact_intelligence_tier || "none";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
  }, [contacts]);

  const commChart = useMemo(() => {
    if (!comm?.by_type) return [];
    return comm.by_type.map(t => ({
      type: t.type,
      Sent: t.sent || 0,
      Opened: t.opened || 0,
      Clicked: t.clicked || 0,
    }));
  }, [comm]);

  // ARGUS observations — synthesized from the metrics we have
  const argus = useMemo(() => {
    const obs: string[] = [];
    const act: string[] = [];
    if (growth) {
      if (growth.growth_velocity_score >= 75) obs.push(`Growth velocity is strong at ${growth.growth_velocity_score}/100 — keep momentum.`);
      else if (growth.growth_velocity_score >= 40) obs.push(`Growth velocity is moderate at ${growth.growth_velocity_score}/100.`);
      else obs.push(`Growth velocity is low at ${growth.growth_velocity_score}/100 — most levers are idle.`);
      if (growth.new_contacts === 0) act.push("No new contacts in 30 days — add a lead capture form to your highest-traffic page.");
      if (growth.active_automations === 0) act.push("No active automations — a single welcome sequence captures revenue you're missing.");
    }
    if (comm) {
      if (comm.bounce_rate > 3 && comm.totals.sent > 50) {
        obs.push(`Email bounce rate is ${comm.bounce_rate}% — above the 2% threshold for healthy sender reputation.`);
        act.push("Run a list-cleaning pass and suppress hard-bounced addresses.");
      }
      if (comm.open_rate > 0 && comm.open_rate < 15 && comm.totals.sent > 200) {
        obs.push(`Open rate is ${comm.open_rate}% — well below the 22% small-business benchmark.`);
        act.push("Try the AI Writer for fresh subject lines; verify from-name/email isn't being filtered as suspicious.");
      }
    }
    if (nps && nps.total >= 5) {
      if (nps.nps >= 50) obs.push(`NPS is ${nps.nps} (${nps.promoters} promoters) — route them into the review-request flow.`);
      else if (nps.nps < 0) {
        obs.push(`NPS is ${nps.nps} — more detractors than promoters this quarter.`);
        act.push("Reach out personally to recent detractors before they leave public reviews.");
      }
    }
    if (leads && leads.total_leads > 0) {
      const acceptRate = Math.round((leads.accepted / leads.total_leads) * 100);
      if (acceptRate < 20 && leads.total_leads > 10) act.push(`Lead acceptance is ${acceptRate}% — tighten your Search Profile for higher-fit leads.`);
    }
    return { observations: obs, actions: act };
  }, [growth, comm, nps, leads]);

  return (
    <OliverPageWrapper title="SPARK Overview" subtitle="Your marketing + sales command center" error={error} loading={loading}>
      <div className="p-6 space-y-6">

        <div className="flex justify-end">
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>

        {/* ── IA INSIGHTS AT A GLANCE (v6.7) ───────────────────────────── */}
        <IAInsightsGlance
          trendScore={trendScore}
          trendHistory={trendHistory}
          realtime={realtime}
        />

        {/* ── HERO STATS ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroStat
            label="Growth velocity"
            value={growth ? `${growth.growth_velocity_score}` : "—"}
            sub={growth ? "/ 100 (30-day composite)" : ""}
            icon={Sparkles}
            accent={growth && growth.growth_velocity_score >= 60 ? "emerald" : growth && growth.growth_velocity_score >= 30 ? "amber" : "rose"}
            href="/app/services/spark_insights"
          />
          <HeroStat
            label="New contacts"
            value={growth ? growth.new_contacts.toLocaleString() : "—"}
            sub={growth ? `${growth.total_contacts.toLocaleString()} total` : ""}
            icon={Users} accent="blue"
            href="/app/services/spark_contacts"
          />
          <HeroStat
            label="Deals won (30d)"
            value={growth ? growth.deals_won.toLocaleString() : "—"}
            sub={growth ? `$${Number(growth.revenue_won).toLocaleString()}` : ""}
            icon={Briefcase} accent="emerald"
            href="/app/services/spark_deals"
          />
          <HeroStat
            label="NPS"
            value={nps ? String(nps.nps) : "—"}
            sub={nps ? `${nps.total} responses` : ""}
            icon={Heart}
            accent={nps && nps.nps >= 50 ? "emerald" : nps && nps.nps < 0 ? "rose" : "amber"}
            href="/app/services/spark_nps"
          />
        </div>

        {/* ── USAGE BARS ────────────────────────────────────────────────── */}
        <Card title="Tier usage" right={usage ? <span className="text-xs text-gray-500 capitalize">{usage.tier} tier</span> : null}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-1">
            {usageBars.map(b => {
              const p = b.limit > 0 ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 0;
              const Icon = b.icon;
              return (
                <div key={b.label} className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-gray-500" />
                    <span className="text-xs uppercase text-gray-500">{b.label}</span>
                  </div>
                  <div className="text-lg font-semibold">{b.used.toLocaleString()} <span className="text-xs text-gray-400 font-normal">/ {b.limit.toLocaleString()}</span></div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${p}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{p}% used</div>
                </div>
              );
            })}
            {usageBars.length === 0 && <div className="text-sm text-gray-500 col-span-4 text-center py-8">Loading usage…</div>}
          </div>
        </Card>

        {/* ── CHARTS ROW ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Communication performance */}
          <Card title={`Communication · ${range.label}`} className="lg:col-span-2" right={comm ? (
            <div className="flex gap-4 text-xs text-gray-500">
              <span><b className="text-emerald-600">{comm.open_rate}%</b> open</span>
              <span><b className="text-blue-600">{comm.click_rate}%</b> click</span>
              <span><b className={comm.bounce_rate > 3 ? "text-rose-600" : "text-gray-700"}>{comm.bounce_rate}%</b> bounce</span>
            </div>
          ) : null}>
            <div className="h-48">
              {commChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Sent" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Opened" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Clicked" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">No campaign sends yet this period</div>
              )}
            </div>
          </Card>

          {/* Contact intelligence tier */}
          <Card title="Contact tiers (recent)">
            <div className="h-48">
              {tierDist.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tierDist} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label={{ fontSize: 11 }}>
                      {tierDist.map((d) => (
                        <Cell key={d.name} fill={TIER_COLORS[d.name as keyof typeof TIER_COLORS] || "#cbd5e1"} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">No contact tiers scored yet</div>
              )}
            </div>
          </Card>
        </div>

        {/* ── PIPELINE FUNNEL + LEAD GEN ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Pipeline funnel" className="lg:col-span-2" right={<Link to="/app/services/spark_pipelines" className="text-xs text-blue-600 inline-flex items-center gap-1">Manage <ArrowUpRight className="h-3 w-3" /></Link>}>
            {funnel.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-8">No pipeline configured yet. <Link className="text-blue-600" to="/app/services/spark_pipelines">Create one →</Link></div>
            ) : (
              <div className="space-y-2 p-1">
                {funnel.map((s, i) => {
                  const max = Math.max(...funnel.map(x => x.deal_count), 1);
                  const w = Math.round((s.deal_count / max) * 100);
                  return (
                    <div key={s.stage_name + i}>
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-0.5">
                        <span className="font-medium">{s.stage_name}</span>
                        <span>{s.deal_count} · ${Number(s.total_value || 0).toLocaleString()}</span>
                      </div>
                      <div className="h-3 rounded-md bg-gray-100 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Lead Gen" right={<Link to="/app/services/spark_leads" className="text-xs text-blue-600 inline-flex items-center gap-1">Inbox <ArrowUpRight className="h-3 w-3" /></Link>}>
            {leads && leads.total_leads > 0 ? (
              <div className="space-y-2">
                <Stat label="Total pulled" value={leads.total_leads} />
                <Stat label="Accepted" value={leads.accepted} accent="emerald" />
                <Stat label="Hot leads" value={leads.hot} accent="rose" />
                <Stat label="Avg score" value={Number(leads.avg_score || 0).toFixed(1)} />
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-8">No leads pulled yet. <Link className="text-blue-600" to="/app/services/spark_search_profiles">Configure profile →</Link></div>
            )}
          </Card>
        </div>

        {/* ── ARGUS INSIGHT BOX ─────────────────────────────────────────── */}
        {(argus.observations.length > 0 || argus.actions.length > 0) && (
          <ArgusInsightBox domainLabel="SPARK · Overview" observations={argus.observations} actions={argus.actions} />
        )}

        {/* ── QUICK ACTIONS + RECENT CONTACTS ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Quick actions">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <QuickAction to="/app/services/spark_contacts" icon={Users} label="Add contact" />
              <QuickAction to="/app/services/spark_campaigns" icon={Megaphone} label="New campaign" />
              <QuickAction to="/app/services/spark_deals" icon={Briefcase} label="Add deal" />
              <QuickAction to="/app/services/spark_newsletter" icon={FileText} label="Draft newsletter" />
              <QuickAction to="/app/services/spark_ai_writer" icon={Sparkles} label="AI Writer" />
              <QuickAction to="/app/services/spark_calendar" icon={CalendarIcon} label="Content calendar" />
            </div>
          </Card>

          <Card title="Recent contacts" className="lg:col-span-2" right={<Link to="/app/services/spark_contacts" className="text-xs text-blue-600 inline-flex items-center gap-1">All <ArrowUpRight className="h-3 w-3" /></Link>}>
            {contacts.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-8">No contacts yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-1 pr-3">Name</th>
                    <th className="text-left py-1 pr-3">Email</th>
                    <th className="text-left py-1 pr-3">Company</th>
                    <th className="text-left py-1">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 5).map(c => (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-3 font-medium">{c.first_name} {c.last_name}</td>
                      <td className="py-1.5 pr-3 text-gray-600 truncate max-w-[180px]">{c.email}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{c.company || "—"}</td>
                      <td className="py-1.5">{c.contact_intelligence_tier
                        ? <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${c.contact_intelligence_tier === "X" ? "bg-emerald-100 text-emerald-700" : c.contact_intelligence_tier === "Y" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{c.contact_intelligence_tier}</span>
                        : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* ── ACTIVITY FOOTER ──────────────────────────────────────────── */}
        <Card title="Engagement signals">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-1">
            <Stat label="Active automations" value={growth?.active_automations ?? "—"} accent="blue" icon={Activity} />
            <Stat label="Posts published (30d)" value={growth?.posts_published ?? "—"} accent="amber" icon={Megaphone} />
            <Stat label="Promoters" value={nps?.promoters ?? "—"} accent="emerald" icon={Star} />
            <Stat label="Detractors" value={nps?.detractors ?? "—"} accent="rose" icon={Heart} />
          </div>
        </Card>
      </div>
    </OliverPageWrapper>
  );
}

// ─ Helpers ────────────────────────────────────────────────────────────────────

interface CardProps {
  title: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}
function Card({ title, right, className = "", children }: CardProps) {
  return (
    <div className={`rounded-xl bg-white ring-1 ring-gray-200 shadow-sm ${className}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

type Accent = "emerald" | "amber" | "rose" | "blue" | "purple" | "gray";
const ACCENT_TEXT: Record<Accent, string> = {
  emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600",
  blue: "text-blue-600", purple: "text-purple-600", gray: "text-gray-900",
};
const ACCENT_BG: Record<Accent, string> = {
  emerald: "bg-emerald-50", amber: "bg-amber-50", rose: "bg-rose-50",
  blue: "bg-blue-50", purple: "bg-purple-50", gray: "bg-gray-50",
};

interface HeroStatProps {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent; href: string;
}
function HeroStat({ label, value, sub, icon: Icon, accent, href }: HeroStatProps) {
  return (
    <Link to={href} className="block rounded-xl bg-white ring-1 ring-gray-200 hover:ring-gray-300 hover:shadow-md transition p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase text-gray-500">{label}</div>
          <div className={`text-3xl font-semibold mt-1 ${ACCENT_TEXT[accent]}`}>{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
        </div>
        <div className={`p-2 rounded-lg ${ACCENT_BG[accent]}`}>
          <Icon className={`h-5 w-5 ${ACCENT_TEXT[accent]}`} />
        </div>
      </div>
    </Link>
  );
}

interface StatProps {
  label: string;
  value: string | number;
  accent?: Accent;
  icon?: React.ComponentType<{ className?: string }>;
}
function Stat({ label, value, accent = "gray", icon: Icon }: StatProps) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-md p-2 bg-white">
      {Icon && <Icon className={`h-4 w-4 ${ACCENT_TEXT[accent]}`} />}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase text-gray-500 truncate">{label}</div>
        <div className={`text-lg font-semibold ${ACCENT_TEXT[accent]}`}>{value}</div>
      </div>
    </div>
  );
}

interface QuickActionProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}
function QuickAction({ to, icon: Icon, label }: QuickActionProps) {
  return (
    <Link to={to} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition">
      <Icon className="h-4 w-4 text-gray-500" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

// ─ IA Insights at-a-glance (v6.7) ──────────────────────────────────────────
function IAInsightsGlance({
  trendScore, trendHistory, realtime,
}: {
  trendScore: number | null;
  trendHistory: Array<{ period_end: string; score: number }>;
  realtime: RealtimeData | null;
}) {
  const score = trendScore ?? 0;
  const band = score >= 70 ? "green" : score >= 50 ? "amber" : score > 0 ? "red" : "gray";
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", gray: "#94A3B8" } as const)[band];
  const openAlerts = (realtime?.open_alerts || []).reduce((s, a) => s + (a.n || 0), 0);
  const t = realtime?.today || {};
  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-orange-50 to-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#EF6C33]" />
          <span className="font-semibold text-slate-900 text-sm">IA Insights at a glance</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/services/spark_ia_insights_trends" className="text-xs text-[#EF6C33] hover:underline flex items-center gap-0.5">
            Open Trends <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link to="/app/services/spark_realtime_metrics" className="text-xs text-slate-600 hover:underline flex items-center gap-0.5">
            Real-time <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Trend score */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">SPARK Trend Score</div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold tabular-nums" style={{ color: bandColor }}>
              {trendScore != null ? trendScore : "—"}
            </div>
            {trendHistory.length > 1 && (
              <div className="flex-1 min-w-0">
                <Sparkline data={trendHistory} color={bandColor} width={80} height={24} showBands={false} />
              </div>
            )}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {trendScore != null ? `Band: ${band}` : "No data yet"}
          </div>
        </div>
        {/* Today's emails */}
        <RealtimeTile label="Emails today" value={t.emails_today || 0} color="#2563EB" />
        {/* Today's SMS */}
        <RealtimeTile label="SMS today" value={t.sms_today || 0} color="#0EA5E9" />
        {/* New contacts today */}
        <RealtimeTile label="New contacts" value={t.new_contacts_today || 0} color="#EF6C33" />
        {/* Open anomaly alerts */}
        <Link
          to="/app/services/spark_anomaly_alerts"
          className={`block bg-white rounded-lg border p-3 hover:border-amber-300 transition-colors ${openAlerts > 0 ? "border-amber-300" : "border-gray-200"}`}
        >
          <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">Open alerts</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: openAlerts > 0 ? "#DC2626" : "#94A3B8" }}>
            {openAlerts}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {openAlerts > 0 ? "Click to review" : "All clear"}
          </div>
        </Link>
      </div>
    </div>
  );
}

function RealtimeTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] text-slate-400 mt-0.5">Today (UTC midnight)</div>
    </div>
  );
}

export default SparkOverviewPage;
