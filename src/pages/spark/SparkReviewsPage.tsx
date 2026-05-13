import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { Star, MessageSquare, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";

interface Review {
  id: number; source: string; reviewer_name: string | null; rating: number | null;
  title: string | null; body: string | null; review_url: string | null;
  reviewed_at: string | null; sentiment: string | null;
  response_text: string | null; response_posted_at: string | null;
}
interface SummaryRow { source: string; total_reviews: number; avg_rating: number; positives: number; negatives: number; }

export function SparkReviewsPage() {
  const { get, post, ready } = useSparkApi();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [responding, setResponding] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState("");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [r, s] = await Promise.all([
        get<{ data: Review[] }>("/api/v1/reviews"),
        get<{ data: SummaryRow[] }>("/api/v1/reviews/summary?days=90"),
      ]);
      setReviews(r.data || []);
      setSummary(s.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function submitResponse() {
    if (!responding) return;
    await post(`/api/v1/reviews/${responding.id}/respond`, { response_text: responseText });
    setResponding(null);
    setResponseText("");
    await load();
  }

  const filtered = reviews.filter(r => {
    if (filter === "all") return true;
    if (filter === "needs_response") return !r.response_text;
    if (filter === "responded") return !!r.response_text;
    return r.sentiment === filter || r.source === filter;
  });

  const overallAvg = summary.length
    ? (summary.reduce((s, r) => s + (r.avg_rating || 0) * r.total_reviews, 0) / summary.reduce((s, r) => s + r.total_reviews, 0)).toFixed(1)
    : "—";
  const totalReviews = summary.reduce((s, r) => s + r.total_reviews, 0);
  const totalNegatives = summary.reduce((s, r) => s + (r.negatives || 0), 0);

  return (
    <SparkPageShell
      title="Reputation Hub"
      subtitle="Aggregated reviews + response workflow"
      stats={
        <SparkStatStrip stats={[
          { label: "Avg rating", value: overallAvg === "—" ? "—" : `${overallAvg} ★`, icon: Star, accent: "amber" },
          { label: "Total reviews (90d)", value: totalReviews, icon: MessageSquare },
          { label: "Positives", value: summary.reduce((s, r) => s + (r.positives || 0), 0), icon: ThumbsUp, accent: "emerald" },
          { label: "Negatives", value: totalNegatives, icon: ThumbsDown, accent: totalNegatives > 0 ? "rose" : "default" },
        ]} />
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { key: "all", label: "All", count: reviews.length },
            { key: "needs_response", label: "Needs response", count: reviews.filter(r => !r.response_text).length },
            { key: "responded", label: "Responded", count: reviews.filter(r => !!r.response_text).length },
            { key: "negative", label: "Negative", count: reviews.filter(r => r.sentiment === "negative").length },
          ]}
        />
      }
      loading={loading}
      error={error}
    >
      {summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {summary.map(s => (
            <div key={s.source} className="spark-mini-card">
              <div className="text-xs uppercase font-semibold text-slate-500">{s.source}</div>
              <div className="text-2xl font-semibold mt-1">{Number(s.avg_rating || 0).toFixed(1)} ★</div>
              <div className="text-xs text-slate-500 mt-1">{s.total_reviews} reviews · {s.positives} ✓ / {s.negatives} ✗</div>
            </div>
          ))}
        </div>
      )}

      <SparkTable<Review>
        rows={filtered}
        getRowKey={r => r.id}
        emptyState="No reviews ingested yet. Connect GBP / Yelp / Facebook to start tracking."
        totalCount={filtered.length}
        columns={[
          { key: "source", header: "Source", width: "compact",
            cell: r => <span className="text-xs capitalize text-slate-700">{r.source}</span>,
          },
          { key: "rating", header: "Rating", width: "narrow",
            cell: r => r.rating
              ? <span className="text-sm font-semibold text-amber-600">{r.rating} ★</span>
              : <span className="text-xs text-slate-400">—</span>,
          },
          { key: "reviewer", header: "Reviewer", width: "compact",
            cell: r => <span className="text-sm">{r.reviewer_name || "Anonymous"}</span>,
          },
          { key: "body", header: "Review", width: "wide",
            cell: r => (
              <div>
                {r.title && <div className="font-medium text-sm">{r.title}</div>}
                <div className="text-sm text-slate-700 line-clamp-2">{r.body || "—"}</div>
              </div>
            ),
          },
          { key: "response", header: "Response", width: "compact",
            cell: r => r.response_text
              ? <span className="text-xs text-emerald-700">✓ Responded</span>
              : <span className="text-xs text-amber-700">Pending</span>,
          },
        ]}
        rowActions={r => !r.response_text
          ? <button onClick={() => { setResponding(r); setResponseText(""); }} className="spark-btn spark-btn-sm spark-btn-primary">Respond</button>
          : r.review_url ? <a href={r.review_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="spark-btn spark-btn-sm spark-btn-secondary"><ExternalLink className="h-3 w-3" /></a> : null
        }
      />

      <SparkDrawer
        open={!!responding}
        onClose={() => setResponding(null)}
        title="Respond to review"
        subtitle={responding ? `${responding.source} · ${responding.rating || "—"} ★ by ${responding.reviewer_name || "Anonymous"}` : ""}
        width="wide"
        footer={
          <>
            <button onClick={() => setResponding(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={submitResponse} disabled={!responseText.trim()} className="spark-btn spark-btn-primary">Save response</button>
          </>
        }
      >
        {responding && (
          <>
            <div className="bg-slate-50 rounded-md p-3 mb-3 border border-slate-200">
              {responding.title && <div className="font-semibold text-sm mb-1">{responding.title}</div>}
              <div className="text-sm text-slate-700">{responding.body || "—"}</div>
            </div>
            <div className="spark-field">
              <label className="spark-field-label">Your response</label>
              <textarea className="spark-field-textarea" rows={6} value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Thank you for the review…" autoFocus />
              <p className="text-[11px] text-slate-500 mt-1">Posts to {responding.source}. AI-drafted responses coming in v2.</p>
            </div>
          </>
        )}
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkReviewsPage;
