// SparkSavedSearchesPage — Reusable saved-filter library (v3.2).
//
// Stores named filter sets per entity (contact/deal/lead/campaign). Pin a
// search for quick access; share it to make it available to the whole
// tenant. The filter body is opaque JSON validated on save.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Star, Share2, Pencil, Search, Play, Save, X } from "lucide-react";

type EntityKind = "contact" | "deal" | "lead" | "campaign";

interface SavedSearch {
  id: number;
  owner_user: string | null;
  name: string;
  entity_kind: EntityKind;
  filters_json: string;
  is_shared: boolean;
  is_pinned: boolean;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

interface FormState {
  name: string;
  entity_kind: EntityKind;
  filters_text: string;
  is_shared: boolean;
  is_pinned: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  entity_kind: "contact",
  filters_text: "{\n  \n}",
  is_shared: false,
  is_pinned: false,
};

const ENTITY_KINDS: EntityKind[] = ["contact", "deal", "lead", "campaign"];

const ENTITY_BADGE: Record<EntityKind, string> = {
  contact: "#0EA5E9",
  deal: "#7C3AED",
  lead: "#EF6C33",
  campaign: "#059669",
};

function filtersPreview(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    const flat = JSON.stringify(obj);
    return flat.length > 80 ? `${flat.slice(0, 77)}…` : flat;
  } catch {
    const trimmed = raw.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
  }
}

export function SparkSavedSearchesPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [list, setList] = useState<SavedSearch[]>([]);
  const [kindFilter, setKindFilter] = useState<"all" | EntityKind>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Modal state — create OR edit (editingId === null means create)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const url = kindFilter === "all"
        ? "/api/v1/saved-searches"
        : `/api/v1/saved-searches?kind=${kindFilter}`;
      const r = await get<{ data: SavedSearch[] }>(url);
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, kindFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setJsonError(null);
    setModalOpen(true);
  }

  function openEdit(s: SavedSearch) {
    setEditingId(s.id);
    let pretty = s.filters_json;
    try { pretty = JSON.stringify(JSON.parse(s.filters_json), null, 2); }
    catch { /* leave as-is */ }
    setForm({
      name: s.name,
      entity_kind: s.entity_kind,
      filters_text: pretty,
      is_shared: s.is_shared,
      is_pinned: s.is_pinned,
    });
    setJsonError(null);
    setModalOpen(true);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return;
    let parsed: unknown;
    try { parsed = JSON.parse(form.filters_text); }
    catch (e) { setJsonError(`Invalid JSON: ${(e as Error).message}`); return; }
    setJsonError(null);
    try {
      if (editingId == null) {
        await post("/api/v1/saved-searches", {
          name,
          entity_kind: form.entity_kind,
          filters: parsed,
          is_shared: form.is_shared,
          is_pinned: form.is_pinned,
        });
      } else {
        await patch(`/api/v1/saved-searches/${editingId}`, {
          name,
          entity_kind: form.entity_kind,
          filters: parsed,
          is_shared: form.is_shared,
          is_pinned: form.is_pinned,
        });
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(s: SavedSearch) {
    if (!confirm(`Delete saved search "${s.name}"? This cannot be undone.`)) return;
    try {
      await del(`/api/v1/saved-searches/${s.id}`);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function togglePinned(s: SavedSearch) {
    try {
      await patch(`/api/v1/saved-searches/${s.id}`, { is_pinned: !s.is_pinned });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleShared(s: SavedSearch) {
    try {
      await patch(`/api/v1/saved-searches/${s.id}`, { is_shared: !s.is_shared });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function markRun(s: SavedSearch) {
    try {
      await post(`/api/v1/saved-searches/${s.id}/touch`, {});
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  // Group by entity_kind, pinned items first within each group.
  const grouped = useMemo(() => {
    const map = new Map<EntityKind, SavedSearch[]>();
    for (const k of ENTITY_KINDS) map.set(k, []);
    for (const s of list) {
      if (!map.has(s.entity_kind)) map.set(s.entity_kind, []);
      map.get(s.entity_kind)!.push(s);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [list]);

  const visibleKinds = kindFilter === "all" ? ENTITY_KINDS : [kindFilter];

  return (
    <SparkPageShell
      title="Saved Searches"
      subtitle={`${list.length} saved`}
      help="Reusable named filter sets across Contacts, Deals, Leads, and Campaigns. Pin one for quick access; share it to make it available to your whole tenant."
      actions={
        <button onClick={openCreate} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New search
        </button>
      }
      filters={
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Kind</span>
          <button
            onClick={() => setKindFilter("all")}
            className={`text-xs px-2 py-1 rounded border ${kindFilter === "all" ? "bg-[#EF6C33] border-[#EF6C33] text-white" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            All
          </button>
          {ENTITY_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`text-xs px-2 py-1 rounded border capitalize ${kindFilter === k ? "bg-[#EF6C33] border-[#EF6C33] text-white" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}
            >
              {k}
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Search className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No saved searches yet</div>
          <div className="text-xs text-slate-500 mt-1">Create your first reusable filter.</div>
          <button onClick={openCreate} className="mt-4 text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">
            Create saved search
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleKinds.map((k) => {
            const rows = grouped.get(k) || [];
            if (rows.length === 0) return null;
            return (
              <div key={k} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide text-white px-1.5 py-0.5 rounded-full"
                      style={{ background: ENTITY_BADGE[k] }}
                    >
                      {k}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      {rows.length} search{rows.length === 1 ? "" : "es"}
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {rows.map((s) => (
                    <li key={s.id} className={`px-4 py-2.5 flex items-center gap-3 ${s.is_pinned ? "bg-orange-50/40" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{s.name}</span>
                          {s.is_pinned && <Star className="h-3 w-3 text-amber-500 fill-amber-400 flex-shrink-0" />}
                          {s.is_shared && <Share2 className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                          {s.run_count > 0 && (
                            <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
                              {s.run_count} run{s.run_count === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <code className="text-[11px] text-slate-500 font-mono break-all">
                          {filtersPreview(s.filters_json)}
                        </code>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {s.owner_user ? `Owned by ${s.owner_user}` : "Shared"}
                          {s.last_run_at && ` · last run ${new Date(s.last_run_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => markRun(s)}
                          className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                          title="Mark as run"
                        >
                          <Play className="h-3 w-3" /> Run
                        </button>
                        <button
                          onClick={() => togglePinned(s)}
                          className={`text-[11px] px-1.5 py-1 rounded border ${s.is_pinned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                          title={s.is_pinned ? "Unpin" : "Pin"}
                        >
                          <Star className={`h-3 w-3 ${s.is_pinned ? "fill-amber-400" : ""}`} />
                        </button>
                        <button
                          onClick={() => toggleShared(s)}
                          className={`text-[11px] px-1.5 py-1 rounded border ${s.is_shared ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                          title={s.is_shared ? "Make private" : "Share with tenant"}
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => openEdit(s)}
                          className="text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => remove(s)}
                          className="text-[11px] px-1.5 py-1 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold flex items-center gap-2">
                <Search className="h-4 w-4" /> {editingId == null ? "New saved search" : "Edit saved search"}
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="High-value contacts, last 30 days"
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#EF6C33]"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Entity kind</label>
              <select
                value={form.entity_kind}
                onChange={(e) => setForm({ ...form, entity_kind: e.target.value as EntityKind })}
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#EF6C33]"
              >
                {ENTITY_KINDS.map((k) => (
                  <option key={k} value={k} className="capitalize">{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Filters (JSON)</label>
              <textarea
                value={form.filters_text}
                onChange={(e) => { setForm({ ...form, filters_text: e.target.value }); setJsonError(null); }}
                rows={8}
                className={`w-full text-xs border rounded p-2 mt-0.5 font-mono ${jsonError ? "border-rose-300" : "border-slate-300"}`}
                spellCheck={false}
              />
              {jsonError && <div className="text-[11px] text-rose-600 mt-1">{jsonError}</div>}
              <p className="text-[10px] text-slate-500 mt-1">Opaque JSON — the shape is determined by the entity's filter schema.</p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} />
                Pin to top
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.is_shared} onChange={(e) => setForm({ ...form, is_shared: e.target.checked })} />
                Share with my whole tenant
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModalOpen(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button
                onClick={save}
                disabled={!form.name.trim()}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1"
              >
                <Save className="h-3.5 w-3.5" /> {editingId == null ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkSavedSearchesPage;
