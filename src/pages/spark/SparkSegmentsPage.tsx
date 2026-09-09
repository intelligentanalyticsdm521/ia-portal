import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Plus, Filter, Users, Zap, Sparkles, AlertTriangle, Trash2 } from "lucide-react";
import { SegmentRuleBuilder, matchesEveryone, SEGMENT_FIELDS, type SegmentFilters } from "../../components/spark/SegmentRuleBuilder";

import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
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
  contact_count: number | null;
  created_at: string;
}

// Quick-start templates. These used to be prose ("Contact Intelligence Tier =
// X") that nothing parsed, so picking one produced a segment with no rules —
// which matches every contact. Each now carries real rules the evaluator
// implements, so a template is a working segment the moment it is saved.
const TEMPLATES: Array<{ name: string; description: string; filters: SegmentFilters }> = [
  { name: "Hot leads", description: "Your highest-scoring contacts — likely buyers and most engaged",
    filters: { match: "all", rules: [{ field: "lead_score", op: ">=", value: 70 }] } },
  { name: "Engaged in the last 30 days", description: "Opened or clicked a campaign recently",
    filters: { match: "all", rules: [{ field: "email_opened_in_days", op: "<=", value: 30 }] } },
  { name: "Gone quiet (60+ days)", description: "No activity in two months — re-engagement candidates",
    filters: { match: "all", rules: [{ field: "last_seen_days", op: ">=", value: 60 }] } },
  { name: "Has a phone, no email", description: "SMS-only outreach targets",
    filters: { match: "all", rules: [
      { field: "phone", op: "exists", value: "" },
      { field: "email", op: "not_exists", value: "" },
    ] } },
  { name: "Customers", description: "Everyone whose lifecycle stage is customer",
    filters: { match: "all", rules: [{ field: "stage", op: "=", value: "customer" }] } },
];

/**
 * One-line, readable summary of a saved segment's rules for the table.
 *
 * The row used to print `filter_summary`, the free-text field the old create
 * form collected. Nothing parses that text and nothing writes it any more, so
 * it would render blank on every segment made with the rule builder.
 */
function describeFilters(raw?: string): string {
  let f: SegmentFilters | null = null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    if (parsed && Array.isArray(parsed.rules)) f = parsed as SegmentFilters;
  } catch { /* fall through to the unreadable case below */ }

  if (!f) return "Filter could not be read";
  // Said plainly, because it is true and it is the thing worth knowing.
  if (!f.rules.length) return "No rules — matches every contact";

  const join = f.match === "any" ? " or " : " and ";
  return f.rules
    .map((r) => {
      const field = SEGMENT_FIELDS.find((x) => x.key === r.field)?.label || r.field;
      if (r.op === "exists") return `${field} has a value`;
      if (r.op === "not_exists") return `${field} is empty`;
      const val = Array.isArray(r.value) ? r.value.join(", ") : String(r.value ?? "");
      const op = r.op === "in" ? "is any of" : r.op === "not in" ? "is none of" : r.op;
      return `${field} ${op} ${val}`;
    })
    .join(join);
}

export function SparkSegmentsPage() {
  const insightsPayload = useProductInsightsPayload('spark').payload;
  // put/del are needed to edit and delete segments from the builder.
  const { get, post, put, del, ready } = useSparkApi();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; filters: SegmentFilters }>({
    name: "", filters: { match: "all", rules: [] },
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Choices for the tag / list rule pickers.
  const [tags, setTags] = useState<string[]>([]);
  const [lists, setLists] = useState<Array<{ id: number; name: string }>>([]);
  // Live "who matches" count, so a rule is verifiable before it is saved.
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Segment[] }>("/api/v1/segments");
      setSegments(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  // Tags and lists for the rule pickers. Loaded once — a rule can only offer
  // what the tenant actually has.
  useEffect(() => {
    if (!ready) return;
    get<{ data: Array<{ name: string }> }>("/api/v1/tags")
      .then((r) => setTags((r.data || []).map((t) => t.name).filter(Boolean)))
      .catch(() => setTags([]));
    get<{ data: Array<{ id: number; name: string }> }>("/api/v1/lists?limit=200")
      .then((r) => setLists((r.data || []).map((l) => ({ id: l.id, name: l.name }))))
      .catch(() => setLists([]));
  }, [get, ready]);

  // Count who matches, as the rules are edited. Debounced, because every
  // keystroke in a value box would otherwise be a query.
  useEffect(() => {
    if (!drawerOpen || !ready) return;
    if (!form.filters.rules.length) { setMatchCount(null); return; }
    let cancelled = false;
    setCounting(true);
    const t = setTimeout(() => {
      // POST /segments/preview answers { data: [...contacts], meta: { total } }
      // — the count lives on meta, not data.
      post<{ data: unknown[]; meta: { total: number } }>("/api/v1/segments/preview", { filters: form.filters })
        .then((r) => { if (!cancelled) setMatchCount(r?.meta?.total ?? null); })
        .catch(() => { if (!cancelled) setMatchCount(null); })
        .finally(() => { if (!cancelled) setCounting(false); });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.filters, drawerOpen, ready, post]);

  function openNew() {
    setEditingId(null);
    setForm({ name: "", filters: { match: "all", rules: [] } });
    setMatchCount(null);
    setDrawerOpen(true);
  }

  // Segments were previously create-only: there was no way to open one, so a
  // typo in a rule meant deleting and rebuilding it.
  function openEdit(seg: Segment) {
    let parsed: SegmentFilters = { match: "all", rules: [] };
    try {
      const raw = typeof seg.filters === "string" ? JSON.parse(seg.filters || "{}") : (seg.filters || {});
      if (raw && Array.isArray(raw.rules)) parsed = { match: raw.match === "any" ? "any" : "all", rules: raw.rules };
    } catch { /* unparseable filters open as empty rather than blocking the edit */ }
    setEditingId(seg.id);
    setForm({ name: seg.name, filters: parsed });
    setMatchCount(null);
    setDrawerOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    // A segment with no rules matches every contact, and a segment can be a
    // campaign's audience — so this is refused rather than warned about.
    if (matchesEveryone(form.filters)) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), filters: form.filters };
      if (editingId) await put(`/api/v1/segments/${editingId}`, payload);
      else await post("/api/v1/segments", payload);
      setDrawerOpen(false);
      setEditingId(null);
      setForm({ name: "", filters: { match: "all", rules: [] } });
      await load();
    } catch (err) { setError(err); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm("Delete this segment? Contacts are not affected — only the saved filter goes.")) return;
    try {
      await del(`/api/v1/segments/${editingId}`);
      setDrawerOpen(false);
      setEditingId(null);
      await load();
    } catch (err) { setError(err); }
  }

  function useTemplate(t: typeof TEMPLATES[number]) {
    setEditingId(null);
    setForm({ name: t.name, filters: t.filters });
    setMatchCount(null);
    setDrawerOpen(true);
  }

  const totalContacts = segments.reduce((s, x) => s + (x.contact_count ?? 0), 0);

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
        <button onClick={openNew} className="spark-btn spark-btn-accent">
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
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_segments', label: 'Segment sizes' },
      ]} />
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
                    <div className="text-[10px] text-violet-700 mt-1.5 truncate">{describeFilters(JSON.stringify(t.filters))}</div>
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
          onRowClick={openEdit}
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
                    <div className="text-xs text-slate-500 truncate">{describeFilters(s.filters)}</div>
                  </div>
                </div>
              ),
            },
            {
              key: "count", header: "Matches", width: "compact",
              cell: s => (
                // The API answers null when a segment's filters could not be
                // evaluated. Calling toLocaleString on that throws and takes
                // the whole table with it.
                s.contact_count == null ? (
                  <span className="text-xs italic text-slate-400" title="This segment's rules could not be evaluated.">
                    —
                  </span>
                ) : s.contact_count > SEND_CAP ? (
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
        eyebrow="SPARK · SEGMENT"
        title={editingId ? "Edit segment" : "New segment"}
        subtitle="Build the rule and see who matches before you save it."
        size="info"
        footer={
          <>
            {editingId && (
              <button
                onClick={handleDelete}
                className="mr-auto inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="h-3 w-3" /> Delete segment
              </button>
            )}
            <IadmButton variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</IadmButton>
            <IadmButton
              variant="accent"
              product="spark"
              onClick={handleSave}
              disabled={saving || !form.name.trim() || matchesEveryone(form.filters)}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Create segment"}
            </IadmButton>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <div className="spark-field">
            <label className="spark-field-label">Name</label>
            <input
              className="spark-field-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Customers in Iowa who opened something recently"
              autoFocus
            />
          </div>

          <div>
            <label className="spark-field-label mb-1.5 block">Rules</label>
            <SegmentRuleBuilder
              value={form.filters}
              onChange={(filters) => setForm({ ...form, filters })}
              tags={tags}
              lists={lists}
              matchCount={matchCount}
              counting={counting}
            />
          </div>

          {/* SP-6 — set the send-cap expectation up front, and only once the
              count is actually known to exceed it. */}
          {matchCount != null && matchCount > SEND_CAP && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                <div>
                  <strong className="text-amber-900">
                    This matches more than the {SEND_CAP.toLocaleString()}-per-campaign cap.
                  </strong>
                  <p className="mt-1">
                    Narrow the rules, or split the audience into a list, before sending it as one campaign.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}

export default SparkSegmentsPage;
