import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
// The email-send half of the shared 60/75/90 banner (LOCKED 2026-09-04) — the
// same component the contacts page and the Lead Inbox use.
import { SparkUsageCapacityBanner } from "../../components/spark/SparkCapacityBanner";
import { EmbeddedReportChart, type ReportSeriesResponse } from "../../components/reporting/EmbeddedReportChart";
import { SparkCampaignComposerModal } from "../../components/spark/SparkCampaignComposerModal";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';

/** Open rate from the campaign's own counters. Shows "—" only when nothing
 *  has actually been sent yet, rather than for every row. */
function openRate(c: { total_sent?: number; total_opened?: number }): string {
  const sent = c.total_sent ?? 0;
  if (!sent) return "—";
  return `${Math.round(((c.total_opened ?? 0) / sent) * 100)}%`;
}

interface Campaign {
  id: number;
  name: string;
  // DB column is `type`, not `channel` — V1 list page was filtering by a
  // non-existent field and showed "No campaigns yet" even though create
  // worked.
  type: "email" | "sms";
  status: string;
  // The list endpoint SELECTs c.*, so the campaign counters DO come back on
  // every row (verified 2026-07-28 against the live endpoint). An older
  // comment here claimed otherwise, which is why the Open Rate column was
  // hardcoded to an em-dash and never showed a number.
  recipient_count?: number;
  total_sent?: number;
  total_opened?: number;
  total_clicked?: number;
  sent_at: string | null;
  created_at: string;
}

export function SparkCampaignsPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('spark');

  const { get, ready } = useSparkApi();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"email" | "sms">("email");
  // F-90 — dead "Create Campaign" button now opens the composer modal.
  const [composerOpen, setComposerOpen] = useState(false);
  // 2026-06-20 — click a row to open the composer in edit mode. Brandon
  // flagged the campaign list rows were dead clicks: drafts couldn't be
  // re-opened to refine or send. editCampaignId drives the modal — null
  // when creating, set when editing/viewing an existing campaign.
  const [editCampaignId, setEditCampaignId] = useState<number | null>(null);
  /**
   * Id of the campaign created in this session, used to mark its row for the
   * walkthrough.
   *
   * The first attempt pinned the walkthrough to a campaign NAMED "Test
   * campaign", which broke the moment Brandon typed a different name — the
   * step just reported "I can't find that control". Keying on the id the
   * composer hands back works whatever the user calls it, and still can't
   * point at a record they didn't just make.
   */
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);

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
      <SparkUsageCapacityBanner metric="emails" className="mb-3" />
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_campaigns', label: 'Campaign results' },
        { id: 'spark_send_times', label: 'Best send times' },
        { id: 'spark_bounce_domains', label: 'Bounces by domain' },
      ]} />
      <div className="p-6 space-y-4">
        {/* v7.2 — Embedded Campaign Performance from the IA Insights Trends
            engine. Date toggles + "View full report" link to the full
            Campaign Performance trend on the SPARK Trends page. */}
        {/* compact: this page exists to work your campaign LIST — the chart is
            context. Full size pushed the table below the fold. */}
        <EmbeddedReportChart
          title="Campaign performance"
          subtitle={`Daily engagement for ${tab.toUpperCase()} campaigns`}
          fetcher={fetchPerf}
          metrics={perfMetrics}
          fullReportRoute="/app/services/spark_ia_insights_trends"
          accent="#EF6C33"
          initialRange="last30"
          compact
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
          <div className="flex items-center gap-2">
            {/* Templates is a campaign tool, not a top-level destination — the
                map moves it out of nav and opens it from here. Without this
                link, hiding the nav item would strand the library. */}
            <Link
              to="/app/services/spark_templates"
              data-tour="campaign-templates"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Templates
            </Link>
            <button
              data-tour="new-campaign"
              onClick={() => { setEditCampaignId(null); setComposerOpen(true); }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + New campaign
            </button>
          </div>
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
                <tr
                  key={c.id}
                  // Walkthrough hook: ONLY the draft this session just created.
                  // Not "the first draft" (which could be someone else's work)
                  // and not name-matched (which broke when the user typed their
                  // own name). If the save failed there's no marked row, so the
                  // runner stops rather than pointing at the wrong campaign.
                  data-tour={c.status === "draft" && c.id === justCreatedId ? "campaign-open" : undefined}
                  onClick={() => { setEditCampaignId(c.id); setComposerOpen(true); }}
                  className="hover:bg-gray-50 cursor-pointer"
                  title={c.status === "draft" ? "Open to edit + send" : "Open to view"}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-slate-600">{(c.recipient_count ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600" data-tour="campaign-open-rate">{openRate(c)}</td>
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
        onClose={() => { setComposerOpen(false); setEditCampaignId(null); }}
        onCreated={(id) => {
          // Remember the new draft's id so its row carries the walkthrough
          // hook. Deleting it clears the mark (the row is gone), and editing
          // an existing draft passes its own id, which is harmless.
          if (id) setJustCreatedId(id);
          setComposerOpen(false);
          setEditCampaignId(null);
          load();
        }}
        editCampaignId={editCampaignId}
      />
    </SparkPageShell>
  );
}
