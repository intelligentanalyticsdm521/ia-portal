// SparkReviewWidgetPage — Manage the public review widget.
//
// Two tabs:
//   - Reviews: inbox of submissions via /reviews/public widget
//   - Destinations: deep-links for promoters (Google, Yelp, Facebook…)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Plus, Star, Trash2, Copy, Check, ExternalLink } from "lucide-react";

interface Review {
  id: number; rating: number; comment: string | null;
  reviewer_name: string | null; reviewer_email: string | null;
  source: string; public_routes_clicked: string | null;
  is_public: boolean; moderation_status: string;
  response: string | null; responded_at: string | null;
  created_at: string;
  first_name: string | null; last_name: string | null; email: string | null;
}
interface Destination {
  id: number; platform: string; label: string | null; url: string; is_active: boolean; sort_order: number;
}

const PLATFORMS = [
  { key: "google",     label: "Google Business Profile" },
  { key: "yelp",       label: "Yelp" },
  { key: "facebook",   label: "Facebook" },
  { key: "trustpilot", label: "Trustpilot" },
  { key: "g2",         label: "G2" },
  { key: "other",      label: "Other" },
];

function tenantIdFromMsalToken(token: string | undefined): string {
  if (!token) return "";
  try { return JSON.parse(atob(token.split(".")[1])).tid || ""; } catch { return ""; }
}

export function SparkReviewWidgetPage() {
  const { get, post, del, patch, ready } = useSparkApi();
  const { instance, accounts } = useMsal();
  const [tab, setTab] = useState<"reviews" | "destinations" | "share">("reviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [dests, setDests] = useState<Destination[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ platform: "google", label: "", url: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        get<{ data: Review[] }>("/api/v1/reviews"),
        get<{ data: Destination[] }>("/api/v1/review-destinations"),
      ]);
      setReviews(r1?.data || []);
      setDests(r2?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    (async () => {
      const a = accounts[0];
      if (!a) return;
      try { const r = await instance.acquireTokenSilent({ account: a, scopes: [] }); setTenantId(tenantIdFromMsalToken(r.accessToken)); }
      catch { /* no-op */ }
    })();
  }, [instance, accounts]);

  async function addDest() {
    if (!form.platform || !form.url) return;
    try {
      await post("/api/v1/review-destinations", form);
      setAdding(false);
      setForm({ platform: "google", label: "", url: "" });
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function removeDest(id: number) {
    if (!confirm("Remove this destination?")) return;
    try { await del(`/api/v1/review-destinations/${id}`); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function setApproval(id: number, status: "approved" | "rejected") {
    try { await patch(`/api/v1/reviews/${id}`, { moderation_status: status, is_public: status === "approved" }); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const widgetUrl = useMemo(() => {
    if (!tenantId) return "";
    const base = (import.meta.env.VITE_SPARK_API_BASE as string) || (import.meta.env.VITE_LUMEN_API_BASE as string) || "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";
    return `${base}/api/v1/reviews/public?t=${tenantId}&s=widget`;
  }, [tenantId]);

  const avg = reviews.length ? (reviews.reduce((a, b) => a + b.rating, 0) / reviews.length).toFixed(2) : "—";

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Review widget"
      subtitle={`${reviews.length} reviews · avg ${avg}★`}
      help="Collect reviews from your customers via a tenant-branded widget URL. 4-5 star reviews see your configured public-share links (Google, Yelp, Facebook); 1-3 star reviews route directly to you for follow-up. Auto-triggered after every NPS promoter response."
      filters={
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("reviews")} className={`text-xs px-3 py-1 rounded-full border ${tab === "reviews" ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>Reviews ({reviews.length})</button>
          <button onClick={() => setTab("destinations")} className={`text-xs px-3 py-1 rounded-full border ${tab === "destinations" ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>Destinations ({dests.length})</button>
          <button onClick={() => setTab("share")} className={`text-xs px-3 py-1 rounded-full border ${tab === "share" ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>Share link</button>
        </div>
      }
      loading={loading}
      error={error}
    >
      {tab === "reviews" && (
        <div className="overflow-x-auto">
          <table className="spark-table">
            <thead><tr><th>Rating</th><th>Reviewer</th><th>Comment</th><th>Source</th><th>Public routes</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {reviews.length === 0 && <tr><td colSpan={8} className="text-center text-sm text-slate-500 py-8">No widget reviews yet.</td></tr>}
              {reviews.map(r => {
                const routes = (() => { try { return JSON.parse(r.public_routes_clicked || "[]"); } catch { return []; } })();
                const name = r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : (r.reviewer_name || "Anonymous");
                return (
                  <tr key={r.id}>
                    <td><Stars n={r.rating} /></td>
                    <td className="font-medium">{name}</td>
                    <td className="text-xs text-slate-600 max-w-[300px] truncate" title={r.comment || ""}>{r.comment || "—"}</td>
                    <td className="text-[10px] uppercase"><span className="px-1.5 py-0.5 rounded bg-slate-100">{r.source}</span></td>
                    <td className="text-xs">{routes.length ? routes.join(", ") : "—"}</td>
                    <td><span className={`px-2 py-0.5 rounded text-[10px] border ${r.moderation_status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : r.moderation_status === "rejected" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{r.moderation_status}</span></td>
                    <td className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      {r.moderation_status === "pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => setApproval(r.id, "approved")} className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white">Approve</button>
                          <button onClick={() => setApproval(r.id, "rejected")} className="text-xs px-2 py-0.5 rounded border border-rose-200 text-rose-600">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "destinations" && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setAdding(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add destination
            </button>
          </div>
          <div className="space-y-2">
            {dests.length === 0 && <div className="text-center text-sm text-slate-500 py-8">No destinations yet. Add at least one — promoters will be offered these links after they submit a 4-5 star review.</div>}
            {dests.map(d => (
              <div key={d.id} className="border border-slate-200 rounded p-3 bg-white flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{d.label || (PLATFORMS.find(p => p.key === d.platform)?.label || d.platform)}</div>
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-[#EF6C33] hover:underline truncate inline-flex items-center gap-1">
                    {d.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <button onClick={() => removeDest(d.id)} className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded flex items-center gap-1">
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "share" && (
        <div className="space-y-3 max-w-2xl">
          <div className="spark-mini-card">
            <div className="spark-mini-card-header"><span className="spark-mini-card-title">Your widget URL</span></div>
            <div className="p-3">
              <p className="text-sm text-slate-600 mb-2">Share this URL with happy customers, link it from your website footer, or paste it on receipts/invoices.</p>
              <div className="flex gap-1">
                <code className="flex-1 text-xs font-mono bg-slate-100 px-3 py-2 rounded">{widgetUrl}</code>
                <button onClick={() => copyText(widgetUrl, "url")} className="text-xs px-3 py-2 rounded border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
                  {copied === "url" ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
            </div>
          </div>
          <div className="spark-mini-card">
            <div className="spark-mini-card-header"><span className="spark-mini-card-title">Embed link snippet</span></div>
            <div className="p-3">
              <p className="text-sm text-slate-600 mb-2">Paste this HTML to add a "Leave a review" button to your website.</p>
              <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">{`<a href="${widgetUrl}" target="_blank" rel="noreferrer"
  style="display:inline-block;background:#EF6C33;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
  Leave us a review
</a>`}</pre>
            </div>
          </div>
        </div>
      )}

      <IadmModal
        open={adding}
        onClose={() => setAdding(false)}
        product="spark"
        title="Add review destination"
        subtitle="Promoters (4-5 star) will be offered these links after submitting."
        size="info"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setAdding(false)}>Cancel</IadmButton>
            <IadmButton variant="accent" product="spark" onClick={addDest} disabled={!form.url}>Add destination</IadmButton>
          </>
        }
      >
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] uppercase font-semibold text-slate-500">Platform</label>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5">
              {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-semibold text-slate-500">Label (optional)</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" placeholder="Defaults to platform name" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-semibold text-slate-500">URL</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" placeholder="https://g.page/r/.../review" />
            <p className="text-[10px] text-slate-500 mt-1">For Google: use your "Get more reviews" short link from Business Profile.</p>
          </div>
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? "text-amber-400 fill-amber-400" : "text-slate-300"}`} />
      ))}
    </div>
  );
}

export default SparkReviewWidgetPage;
