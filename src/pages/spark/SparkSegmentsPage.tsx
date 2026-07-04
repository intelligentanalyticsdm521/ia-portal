import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Plus, Filter, Users, Zap, Sparkles, AlertTriangle } from "lucide-react";

// SP-6 — a single campaign send is hard-capped at this many recipients
// (campaigns.js SEG_HARD_CAP). A segment that evaluates larger can't be sent
// as one campaign, so we warn the user where the count is known (the table)
// and set the expectation at create time.
const SEND_CAP = 100_000;

interface Segment {
  id: number;
  name: string;
  filter_summary?: string;
  filters?: string;     // JSON
  contact_count: number;
  created_at: string;
}

// Quick-start segment templates the user can pick from
const TEMPLATES = [
  { name: "Hot leads (Tier X)", summary: "Contact Intelligence Tier = X", description: "Your highest-scoring contacts — likely buyers and most engaged" },
  { name: "Engaged in last 30 days", summary: "Last email opened within 30 days", description: "People who recently interacted with your campaigns" },
  { name: "Dormant (no activity 60+ days)", summary: "No email opened in 60+ days AND email_subscribed = true", description: "Re-engagement candidates" },
  { name: "Active newsletter readers", summary: "On Newsletter list AND email_unsubscribed = false", description: "Loyal newsletter audience" },
  { name: "Has phone, no email", summary: "Phone IS NOT NULL AND email IS NULL", description: "SMS-only outreach targets" },
];

export function SparkSegmentsPage() {
  const { get, post, ready } = useSparkApi();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", filter_summary: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Segment[] }>("/api/v1/segments");
      setSegments(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await post("/api/v1/segments", form);
      setDrawerOpen(false);
      setForm({ name: "", filter_summary: "" });
      await load();
    } catch (err) { setError(err); } finally { setSaving(false); }
  }

  function useTemplate(t: typeof TEMPLATES[number]) {
    setForm({ name: t.name, filter_summary: t.summary });
    setDrawerOpen(true);
  }

  const totalContacts = segments.reduce((s, x) => s + (x.contact_count || 0), 0);

  return (
    <SparkPageShell
      title="Segments"
      subtitle="Dynamic groups — filter rules auto-update as contacts change"
      help={
        <>
          <strong className="block mb-1">Segments are smart filters that re-run automatically.</strong>
          Define a rule once ("all contacts tagged VIP in Texas who opened an email in the last 30 days") and the segment auto-includes everyone who matches. As contacts change, the segment updates.
          <br /><br />
          Compare to <strong>Lists</strong>: lists are manual (you add/remove people by hand). Segments are dynamic.
          <br /><br />
          Use segments to power campaigns that should always target "current X" instead of a frozen snapshot.
        </>
      }
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New segment
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total segments", value: segments.length, icon: Filter },
          { label: "Total contacts in segments", value: totalContacts.toLocaleString(), icon: Users, accent: "blue" },
        ]} />
      }
      loading={loading}
      error={error}
    >
      {segments.length === 0 && !loading ? (
        <>
          <div className="spark-mini-card py-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <Filter className="h-7 w-7 text-violet-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No segments yet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Segments are <strong>dynamic</strong> — they update automatically as contacts match the rules.
              Lists (static) vs. Segments (dynamic) — use a segment when "this group should always include everyone who…"
            </p>
          </div>

          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mt-6 mb-2">Start with a template</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => useTemplate(t)}
                className="text-left spark-mini-card hover:border-violet-400 hover:shadow-sm transition group"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-md bg-violet-50 text-violet-600 flex-shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>
                    <div className="text-[10px] text-violet-700 font-mono mt-1.5 truncate">{t.summary}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <SparkTable<Segment>
          rows={segments}
          getRowKey={s => s.id}
          totalCount={segments.length}
          columns={[
            {
              key: "name", header: "Segment", width: "wide",
              cell: s => (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-md bg-violet-50 text-violet-600 flex-shrink-0">
                    <Filter className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{s.name}</div>
                    {s.filter_summary && <div className="text-xs text-slate-500 truncate font-mono">{s.filter_summary}</div>}
                  </div>
                </div>
              ),
            },
            {
              key: "count", header: "Matches", width: "compact",
              cell: s => (
                s.contact_count > SEND_CAP ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium"
                    title={`Exceeds the ${SEND_CAP.toLocaleString()}-per-send cap — this segment can't be sent as one campaign. Split it into a static List or narrow the filter.`}
                  >
                    <AlertTriangle className="h-3 w-3" /> {s.contact_count.toLocaleString()}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium">
                    <Zap className="h-3 w-3" /> {s.contact_count.toLocaleString()}
                  </span>
                )
              ),
            },
            {
              key: "created", header: "Created", width: "compact", hideOnMobile: true,
              cell: s => <span className="text-xs text-slate-500">{new Date(s.created_at).toLocaleDateString()}</span>,
            },
          ]}
        />
      )}

      <IadmModal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        product="spark"
        title="New segment"
        subtitle="Visual filter builder coming in v2. For now, describe your filter in plain English — IA Intelligence will compile it."
        size="info"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</IadmButton>
            <IadmButton variant="accent" product="spark" onClick={handleCreate} disabled={saving || !form.name.trim()}>
              {saving ? "Creating…" : "Create segment"}
            </IadmButton>
          </>
        }
      >
        <div className="p-5 space-y-3">
          <div className="spark-field">
            <label className="spark-field-label">Name</label>
            <input className="spark-field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="VIP customers in Texas" autoFocus />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Filter description</label>
            <textarea className="spark-field-textarea" rows={4} value={form.filter_summary} onChange={e => setForm({ ...form, filter_summary: e.target.value })} placeholder='Plain English: "Contacts tagged VIP, in Texas, who opened an email in the last 30 days"' />
          </div>
          <div className="text-xs text-slate-500 bg-violet-50 border border-violet-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-violet-900">Visual filter builder coming in v2</strong>
                <p className="mt-1">Pick fields, operators, and values from dropdowns. AND/OR logic. Saved filter sets reusable across segments.</p>
              </div>
            </div>
          </div>
          {/* SP-6 — set the send-cap expectation up front. */}
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-900">Sending cap: {SEND_CAP.toLocaleString()} contacts per campaign.</strong>
                <p className="mt-1">If this segment matches more than that, you'll be prompted to split it into a static List (or narrow the filter) before it can be sent as one campaign.</p>
              </div>
            </div>
          </div>
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}

export default SparkSegmentsPage;
