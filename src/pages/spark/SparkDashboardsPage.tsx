// SparkDashboardsPage — Saved dashboards with widget layouts.
//
// Lets a user save named collections of widgets (any JSON-serializable
// layout) for personal or shared use. The widget renderer is intentionally
// minimal here — the layout itself is opaque JSON. A future Phase will plug
// each widget type into a real chart/table component.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Star, Share2, Pencil, LayoutDashboard, Check, X } from "lucide-react";
import { ComingSoonBanner } from "../../components/ComingSoonBanner";

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

// Default widget palette — a sensible starting layout the user can edit.
const DEFAULT_WIDGETS: Widget[] = [
  { type: "metric", title: "Total Contacts", size: "sm", source: "/api/v1/contacts/count" },
  { type: "metric", title: "Active Campaigns", size: "sm", source: "/api/v1/campaigns/count" },
  { type: "metric", title: "Average Health Score", size: "sm", source: "/api/v1/health-score/distribution" },
  { type: "chart", title: "Activity (30d)", size: "lg", source: "/api/v1/activity/summary?days=30", chart: "bar" },
  { type: "list", title: "Recent Activity", size: "md", source: "/api/v1/activity?limit=10" },
];

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
      <ComingSoonBanner
        feature="Dashboard Widgets"
        detail={
          <>
            You can create + save dashboard layouts today, but the individual widget
            renderers (metric tiles, charts, lists) are stubbed — they show the layout
            shape and source endpoint, not live data. Real widget rendering ships with
            v1.1 once the underlying data APIs settle.
          </>
        }
        eta="v1.1"
      />
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
  const size = widget.size || "md";
  const span = size === "sm" ? "col-span-12 sm:col-span-6 md:col-span-3" :
               size === "md" ? "col-span-12 md:col-span-6" :
               size === "lg" ? "col-span-12 md:col-span-8" :
                              "col-span-12";
  const typeColors: Record<string, string> = {
    metric: "#0F766E",
    chart: "#2563EB",
    list: "#7C3AED",
    table: "#0EA5E9",
  };
  const c = typeColors[widget.type] || "#64748B";
  return (
    <div className={`${span} rounded border border-slate-200 bg-slate-50 p-3 min-h-[120px]`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700 truncate">{widget.title || "(untitled)"}</span>
        <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded text-white" style={{ background: c }}>
          {widget.type}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 font-mono break-all">
        {typeof widget.source === "string" ? widget.source : "—"}
      </div>
      <div className="mt-2 text-[10px] text-slate-400 italic">
        Widget renderer pending — layout shape preserved.
      </div>
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
