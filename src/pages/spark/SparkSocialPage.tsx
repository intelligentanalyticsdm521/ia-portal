import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface SocialAccount { id: number; provider: string; account_label: string | null; is_active: boolean; connected_at: string; }
interface SocialPost { id: number; social_account_id: number; status: string; content: string; scheduled_at: string | null; posted_at: string | null; provider?: string; account_label?: string; }

const PROVIDERS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X / Twitter" },
  { value: "gbp", label: "Google Business" },
];

export function SparkSocialPage() {
  const { get, post, ready } = useSparkApi();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState<"account" | "post" | null>(null);
  const [acctForm, setAcctForm] = useState({ provider: "facebook", account_label: "" });
  const [postForm, setPostForm] = useState({ social_account_id: 0, content: "", scheduled_at: "" });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [a, p] = await Promise.all([
        get<{ data: SocialAccount[] }>("/api/v1/social-accounts"),
        get<{ data: SocialPost[] }>("/api/v1/social-posts/calendar"),
      ]);
      setAccounts(a.data || []);
      setPosts(p.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function createAccount() {
    try {
      await post("/api/v1/social-accounts", acctForm);
      setShowCreate(null);
      setAcctForm({ provider: "facebook", account_label: "" });
      await load();
    } catch (err) { setError(err); }
  }

  async function createPost() {
    if (!postForm.content || !postForm.social_account_id) return;
    try {
      await post("/api/v1/social-posts", {
        social_account_id: Number(postForm.social_account_id),
        content: postForm.content,
        scheduled_at: postForm.scheduled_at || null,
        status: postForm.scheduled_at ? "scheduled" : "draft",
      });
      setShowCreate(null);
      setPostForm({ social_account_id: 0, content: "", scheduled_at: "" });
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="Social Scheduler" subtitle="Schedule + track posts across all your channels" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card mb-4">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">Connected accounts</div>
            <button onClick={() => setShowCreate("account")} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ Add account</button>
          </div>
          <table className="data-table text-sm">
            <thead><tr><th>Provider</th><th>Label</th><th>Status</th><th>Connected</th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td className="capitalize font-medium">{a.provider}</td>
                  <td>{a.account_label || "—"}</td>
                  <td>{a.is_active ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded">Active</span> : <span className="text-gray-500">Inactive</span>}</td>
                  <td className="text-xs text-gray-500">{new Date(a.connected_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-500">No accounts connected. OAuth setup pending — manual entry available.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">Scheduled posts</div>
            <button onClick={() => setShowCreate("post")} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New post</button>
          </div>
          <table className="data-table text-sm">
            <thead><tr><th>When</th><th>Provider</th><th>Status</th><th>Content</th></tr></thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id}>
                  <td className="text-xs text-gray-500 whitespace-nowrap">{new Date(p.scheduled_at || p.posted_at || "").toLocaleString()}</td>
                  <td className="capitalize">{p.provider || "—"}</td>
                  <td><span className="capitalize">{p.status}</span></td>
                  <td className="text-sm max-w-[400px] truncate">{p.content}</td>
                </tr>
              ))}
              {posts.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-500">No scheduled posts</td></tr>}
            </tbody>
          </table>
        </div>

        {showCreate === "account" && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">Connect social account</div>
              <div className="space-y-3">
                <select value={acctForm.provider} onChange={e => setAcctForm({ ...acctForm, provider: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  {PROVIDERS.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
                </select>
                <input placeholder="Account label (e.g. @yourbiz)" value={acctForm.account_label}
                  onChange={e => setAcctForm({ ...acctForm, account_label: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <div className="text-xs text-gray-500">OAuth flow is pending. Account will be added without tokens until OAuth apps are configured.</div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(null)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={createAccount} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Add</button>
              </div>
            </div>
          </div>
        )}

        {showCreate === "post" && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">Schedule post</div>
              <div className="space-y-3">
                <select value={postForm.social_account_id || ""} onChange={e => setPostForm({ ...postForm, social_account_id: Number(e.target.value) })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="">Select account…</option>
                  {accounts.filter(a => a.is_active).map(a => (<option key={a.id} value={a.id}>{a.provider}{a.account_label ? " · " + a.account_label : ""}</option>))}
                </select>
                <textarea placeholder="Post content" value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })}
                  rows={4} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input type="datetime-local" value={postForm.scheduled_at} onChange={e => setPostForm({ ...postForm, scheduled_at: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(null)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={createPost} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Schedule</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkSocialPage;
