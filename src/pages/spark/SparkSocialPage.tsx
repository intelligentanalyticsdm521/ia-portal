import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { Plus, Share2, Calendar, Link as LinkIcon } from "lucide-react";

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
  const [drawer, setDrawer] = useState<"account" | "post" | null>(null);
  const [filter, setFilter] = useState("all");
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
    await post("/api/v1/social-accounts", acctForm);
    setAcctForm({ provider: "facebook", account_label: "" });
    setDrawer(null);
    await load();
  }

  async function createPost() {
    if (!postForm.content || !postForm.social_account_id) return;
    await post("/api/v1/social-posts", {
      social_account_id: Number(postForm.social_account_id),
      content: postForm.content,
      scheduled_at: postForm.scheduled_at || null,
      status: postForm.scheduled_at ? "scheduled" : "draft",
    });
    setPostForm({ social_account_id: 0, content: "", scheduled_at: "" });
    setDrawer(null);
    await load();
  }

  const filteredPosts = filter === "all" ? posts : posts.filter(p => p.status === filter);

  return (
    <SparkPageShell
      title="Social Scheduler"
      subtitle="Schedule + track posts across all your channels"
      help={
        <>
          <strong className="block mb-1">How this works:</strong>
          1. <strong>Connect your accounts</strong> — Facebook / Instagram / LinkedIn / X / Google Business Profile. OAuth flows are pending app registration with each provider (we'll handle that as part of v2 rollout); for now you can add accounts manually as placeholders.
          <br /><br />
          2. <strong>Schedule posts</strong> in a single composer. Pick an account, write the content, set a date/time. SPARK saves it as <em>scheduled</em>.
          <br /><br />
          3. <strong>A worker publishes them</strong> at the scheduled time using your stored OAuth tokens — once the OAuth side is live. Until then, scheduled posts are tracked here but won't actually post.
          <br /><br />
          4. <strong>Status + analytics</strong> flow back: draft → scheduled → posted, with impressions and engagement pulled from each provider where supported.
        </>
      }
      actions={
        <div className="flex gap-2">
          <button onClick={() => setDrawer("account")} className="spark-btn spark-btn-secondary">
            <LinkIcon className="h-3.5 w-3.5" /> Connect account
          </button>
          <button onClick={() => setDrawer("post")} className="spark-btn spark-btn-accent" disabled={!accounts.length}>
            <Plus className="h-3.5 w-3.5" /> New post
          </button>
        </div>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Accounts", value: accounts.filter(a => a.is_active).length, icon: Share2, accent: "blue" },
          { label: "Drafts", value: posts.filter(p => p.status === "draft").length },
          { label: "Scheduled", value: posts.filter(p => p.status === "scheduled").length, icon: Calendar, accent: "amber" },
          { label: "Posted", value: posts.filter(p => p.status === "posted").length, accent: "emerald" },
        ]} />
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { key: "all", label: "All", count: posts.length },
            { key: "draft", label: "Drafts", count: posts.filter(p => p.status === "draft").length },
            { key: "scheduled", label: "Scheduled", count: posts.filter(p => p.status === "scheduled").length },
            { key: "posted", label: "Posted", count: posts.filter(p => p.status === "posted").length },
          ]}
        />
      }
      loading={loading}
      error={error}
    >
      {accounts.length === 0 ? (
        <div className="spark-mini-card py-8 text-center">
          <Share2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm text-slate-600">No social accounts connected yet.</div>
          <div className="text-xs text-slate-500 mt-1">OAuth flows for Meta / LinkedIn / X coming in v2 — manual entry available for now.</div>
        </div>
      ) : (
        <SparkTable<SocialPost>
          rows={filteredPosts}
          getRowKey={p => p.id}
          emptyState="No posts yet for this filter."
          totalCount={filteredPosts.length}
          columns={[
            { key: "when", header: "When", width: "compact",
              cell: p => <span className="text-xs text-slate-500 whitespace-nowrap">{p.scheduled_at || p.posted_at ? new Date(p.scheduled_at || p.posted_at!).toLocaleString() : "—"}</span>,
            },
            { key: "provider", header: "Channel", width: "compact",
              cell: p => <span className="capitalize text-sm">{p.provider || "—"}</span>,
            },
            { key: "status", header: "Status", width: "compact",
              cell: p => <span className={`text-xs px-2 py-0.5 rounded capitalize ${p.status === "posted" ? "bg-emerald-100 text-emerald-700" : p.status === "scheduled" ? "bg-amber-100 text-amber-700" : p.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{p.status}</span>,
            },
            { key: "content", header: "Content", width: "wide",
              cell: p => <span className="text-sm text-slate-700 line-clamp-2">{p.content}</span>,
            },
          ]}
        />
      )}

      <SparkDrawer
        open={drawer === "account"}
        onClose={() => setDrawer(null)}
        title="Connect social account"
        subtitle="OAuth flows for Meta / LinkedIn / X are wired and ready — app registrations pending. Manual entry available below."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createAccount} className="spark-btn spark-btn-primary">Add account</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Provider</label>
          <select className="spark-field-select" value={acctForm.provider} onChange={e => setAcctForm({ ...acctForm, provider: e.target.value })}>
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Account label</label>
          <input className="spark-field-input" value={acctForm.account_label} onChange={e => setAcctForm({ ...acctForm, account_label: e.target.value })} placeholder="@yourbiz" />
        </div>
      </SparkDrawer>

      <SparkDrawer
        open={drawer === "post"}
        onClose={() => setDrawer(null)}
        title="Schedule post"
        width="wide"
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createPost} disabled={!postForm.content || !postForm.social_account_id} className="spark-btn spark-btn-primary">
              {postForm.scheduled_at ? "Schedule" : "Save draft"}
            </button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Account</label>
          <select className="spark-field-select" value={postForm.social_account_id || ""} onChange={e => setPostForm({ ...postForm, social_account_id: Number(e.target.value) })}>
            <option value="">Select account…</option>
            {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.provider}{a.account_label ? " · " + a.account_label : ""}</option>)}
          </select>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Post content</label>
          <textarea className="spark-field-textarea" rows={6} value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} placeholder="What's your message?" />
          <p className="text-[11px] text-slate-500 mt-1">{postForm.content.length} chars · X/Twitter limit is 280</p>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Schedule for (leave empty = draft)</label>
          <input type="datetime-local" className="spark-field-input" value={postForm.scheduled_at} onChange={e => setPostForm({ ...postForm, scheduled_at: e.target.value })} />
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkSocialPage;
