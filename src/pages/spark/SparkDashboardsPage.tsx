// SparkDashboardsPage — Saved dashboards, with widgets that read real numbers.
//
// SPARK pack 2: THE WIDGETS RENDER DATA NOW. Until today every widget on every
// dashboard drew its own title, its own type, the URL it WOULD have called and
// the words "Widget renderer pending" — under a banner promising v1.1. Every
// one of those endpoints had been live for months.
//
// Each widget reads through components/spark/dashboardWidgets, which pairs a
// source with a reader that knows the shape of that endpoint's answer. A saved
// layout naming a source we have no reader for says so plainly; it does not
// draw a number.
//
// LOADING, ERROR AND EMPTY ARE THREE DIFFERENT THINGS, and each looks
// different. A business with no contacts has zero contacts and sees 0. A
// request that FAILED says it failed. The two were the same state on the IA
// Insights pages until SPARK pack 1, and they invented a year of charts.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Star, Share2, Pencil, LayoutDashboard, Check, X, AlertTriangle } from "lucide-react";
import { readerFor, DEFAULT_WIDGET_SOURCES, WIDGET_SOURCES } from "../../components/spark/dashboardWidgets";
import type { WidgetValue } from "../../components/spark/dashboardWidgets";

interface Widget {
  type: string;
  title?: string;
  size?: "sm" | "md" | "lg" | "xl";
  [key: string]: unknown;
}

interface DashboardLayout {
  widgets: Widget[];
}

interface Dashboard {
  id: number;
  tenant_id: string;
  owner_user: string | null;
  name: string;
  description: string | null;
  layout_json: string;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// The starting layout. Built FROM the catalogue rather than typed out beside
// it, so a default widget cannot name an endpoint that has no reader — which is
// exactly what two of the old five did (`/contacts/count` and
// `/campaigns/count` have never existed).
const DEFAULT_WIDGETS: Widget[] = DEFAULT_WIDGET_SOURCES.map((source) => {
  const w = WIDGET_SOURCES.find((x) => x.source === source)!;
  return {
    type: w.kind,
    title: w.title,
    size: w.kind === "metric" ? "sm" : w.kind === "chart" ? "lg" : "md",
    source: w.source,
  };
});

export function SparkDashboardsPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [list, setList] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_shared: false, is_default: false });

  // Inline edit-name state for the selected dashboard
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Dashboard[] }>("/api/v1/dashboards");
      const items = r?.data || [];
      setList(items);
      if (items.length > 0 && selectedId == null) {
        const def = items.find((d) => d.is_default) || items[0];
        setSelectedId(def.id);
      }
    } catch (err) { setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, ready]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const selected = list.find((d) => d.id === selectedId) || null;

  async function create() {
    const name = form.name.trim();
    if (!name) return;
    try {
      const layout: DashboardLayout = { widgets: DEFAULT_WIDGETS };
      const r = await post<{ data: Dashboard }>("/api/v1/dashboards", {
        name,
        description: form.description || null,
        layout,
        is_shared: form.is_shared,
        is_default: form.is_default,
      });
      setCreating(false);
      setForm({ name: "", description: "", is_shared: false, is_default: false });
      await fetchList();
      if (r?.data?.id) setSelectedId(r.data.id);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this dashboard? This cannot be undone.")) return;
    try {
      await del(`/api/v1/dashboards/${id}`);
      if (selectedId === id) setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleDefault(d: Dashboard) {
    try {
      await patch(`/api/v1/dashboards/${d.id}`, { is_default: !d.is_default });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleShared(d: Dashboard) {
    try {
      await patch(`/api/v1/dashboards/${d.id}`, { is_shared: !d.is_shared });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function saveRename() {
    if (!selected) return;
    const name = renameVal.trim();
    if (!name) return;
    try {
      await patch(`/api/v1/dashboards/${selected.id}`, { name });
      setRenameOpen(false);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  function parseLayout(layout_json: string): DashboardLayout {
    try {
      const obj = JSON.parse(layout_json);
      if (obj && Array.isArray(obj.widgets)) return obj;
    } catch { /* fall through */ }
    return { widgets: [] };
  }

  return (
    <SparkPageShell
      title="Dashboards"
      subtitle={`${list.length} saved`}
      help="Saved widget layouts you can return to. Mark one as default to land on it when you open the page. Mark as shared to make it visible to all tenant users."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New dashboard
        </button>
      }
      loading={loading}
      error={error}
    >
      {creating && (
        <CreateModal
          form={form}
          setForm={setForm}
          onCancel={() => { setCreating(false); setForm({ name: "", description: "", is_shared: false, is_default: false }); }}
          onCreate={create}
        />
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <LayoutDashboard className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No dashboards yet</div>
          <div className="text-xs text-slate-500 mt-1">Create your first dashboard to save a widget layout.</div>
          <button onClick={() => setCreating(true)} className="mt-4 text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">
            Create dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Sidebar list */}
          <aside>
            <ul className="space-y-1">
              {list.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                      selectedId === d.id
                        ? "border-[#EF6C33] bg-orange-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">{d.name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {d.is_default && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                        {d.is_shared && <Share2 className="h-3 w-3 text-blue-500" />}
                      </div>
                    </div>
                    {d.description && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{d.description}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Detail */}
          <section>
            {selected ? (
              <DashboardDetail
                d={selected}
                layout={parseLayout(selected.layout_json)}
                renameOpen={renameOpen}
                renameVal={renameVal}
                onRenameStart={() => { setRenameVal(selected.name); setRenameOpen(true); }}
                onRenameChange={setRenameVal}
                onRenameSave={saveRename}
                onRenameCancel={() => setRenameOpen(false)}
                onToggleDefault={() => toggleDefault(selected)}
                onToggleShared={() => toggleShared(selected)}
                onDelete={() => remove(selected.id)}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
                Select a dashboard from the list to view its layout.
              </div>
            )}
          </section>
        </div>
      )}
    </SparkPageShell>
  );
}

// ── Detail pane ────────────────────────────────────────────────────────

function DashboardDetail(props: {
  d: Dashboard;
  layout: DashboardLayout;
  renameOpen: boolean;
  renameVal: string;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameSave: () => void;
  onRenameCancel: () => void;
  onToggleDefault: () => void;
  onToggleShared: () => void;
  onDelete: () => void;
}) {
  const { d, layout, renameOpen, renameVal, onRenameStart, onRenameChange, onRenameSave, onRenameCancel, onToggleDefault, onToggleShared, onDelete } = props;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Header strip */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          {renameOpen ? (
            <div className="flex items-center gap-1">
              <input
                value={renameVal}
                onChange={(e) => onRenameChange(e.target.value)}
                className="flex-1 text-base font-semibold text-slate-900 border border-slate-300 rounded px-2 py-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(); if (e.key === "Escape") onRenameCancel(); }}
              />
              <button onClick={onRenameSave} className="text-emerald-600 hover:bg-emerald-50 rounded p-1" title="Save"><Check className="h-4 w-4" /></button>
              <button onClick={onRenameCancel} className="text-slate-500 hover:bg-slate-100 rounded p-1" title="Cancel"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 truncate">{d.name}</h3>
              <button onClick={onRenameStart} className="text-slate-400 hover:text-slate-700" title="Rename">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {d.description && <div className="text-xs text-slate-500 mt-0.5">{d.description}</div>}
          <div className="text-[10px] text-slate-400 mt-1">
            {d.owner_user ? `Owned by ${d.owner_user}` : "Shared"} · updated {new Date(d.updated_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleDefault}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded border ${d.is_default ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            title={d.is_default ? "Default dashboard" : "Make default"}
          >
            <Star className={`h-3 w-3 ${d.is_default ? "fill-amber-400" : ""}`} />
            {d.is_default ? "Default" : "Set default"}
          </button>
          <button
            onClick={onToggleShared}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded border ${d.is_shared ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            title={d.is_shared ? "Shared with tenant" : "Make shared"}
          >
            <Share2 className="h-3 w-3" />
            {d.is_shared ? "Shared" : "Private"}
          </button>
          <button onClick={onDelete} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>

      {/* Widget grid */}
      {layout.widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-xs text-slate-500">
          No widgets configured. Edit layout JSON to add widgets.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-3">
          {layout.widgets.map((w, i) => (
            <WidgetCard key={i} widget={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetCard({ widget }: { widget: Widget }) {
  const { get, ready } = useSparkApi();
  const size = widget.size || "md";
  const span = size === "sm" ? "col-span-12 sm:col-span-6 md:col-span-3" :
               size === "md" ? "col-span-12 md:col-span-6" :
               size === "lg" ? "col-span-12 md:col-span-8" :
                              "col-span-12";

  const reader = useMemo(() => readerFor(widget.source), [widget.source]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unsupported">(
    reader ? "loading" : "unsupported"
  );
  const [value, setValue] = useState<WidgetValue | null>(null);

  useEffect(() => {
    if (!reader || !ready) return;
    let cancelled = false;
    setState("loading");
    get<unknown>(reader.source)
      .then((payload) => {
        if (cancelled) return;
        setValue(reader.read(payload));
        setState("ready");
      })
      .catch(() => {
        // An error is NOT an empty dashboard. A widget that renders 0 because a
        // request failed is a number somebody could repeat in a meeting.
        if (!cancelled) setState("error");
      });
    return () => { cancelled = true; };
  }, [reader, ready, get]);

  const title = widget.title || reader?.title || "(untitled)";

  return (
    <div className={`${span} rounded border border-slate-200 bg-white p-3 min-h-[120px]`}>
      <div className="text-xs font-semibold text-slate-700 truncate">{title}</div>

      {state === "unsupported" && (
        <div className="mt-3 text-[11px] text-slate-500">
          This widget points at something we do not have a reader for, so there is nothing
          to show. Remove it and add one from the list.
          <div className="mt-1 font-mono text-[10px] text-slate-400 break-all">
            {typeof widget.source === "string" ? widget.source : "no source"}
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="mt-4 h-6 w-24 animate-pulse rounded bg-slate-100" aria-label="loading" />
      )}

      {state === "error" && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>We could not read this number just now. That is a problem on our side, not with your account.</span>
        </div>
      )}

      {state === "ready" && value && reader && (
        <>
          {reader.kind === "metric" && (
            value.metric == null ? (
              <div className="mt-3 text-[11px] text-slate-500">
                {value.emptyNote || "Nothing to show yet."}
              </div>
            ) : (
              <>
                <div className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                  {value.metric.toLocaleString()}
                  {value.suffix ? <span className="ml-0.5 text-base font-semibold text-slate-400">{value.suffix}</span> : null}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{reader.caption}</div>
              </>
            )
          )}

          {reader.kind === "chart" && (
            (value.series || []).length === 0 ? (
              <div className="mt-3 text-[11px] text-slate-500">{value.emptyNote || "Nothing to show yet."}</div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {(value.series || []).map((pt) => {
                  const max = Math.max(...(value.series || []).map((x) => x.value), 1);
                  return (
                    <li key={pt.label} className="text-[11px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate capitalize text-slate-600">{pt.label}</span>
                        <span className="tabular-nums font-semibold text-slate-900">{pt.value.toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 w-full rounded bg-slate-100">
                        <div className="h-1.5 rounded bg-[#EF6C33]" style={{ width: `${Math.round((pt.value / max) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}

          {reader.kind === "list" && (
            (value.rows || []).length === 0 ? (
              <div className="mt-3 text-[11px] text-slate-500">{value.emptyNote || "Nothing to show yet."}</div>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {(value.rows || []).map((row) => (
                  <li key={row.id} className="py-1.5">
                    <div className="truncate text-[11px] font-medium text-slate-800">{row.title}</div>
                    {row.detail && <div className="truncate text-[10px] text-slate-500">{row.detail}</div>}
                    {row.at && (
                      <div className="text-[10px] text-slate-400">{new Date(row.at).toLocaleString()}</div>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}
    </div>
  );
}

// ── Create modal ───────────────────────────────────────────────────────

function CreateModal(props: {
  form: { name: string; description: string; is_shared: boolean; is_default: boolean };
  setForm: (next: { name: string; description: string; is_shared: boolean; is_default: boolean }) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const { form, setForm, onCancel, onCreate } = props;
  return (
    <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
      <div className="text-sm font-bold text-slate-900 mb-3">New dashboard</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Name *</div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="My team overview"
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
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-700">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          Make this my default dashboard
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.is_shared} onChange={(e) => setForm({ ...form, is_shared: e.target.checked })} />
          Share with my whole tenant
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          onClick={onCreate}
          disabled={!form.name.trim()}
          className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50"
        >
          Create
        </button>
      </div>
      <div className="text-[10px] text-slate-500 mt-2">
        A starter layout with metrics, an activity chart, and a recent-activity feed is created automatically. You can customize widgets later.
      </div>
    </div>
  );
}

export default SparkDashboardsPage;
