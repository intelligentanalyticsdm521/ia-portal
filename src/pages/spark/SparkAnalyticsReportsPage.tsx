// SparkAnalyticsReportsPage — Unified analytics report builder (LUMEN-API v2.9).
//
// Master/detail layout: sidebar lists saved reports, detail pane renders the
// last run results. Reports are made of "sections" — each section pulls from
// a named source (activity_summary, health_distribution, etc.) and renders as
// one of a small set of visual kinds (bar/line/metric/metric_group).
//
// Pattern modeled on SparkDashboardsPage. Pure CSS bars + an SVG polyline for
// line charts — no chart library dependency.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import {
  BarChart3, LineChart, PieChart, Star, Share2, Play, Plus, Trash2, Pencil,
  X, Check, ArrowUp, ArrowDown,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface AnalyticsReport {
  id: number;
  name: string;
  description: string | null;
  sections_json: string;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  run_count: number;
}

interface SectionDef {
  key: string;
  title: string;
  kind?: "bar" | "line" | "metric" | "metric_group";
  source: string;
  options?: { days?: number };
}

type SectionResult =
  | { kind: "bar"; days?: number; items: { label: string; value: number }[] }
  | { kind: "line"; days?: number; items: { label: string; value: number }[] }
  | { kind: "metric"; note?: string; value?: number | string; label?: string }
  | { kind: "metric_group"; metrics: { label: string; value: number | string; color?: string }[] };

interface RunResult {
  report: { id: number; name: string; description: string | null };
  sections: (SectionResult & { key: string; title: string })[];
  run_at: string;
}

interface SourceMeta {
  key: string;
  label: string;
}

// Sources where a `days` option is meaningful (time-windowed series/aggregates).
const DAYS_AWARE_SOURCES = new Set([
  "activity_summary",
  "sms_campaign_stats",
  "email_engagement",
  "new_contacts",
]);

// Default sections populated on Create — gives a sensible starter report.
const DEFAULT_SECTIONS: SectionDef[] = [
  { key: "activity", title: "Activity Last 30 Days", kind: "bar", source: "activity_summary", options: { days: 30 } },
  { key: "health",   title: "Health Score Distribution", kind: "metric_group", source: "health_distribution" },
  { key: "contacts", title: "New Contacts (30d)", kind: "line", source: "new_contacts", options: { days: 30 } },
  { key: "anomaly",  title: "Open Anomalies", kind: "metric", source: "anomaly_open" },
];

// ── Helpers ────────────────────────────────────────────────────────────

function parseSections(json: string): SectionDef[] {
  try {
    const obj = JSON.parse(json);
    if (Array.isArray(obj)) return obj as SectionDef[];
  } catch { /* fall through */ }
  return [];
}

function fmtDate(d: string | null) { return d ? new Date(d).toLocaleString() : "—"; }

// ── Page ───────────────────────────────────────────────────────────────

export function SparkAnalyticsReportsPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('spark');

  const { get, post, patch, del, ready } = useSparkApi();

  const [list, setList] = useState<AnalyticsReport[]>([]);
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Run state — cached per report id so flipping between reports doesn't blow away the last result
  const [runs, setRuns] = useState<Record<number, RunResult>>({});
  const [running, setRunning] = useState<Record<number, boolean>>({});

  // Modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorForm, setEditorForm] = useState<EditorForm>(emptyForm());

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [r, s] = await Promise.all([
        get<{ data: AnalyticsReport[] }>("/api/v1/analytics-reports"),
        get<{ data: SourceMeta[] }>("/api/v1/analytics-reports/sources"),
      ]);
      const items = r?.data || [];
      setList(items);
      setSources(s?.data || []);
      if (items.length > 0 && selectedId == null) {
        const def = items.find((x) => x.is_default) || items[0];
        setSelectedId(def.id);
      }
    } catch (err) { setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, ready]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const selected = list.find((d) => d.id === selectedId) || null;

  // ── Mutations ─────────────────────────────────────────────────────────

  async function runReport(id: number) {
    setRunning((p) => ({ ...p, [id]: true }));
    try {
      const r = await post<RunResult>(`/api/v1/analytics-reports/${id}/run`, {});
      if (r) setRuns((p) => ({ ...p, [id]: r }));
      // Refresh row so last_run_at / run_count update in the sidebar
      await fetchList();
    } catch (err) { alert(`Run failed: ${(err as Error).message}`); }
    finally { setRunning((p) => ({ ...p, [id]: false })); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    try {
      await del(`/api/v1/analytics-reports/${id}`);
      if (selectedId === id) setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function saveEditor() {
    const name = editorForm.name.trim();
    if (!name) return;
    const cleanSections = editorForm.sections
      .filter((s) => s.source)
      .map((s, i) => ({
        key: s.key || `s${i + 1}`,
        title: s.title || s.source,
        source: s.source,
        options: DAYS_AWARE_SOURCES.has(s.source) ? { days: s.days } : undefined,
      }));
    const body = {
      name,
      description: editorForm.description || null,
      sections: cleanSections,
      is_default: editorForm.is_default,
      is_shared: editorForm.is_shared,
    };
    try {
      if (editorMode === "create") {
        const r = await post<{ data: AnalyticsReport }>("/api/v1/analytics-reports", body);
        await fetchList();
        if (r?.data?.id) setSelectedId(r.data.id);
      } else if (editorForm.id != null) {
        await patch(`/api/v1/analytics-reports/${editorForm.id}`, body);
        await fetchList();
      }
      setEditorOpen(false);
      setEditorForm(emptyForm());
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  function openCreate() {
    setEditorMode("create");
    setEditorForm({
      id: null,
      name: "",
      description: "",
      is_default: false,
      is_shared: false,
      sections: DEFAULT_SECTIONS.map((s) => ({
        key: s.key,
        title: s.title,
        source: s.source,
        days: s.options?.days ?? 30,
      })),
    });
    setEditorOpen(true);
  }

  function openEdit(r: AnalyticsReport) {
    const parsed = parseSections(r.sections_json);
    setEditorMode("edit");
    setEditorForm({
      id: r.id,
      name: r.name,
      description: r.description || "",
      is_default: r.is_default,
      is_shared: r.is_shared,
      sections: parsed.map((s) => ({
        key: s.key,
        title: s.title,
        source: s.source,
        days: s.options?.days ?? 30,
      })),
    });
    setEditorOpen(true);
  }

  // ── Render ────────────────────────────────────────────────────────────

  const currentRun = selected ? runs[selected.id] : undefined;
  const isRunning = selected ? !!running[selected.id] : false;

  return (
    <SparkPageShell
      title="Analytics Reports"
      subtitle={`${list.length} saved`}
      help="Build saved analytics reports out of named sections — activity, health, SMS, email, contacts, and anomalies. Run a report to fetch fresh data; star one as default; share with the tenant."
      actions={
        <button onClick={openCreate} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New report
        </button>
      }
      loading={loading}
      error={error}
    >
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'spark_campaigns', label: 'Campaign results' },
        { id: 'spark_list_health', label: 'List health' },
        { id: 'spark_contact_sources', label: 'By source' },
        { id: 'spark_lead_sources', label: 'Leads by source' },
        { id: 'spark_send_times', label: 'Best send times' },
        { id: 'spark_bounce_domains', label: 'Bounces by domain' },
        { id: 'spark_stage_flow', label: 'Pipeline flow' },
      ]} />
      {editorOpen && (
        <ReportEditor
          mode={editorMode}
          form={editorForm}
          setForm={setEditorForm}
          sources={sources}
          onCancel={() => { setEditorOpen(false); setEditorForm(emptyForm()); }}
          onSave={saveEditor}
        />
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <BarChart3 className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No reports yet</div>
          <div className="text-xs text-slate-500 mt-1">Create your first analytics report — a starter layout is included.</div>
          <button onClick={openCreate} className="mt-4 text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">
            Create report
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Sidebar */}
          <aside>
            <ul className="space-y-1">
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                      selectedId === r.id
                        ? "border-[#EF6C33] bg-orange-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">{r.name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {r.is_default && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                        {r.is_shared && <Share2 className="h-3 w-3 text-blue-500" />}
                      </div>
                    </div>
                    {r.description && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{r.description}</div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-1">
                      {r.last_run_at ? `Run ${new Date(r.last_run_at).toLocaleDateString()}` : "Never run"} · {r.run_count}×
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Detail */}
          <section>
            {selected ? (
              <ReportDetail
                report={selected}
                run={currentRun}
                running={isRunning}
                onRun={() => runReport(selected.id)}
                onEdit={() => openEdit(selected)}
                onDelete={() => remove(selected.id)}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
                Select a report from the list to view its sections.
              </div>
            )}
          </section>
        </div>
      )}
    </SparkPageShell>
  );
}

// ── Detail pane ────────────────────────────────────────────────────────

function ReportDetail(props: {
  report: AnalyticsReport;
  run: RunResult | undefined;
  running: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { report, run, running, onRun, onEdit, onDelete } = props;
  const sections = useMemo(() => parseSections(report.sections_json), [report.sections_json]);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900 truncate">{report.name}</h3>
          {report.description && <div className="text-xs text-slate-500 mt-0.5">{report.description}</div>}
          <div className="text-[10px] text-slate-400 mt-1">
            Last run {fmtDate(report.last_run_at)} · {report.run_count} run{report.run_count === 1 ? "" : "s"}
            {run && <> · viewing {fmtDate(run.run_at)}</>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onRun}
            disabled={running}
            className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50"
            title="Run this report now"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? "Running…" : "Run report"}
          </button>
          <button onClick={onEdit} className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button onClick={onDelete} className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>

      {/* Sections — show last run if available, else section skeletons */}
      {run ? (
        <div className="space-y-4">
          {run.sections.map((s, i) => (
            <SectionCard key={s.key || i} title={s.title} result={s} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-xs text-slate-500">
              This report has no sections. Click Edit to add some.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 py-4 px-3 text-xs text-amber-800">
                This report hasn&apos;t been run yet. Click <strong>Run report</strong> above to fetch fresh data.
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sections.map((s) => (
                  <li key={s.key} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-700">{s.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Source: <span className="font-mono">{s.source}</span>
                      {s.options?.days != null && <> · {s.options.days}d</>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section renderer ───────────────────────────────────────────────────

function SectionCard({ title, result }: { title: string; result: SectionResult }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded text-white" style={{ background: kindColor(result.kind) }}>
          {result.kind}
        </span>
      </div>
      {result.kind === "metric_group" && <MetricGroupView metrics={result.metrics} />}
      {result.kind === "bar" && <BarView items={result.items} />}
      {result.kind === "line" && <LineView items={result.items} />}
      {result.kind === "metric" && <MetricView note={result.note} label={result.label} value={result.value} />}
    </div>
  );
}

function kindColor(kind: string) {
  switch (kind) {
    case "bar": return "#EF6C33";
    case "line": return "#0EA5E9";
    case "metric_group": return "#7C3AED";
    case "metric": return "#0F766E";
    default: return "#64748B";
  }
}

function MetricGroupView({ metrics }: { metrics: { label: string; value: number | string; color?: string }[] }) {
  if (!metrics || metrics.length === 0) {
    return <div className="text-xs text-slate-400 italic">No metrics returned.</div>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {metrics.map((m, i) => (
        <div key={i} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">{m.label}</div>
          <div className="text-lg font-bold mt-0.5" style={{ color: m.color || "#0F172A" }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function BarView({ items }: { items: { label: string; value: number }[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-slate-400 italic">No data.</div>;
  }
  const top = items.slice(0, 10);
  const max = Math.max(1, ...top.map((d) => d.value));
  return (
    <ul className="space-y-1">
      {top.map((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <li key={i} className="flex items-center gap-2 text-xs">
            <div className="w-28 truncate text-slate-700 flex-shrink-0">{d.label}</div>
            <div className="flex-1 h-4 bg-slate-100 rounded relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-[#EF6C33] rounded" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-12 text-right font-mono text-slate-600 flex-shrink-0">{d.value}</div>
          </li>
        );
      })}
    </ul>
  );
}

function LineView({ items }: { items: { label: string; value: number }[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-slate-400 italic">No data.</div>;
  }
  const pts = items.slice(-60); // cap at 60 points
  const w = 600;
  const h = 100;
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const min = Math.min(0, ...pts.map((p) => p.value));
  const range = Math.max(1, max - min);
  const stepX = pts.length > 1 ? innerW / (pts.length - 1) : 0;
  const coords = pts.map((p, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - ((p.value - min) / range) * innerH;
    return { x, y, p };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  // Pick a few date ticks: first, middle, last
  const tickIdx = pts.length <= 1
    ? [0]
    : pts.length === 2
    ? [0, 1]
    : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" style={{ display: "block", height: 120 }}>
        {/* Y-axis labels */}
        <text x={padL - 4} y={padT + 8} textAnchor="end" fontSize="9" fill="#94A3B8">{max}</text>
        <text x={padL - 4} y={padT + innerH} textAnchor="end" fontSize="9" fill="#94A3B8">{min}</text>
        {/* Baseline */}
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#E2E8F0" strokeWidth="1" />
        {/* Polyline */}
        <path d={path} fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* End-cap dot */}
        {coords.length > 0 && (
          <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="2.5" fill="#0EA5E9" />
        )}
        {/* X-axis tick labels */}
        {tickIdx.map((idx) => {
          const c = coords[idx];
          if (!c) return null;
          return (
            <text key={idx} x={c.x} y={h - 4} textAnchor="middle" fontSize="9" fill="#94A3B8">
              {shortDate(c.p.label)}
            </text>
          );
        })}
      </svg>
      <div className="text-[10px] text-slate-400 mt-1">{pts.length} points</div>
    </div>
  );
}

function MetricView(props: { note?: string; label?: string; value?: number | string }) {
  const { note, label, value } = props;
  if (value != null) {
    return (
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {label && <div className="text-xs text-slate-500">{label}</div>}
      </div>
    );
  }
  return (
    <div className="text-xs text-slate-600">
      {note || <span className="italic text-slate-400">No data.</span>}
    </div>
  );
}

function shortDate(s: string): string {
  // Accept ISO strings or YYYY-MM-DD; render MM-DD.
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[2]}-${m[3]}`;
  return s.slice(0, 6);
}

// ── Editor (create + edit) ─────────────────────────────────────────────

interface EditorSection {
  key: string;
  title: string;
  source: string;
  days: number;
}
interface EditorForm {
  id: number | null;
  name: string;
  description: string;
  is_default: boolean;
  is_shared: boolean;
  sections: EditorSection[];
}
function emptyForm(): EditorForm {
  return { id: null, name: "", description: "", is_default: false, is_shared: false, sections: [] };
}

function ReportEditor(props: {
  mode: "create" | "edit";
  form: EditorForm;
  setForm: (next: EditorForm) => void;
  sources: SourceMeta[];
  onCancel: () => void;
  onSave: () => void;
}) {
  const { mode, form, setForm, sources, onCancel, onSave } = props;

  function updateSection(i: number, patch: Partial<EditorSection>) {
    const next = form.sections.slice();
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, sections: next });
  }
  function removeSection(i: number) {
    const next = form.sections.slice();
    next.splice(i, 1);
    setForm({ ...form, sections: next });
  }
  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= form.sections.length) return;
    const next = form.sections.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, sections: next });
  }
  function addSection() {
    const firstSource = sources[0]?.key || "activity_summary";
    const newSec: EditorSection = {
      key: `s${form.sections.length + 1}`,
      title: "New section",
      source: firstSource,
      days: 30,
    };
    setForm({ ...form, sections: [...form.sections, newSec] });
  }

  return (
    <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-slate-900">
          {mode === "create" ? "New analytics report" : "Edit report"}
        </div>
        <button onClick={onCancel} className="text-slate-500 hover:bg-slate-100 rounded p-1" title="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Name + description */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Name *</div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Weekly Pulse"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
            autoFocus
          />
        </label>
        <label className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</div>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="(optional)"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
          />
        </label>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-700">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          Make this my default report
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.is_shared} onChange={(e) => setForm({ ...form, is_shared: e.target.checked })} />
          Share with my whole tenant
        </label>
      </div>

      {/* Sections editor */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Sections ({form.sections.length})</div>
          <button onClick={addSection} className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
            <Plus className="h-3 w-3" /> Add section
          </button>
        </div>
        {form.sections.length === 0 ? (
          <div className="rounded border border-dashed border-slate-300 bg-white py-6 text-center text-xs text-slate-500">
            No sections. Click <strong>Add section</strong> to start.
          </div>
        ) : (
          <ul className="space-y-2">
            {form.sections.map((s, i) => {
              const supportsDays = DAYS_AWARE_SOURCES.has(s.source);
              return (
                <li key={i} className="rounded border border-slate-200 bg-white p-2 flex items-start gap-2">
                  {/* Up/down */}
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button
                      onClick={() => moveSection(i, -1)}
                      disabled={i === 0}
                      className="text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveSection(i, 1)}
                      disabled={i === form.sections.length - 1}
                      className="text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Fields */}
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <label className="col-span-12 md:col-span-5 text-xs">
                      <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Title</div>
                      <input
                        value={s.title}
                        onChange={(e) => updateSection(i, { title: e.target.value })}
                        className="w-full text-sm border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33]"
                      />
                    </label>
                    <label className="col-span-8 md:col-span-5 text-xs">
                      <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Source</div>
                      <select
                        value={s.source}
                        onChange={(e) => updateSection(i, { source: e.target.value })}
                        className="w-full text-sm border border-slate-300 rounded px-2 py-1 bg-white focus:border-[#EF6C33]"
                      >
                        {sources.length === 0 && <option value={s.source}>{s.source}</option>}
                        {sources.map((src) => (
                          <option key={src.key} value={src.key}>{src.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-4 md:col-span-2 text-xs">
                      <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Days</div>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={s.days}
                        onChange={(e) => updateSection(i, { days: Number(e.target.value) || 30 })}
                        disabled={!supportsDays}
                        className="w-full text-sm border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33] disabled:bg-slate-100 disabled:text-slate-400"
                        title={supportsDays ? "Days window" : "Days not used by this source"}
                      />
                    </label>
                  </div>
                  {/* Remove */}
                  <button
                    onClick={() => removeSection(i)}
                    className="text-red-500 hover:bg-red-50 rounded p-1 self-start mt-4"
                    title="Remove section"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!form.name.trim()}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {mode === "create" ? "Create report" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// Suppress an "unused import" warning if PieChart/LineChart aren't used in JSX above.
// The icons are imported per the page spec — keep them referenced so tree-shake-aware
// linters don't complain. (Reference-via-noop: a tiny exported tuple.)
export const __SPARK_ANALYTICS_ICONS__ = [BarChart3, LineChart, PieChart];

export default SparkAnalyticsReportsPage;
