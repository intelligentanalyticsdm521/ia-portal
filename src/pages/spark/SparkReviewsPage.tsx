import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Star, MessageSquare, ThumbsUp, ThumbsDown, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";

// SPARK pack 2 (2026-09-09): THE HUB PUBLISHES NOW.
//
// The reply box used to save the text and stamp a "posted" date, and there has
// never been a publish path — so a client's page said their reply had been
// posted, on a date, and Google had never heard of it. Replies go to Google
// through ARION's publisher (the ONE Google review-reply publisher on the
// platform), and `response_source_status` says what actually happened. A
// business with no Google connection is told so in a sentence, and its reply is
// kept as a draft rather than lost.

interface Review {
  id: number; source: string; reviewer_name: string | null; rating: number | null;
  title: string | null; body: string | null; review_url: string | null;
  reviewed_at: string | null; sentiment: string | null;
  response_text: string | null; response_posted_at: string | null;
  /** 'draft' saved here, 'published' Google took it, 'failed' it did not. */
  response_source_status: string | null;
  response_source_error: string | null;
}
interface SummaryRow { source: string; total_reviews: number; avg_rating: number; positives: number; negatives: number; }
interface PublishCapability {
  can_publish: boolean; channel: string; domain: string | null;
  reason?: string; message: string;
}

export function SparkReviewsPage() {
  const { get, post, ready } = useSparkApi();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [responding, setResponding] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState("");
  const [capability, setCapability] = useState<PublishCapability | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ published: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [r, s, cap] = await Promise.all([
        get<{ data: Review[] }>("/api/v1/reviews"),
        get<{ data: SummaryRow[] }>("/api/v1/reviews/summary?days=90"),
        // Asked BEFORE anybody types, so the page says "connect Google to post
        // replies from here" instead of finding out afterwards. One sentence,
        // written on the server, rendered here.
        get<{ data: PublishCapability }>("/api/v1/reviews/publishing").catch(() => null),
      ]);
      setReviews(r.data || []);
      setSummary(s.data || []);
      setCapability(cap ? cap.data : null);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function submitResponse() {
    if (!responding) return;
    setSaving(true);
    try {
      const res = await post<{ published: boolean; message: string }>(
        `/api/v1/reviews/${responding.id}/respond`,
        { response_text: responseText }
      );
      // The reply is SAVED either way. `published` is the fact, and it is only
      // true when Google took it — the page never says "posted" on its own.
      setOutcome({ published: !!res.published, message: res.message });
      setResponding(null);
      setResponseText("");
      await load();
    } catch (err) {
      setOutcome({
        published: false,
        message: (err as { body?: { error?: string } })?.body?.error
          || "That reply could not be saved. Nothing was posted.",
      });
    } finally {
      setSaving(false);
    }
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
      {/* What this business can publish, said plainly and before anybody types. */}
      {capability && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ring-1 ${
            capability.can_publish
              ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
              : "bg-slate-50 text-slate-700 ring-slate-200"
          }`}
        >
          {capability.can_publish
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />}
          <span>{capability.message}</span>
        </div>
      )}

      {outcome && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ring-1 ${
            outcome.published
              ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
              : "bg-amber-50 text-amber-900 ring-amber-200"
          }`}
        >
          {outcome.published
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />}
          <span className="flex-1">{outcome.message}</span>
          <button onClick={() => setOutcome(null)} className="text-[11px] font-semibold underline">
            Dismiss
          </button>
        </div>
      )}
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
          // THREE states, not two. "Saved here" and "posted on Google" are
          // different facts and the client is the one who needs to know which.
          { key: "response", header: "Response", width: "compact",
            cell: r => {
              if (!r.response_text) return <span className="text-xs text-amber-700">Not answered</span>;
              if (r.response_source_status === "published") {
                return <span className="text-xs text-emerald-700">✓ Posted on Google</span>;
              }
              if (r.response_source_status === "failed") {
                return <span className="text-xs text-rose-700" title={r.response_source_error || undefined}>Saved — not posted</span>;
              }
              return <span className="text-xs text-slate-600">Saved here</span>;
            },
          },
        ]}
        rowActions={r => (!r.response_text || r.response_source_status === "failed")
          ? <button onClick={() => { setResponding(r); setResponseText(r.response_text || ""); setOutcome(null); }} className="spark-btn spark-btn-sm spark-btn-primary">
              {r.response_source_status === "failed" ? "Try again" : "Respond"}
            </button>
          : r.review_url ? <a href={r.review_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="spark-btn spark-btn-sm spark-btn-secondary"><ExternalLink className="h-3 w-3" /></a> : null
        }
      />

      <IadmModal
        open={!!responding}
        onClose={() => setResponding(null)}
        product="spark"
        title="Respond to review"
        subtitle={responding ? `${responding.source} · ${responding.rating || "—"} ★ by ${responding.reviewer_name || "Anonymous"}` : ""}
        size="info"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setResponding(null)}>Cancel</IadmButton>
            <IadmButton variant="accent" product="spark" onClick={submitResponse} disabled={saving || !responseText.trim()}>
              {saving
                ? "Sending…"
                : (capability?.can_publish && (responding?.source || "").toLowerCase().startsWith("g")
                  ? "Post on Google"
                  : "Save reply")}
            </IadmButton>
          </>
        }
      >
        {responding && (
          <div className="p-5">
            <div className="bg-slate-50 rounded-md p-3 mb-3 border border-slate-200">
              {responding.title && <div className="font-semibold text-sm mb-1">{responding.title}</div>}
              <div className="text-sm text-slate-700">{responding.body || "—"}</div>
            </div>
            <div className="spark-field">
              <label className="spark-field-label">Your response</label>
              <textarea className="spark-field-textarea" rows={6} value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Thank you for the review…" autoFocus />
              <p className="text-[11px] text-slate-500 mt-1">
                {(responding.source || "").toLowerCase().startsWith("g")
                  ? (capability?.can_publish
                    ? "This goes straight onto your Google listing. If Google will not take it, we tell you here rather than pretending it went."
                    : (capability?.message
                      || "Your reply is saved. Connect your Google Business Profile and we will post it for you."))
                  : `${responding.source} does not let us post replies for you, so this is saved for you to copy across — use the link on the row.`}
              </p>
            </div>
          </div>
        )}
      </IadmModal>
    </SparkPageShell>
  );
}

export default SparkReviewsPage;
