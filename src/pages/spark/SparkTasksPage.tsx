// SparkTasksPage — admin surface for SPARK named tasks (lumen.spark_task).
//
// Why this page exists
//   F-CS.6 added a `task_call` automation step + a `lumen.spark_task` table
//   whose rows are referenced by id. F-CS.3 surfaced a "named tasks dropdown"
//   in the IL Suggestions Customize editor. The dropdown reads from
//   GET /api/v1/spark_tasks, but until this page shipped there was no way
//   for tenants to create, rename, or retire those rows from the UI — the
//   table had to be hand-edited via SSMS.
//
// Phase 1 scope (per build prompt)
//   - List active + inactive tasks with search.
//   - "New task" → SparkTaskEditorModal (Overview / Steps / Activity tabs).
//   - Click row → edit.
//   - Delete from the modal (soft delete, is_active = 0).
//   - Step editing is Phase 2; the modal's Steps tab is read-only.
//
// LUMEN-API endpoints (batch 8 commit 0bca7a1):
//   GET    /api/v1/spark_tasks?search=&include_inactive=true → list
//   POST   /api/v1/spark_tasks                               → create
//   PATCH  /api/v1/spark_tasks/:id                           → update
//   DELETE /api/v1/spark_tasks/:id                           → soft delete
//
// sparkApi does NOT auto-unwrap, so every call destructures `.data`.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, AlertTriangle, Power, ListOrdered } from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkTaskEditorModal } from "../../components/spark/SparkTaskEditorModal";

interface SparkTaskRow {
  task_id: number;
  name: string;
  description: string | null;
  step_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function SparkTasksPage() {
  const { get, del, ready } = useSparkApi();
  const [rows, setRows] = useState<SparkTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("include_inactive", "true");
      const qs = params.toString();
      const r = await get<{ data: SparkTaskRow[] }>(
        `/api/v1/spark_tasks${qs ? `?${qs}` : ""}`
      );
      setRows(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, showInactive]);

  useEffect(() => { load(); }, [load]);

  // Local search filter — the API supports server-side search, but for the
  // typically-small task list (tenants rarely have more than 20-30) client-
  // side filtering gives instant feedback without an extra round-trip per
  // keystroke.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name?.toLowerCase().includes(q));
  }, [rows, search]);

  async function deleteRow(r: SparkTaskRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${r.name}"? Any automation step that calls this task by id will start failing immediately.`)) return;
    try {
      await del<{ ok: true }>(`/api/v1/spark_tasks/${r.task_id}`);
      await load();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[delete spark_task]", err);
      alert("Delete failed: " + ((err as Error)?.message || err));
    }
  }

  const activeCount = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <SparkPageShell
      title="Tasks"
      subtitle={`${activeCount} active${inactiveCount ? ` · ${inactiveCount} inactive` : ""}`}
      help="Reusable named sub-automations. Any IL automation step of kind `task_call` invokes a row from this list by id. Define a task once, then have many automations call it — useful for shared retry/escalation patterns."
      loading={loading}
      error={error}
      actions={
        <button
          onClick={() => setEditor({ id: null })}
          className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New task
        </button>
      }
    >
      {/* Search + show-inactive toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-slate-300 rounded-md pl-7 pr-2 py-1 w-64"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {/* Table or empty state */}
      {filtered.length === 0 && !loading ? (
        <EmptyState onNew={() => setEditor({ id: null })} hasAny={rows.length > 0} />
      ) : (
        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 w-24 text-right">Steps</th>
                <th className="px-3 py-2 w-24 text-right">Status</th>
                <th className="px-3 py-2 w-48">Updated</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr
                  key={row.task_id}
                  onClick={() => setEditor({ id: row.task_id })}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{row.name}</span>
                      {!row.is_active && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <ListOrdered className="h-3 w-3 text-slate-400" />
                      {row.step_count.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-[10px] uppercase font-bold inline-flex items-center gap-0.5 ${row.is_active ? "text-emerald-700" : "text-amber-700"}`}>
                      <Power className="h-2.5 w-2.5" /> {row.is_active ? "On" : "Off"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => deleteRow(row, e)}
                      title="Delete"
                      className="text-rose-600 hover:bg-rose-50 rounded p-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor modal — single instance, drives both create + edit. */}
      {editor && (
        <SparkTaskEditorModal
          open={true}
          taskId={editor.id}
          onClose={() => setEditor(null)}
          onChanged={() => { setEditor(null); load(); }}
        />
      )}
    </SparkPageShell>
  );
}

function EmptyState({ onNew, hasAny }: { onNew: () => void; hasAny: boolean }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <AlertTriangle className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">
        {hasAny ? "No matching tasks" : "No tasks yet"}
      </h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        {hasAny
          ? "Try a different search term, or clear the filter to see all tasks."
          : "Create your first reusable task. Once it exists, any automation step of kind `task_call` can invoke it by id."}
      </p>
      <button
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
      >
        <Plus className="h-3.5 w-3.5" /> New task
      </button>
    </div>
  );
}

export default SparkTasksPage;
