// SocialReportPage — the "View full report →" landing (re-cut §1, v1).
//
// First-pass report page: totals + a daily trend series from the existing
// analytics endpoints. Per the locked re-cut, THIS surface is where the deep
// social reporting grows (post drift scores → Brand Health live here too,
// eventually), feeding toward IA Insights — deliberately NOT a new
// A/B-test product. Not a nav item; reached from Social Content.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

interface SummaryData {
  posts: { published: number; scheduled: number; draft: number; failed: number; total: number };
  impressions: number; reach: number; engagement: number;
  avg_voice_score: number | null;
  avg_engagement_rate: number | null;
}

interface TrendPoint {
  metric_date: string;
  impressions: number; reach: number; likes: number; comments: number;
  shares: number; clicks: number; saves: number; engagement: number;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

export function SocialReportPage() {
  const sparkApi = useSparkApi();
  const navigate = useNavigate();
  const [days, setDays] = useState<30 | 90>(30);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [s, t] = await Promise.all([
          sparkApi.get<{ data: SummaryData }>(`/api/v1/my-brand/social/analytics/summary?days=${days}`),
          sparkApi.get<{ data: { series: TrendPoint[] } }>(`/api/v1/my-brand/social/analytics/trends?days=${days}`),
        ]);
        if (cancelled) return;
        setSummary(s?.data || null);
        setSeries(t?.data?.series || []);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sparkApi, days]);

  const maxEngagement = Math.max(1, ...series.map((p) => Number(p.engagement || 0)));

  return (
    <SparkPageShell
      title="Social Report"
      subtitle="Totals and daily trends across your connected platforms. Deep reporting grows here."
      loading={loading}
      error={error}
      actions={
        <button type="button" className="spark-btn spark-btn-secondary spark-btn-sm"
          onClick={() => navigate("/app/services/my_brand_social_content")}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to Social Content
        </button>
      }
      filters={
        <div className="flex items-center gap-2">
          {[30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d as 30 | 90)}
              className={`spark-pill ${days === d ? "spark-pill-active" : ""}`}>
              Last {d} days
            </button>
          ))}
        </div>
      }
    >
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
          {[
            ["Posts published", summary.posts.published],
            ["Impressions", summary.impressions],
            ["Reach", summary.reach],
            ["Engagement", summary.engagement],
            ["Avg voice score", summary.avg_voice_score == null ? null : Number(summary.avg_voice_score).toFixed(2)],
            ["Avg engagement rate", summary.avg_engagement_rate == null ? null : `${Number(summary.avg_engagement_rate).toFixed(2)}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">{label}</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{value == null ? "—" : typeof value === "number" ? fmtNum(value) : value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Daily engagement</div>
        {series.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No metric history yet — daily numbers appear once your published posts start reporting.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 h-32 min-w-[480px]">
              {series.map((p) => (
                <div key={p.metric_date} className="flex-1 flex flex-col items-center justify-end h-full"
                  title={`${p.metric_date}: ${fmtNum(p.engagement)} engagement · ${fmtNum(p.impressions)} impressions`}>
                  <div className="w-full rounded-t bg-sky-400/80"
                    style={{ height: `${Math.max(3, (Number(p.engagement || 0) / maxEngagement) * 100)}%` }} />
                </div>
              ))}
            </div>
            <table className="mt-4 w-full text-[12px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Impressions</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Reach</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Likes</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Comments</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Shares</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Clicks</th>
                  <th className="py-1.5 font-medium text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((p) => (
                  <tr key={p.metric_date} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 text-slate-700">{p.metric_date?.slice(0, 10)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.impressions)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.reach)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.likes)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.comments)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.shares)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(p.clicks)}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">{fmtNum(p.engagement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SparkPageShell>
  );
}
