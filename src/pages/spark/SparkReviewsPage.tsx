import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

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
  const [responding, setResponding] = useState<{ id: number; text: string } | null>(null);

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

  async function respond() {
    if (!responding) return;
    try {
      await post(`/api/v1/reviews/${responding.id}/respond`, { response_text: responding.text });
      setResponding(null);
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="Reputation Hub" subtitle="Aggregated reviews + response workflow" error={error} loading={loading}>
      <div className="arion-page">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {summary.map(s => (
            <div key={s.source} className="card p-4">
              <div className="text-xs uppercase text-gray-500">{s.source}</div>
              <div className="text-2xl font-semibold mt-1">{Number(s.avg_rating || 0).toFixed(1)} ★</div>
              <div className="text-xs text-gray-500 mt-1">{s.total_reviews} reviews · {s.positives} ✓ / {s.negatives} ✗</div>
            </div>
          ))}
          {summary.length === 0 && <div className="text-sm text-gray-500 col-span-4 text-center py-4">No review summary yet (90-day window)</div>}
        </div>

        <div className="card">
          <div className="card-hdr"><div className="card-ttl">Recent reviews</div></div>
          <table className="data-table text-sm">
            <thead><tr><th>Source</th><th>Rating</th><th>Reviewer</th><th>Review</th><th>Response</th></tr></thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r.id}>
                  <td className="capitalize text-xs">{r.source}</td>
                  <td>{r.rating ? `${r.rating} ★` : "—"}</td>
                  <td className="text-sm">{r.reviewer_name || "—"}</td>
                  <td className="text-sm max-w-[400px]">
                    {r.title && <div className="font-medium">{r.title}</div>}
                    <div className="line-clamp-2">{r.body || "—"}</div>
                  </td>
                  <td>
                    {r.response_text
                      ? <span className="text-xs text-emerald-700">Responded {r.response_posted_at ? new Date(r.response_posted_at).toLocaleDateString() : ""}</span>
                      : <button onClick={() => setResponding({ id: r.id, text: "" })} className="text-xs px-2 py-1 rounded bg-blue-600 text-white">Respond</button>}
                  </td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No reviews ingested yet</td></tr>}
            </tbody>
          </table>
        </div>

        {responding && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-5">
              <div className="text-lg font-semibold mb-3">Respond to review</div>
              <textarea rows={5} placeholder="Your response…" value={responding.text}
                onChange={e => setResponding({ ...responding, text: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setResponding(null)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={respond} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Save response</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkReviewsPage;
