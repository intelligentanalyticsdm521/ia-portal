import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { EmbeddedReportChart, type ReportSeriesResponse } from "../../components/reporting/EmbeddedReportChart";
import { SparkCampaignComposerModal } from "../../components/spark/SparkCampaignComposerModal";

interface Campaign {
  id: number;
  name: string;
  // DB column is `type`, not `channel` — V1 list page was filtering by a
  // non-existent field and showed "No campaigns yet" even though create
  // worked.
  type: "email" | "sms";
  status: string;
  // List endpoint returns recipient_count only; opens/sent come from
  // /campaigns/:id/stats. Don't reference total_recipients / total_sent /
  // total_opened on a list row — those are undefined and would crash render.
  recipient_count?: number;
  sent_at: string | null;
  created_at: string;
}

export function SparkCampaignsPage() {
  const { get, ready } = useSparkApi();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"email" | "sms">("email");
  // F-90 — dead "Create Campaign" button now opens the composer modal.
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await get<{ data: Campaign[] }>("/api/v1/campaigns");
      setCampaigns(raw.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const filtered = campaigns.filter((c) => c.type === tab);

  // v7.2 — Embedded campaign performance chart. Fetcher closes over the
  // current tab (email vs sms) so toggling the tab refreshes the chart.
  const fetchPerf = useCallback(async (days: number): Promise<ReportSeriesResponse> => {
    const channel = tab; // "email" | "sms"
    const r = await get<{ data: { totals: any; series: any[] } }>(`/api/v1/campaigns/perf?days=${days}&channel=${channel}`);
    return { totals: r.data?.totals || {}, series: r.data?.series || [] };
  }, [get, tab]);

  const perfMetrics = useMemo(() => ([
    { key: "sends",   label: "Sends",   color: "#1A7DB5" },
    { key: "opens",   label: "Opens",   color: "#16A34A" },
    { key: "clicks",  label: "Clicks",  color: "#EAB308" },
    { key: "bounces", label: "Bounces", color: "#DC2626", bars: true },
  ]), []);

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      scheduled: "bg-blue-100 text-blue-700",
      sending: "bg-amber-100 text-amber-700",
      sent: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status.toLowerCase()] || "bg-gray-100 text-gray-600"}`}>
        {status}
      </span>
    );
  }

  return (
    <SparkPageShell title="Campaigns" subtitle="Email and SMS campaign management" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        {/* v7.2 — Embedded Campaign Performance from the IA Insights Trends
            engine. Date toggles + "View full report" link to the full
            Campaign Performance trend on the SPARK Trends page. */}
        <EmbeddedReportChart
          title="Campaign performance"
          subtitle={`Daily engagement for ${tab.toUpperCase()} campaigns. Toggle date range or open the full IA Insights report.`}
          fetcher={fetchPerf}
          metrics={perfMetrics}
          fullReportRoute="/app/services/spark_ia_insights_trends"
          accent="#EF6C33"
          initialRange="last30"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["email", "sms"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t === "email" ? "Email" : "SMS"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setComposerOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New campaign
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Open Rate</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-slate-600">{(c.recipient_count ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">—</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No {tab} campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SparkCampaignComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => { setComposerOpen(false); load(); }}
      />
    </SparkPageShell>
  );
}
