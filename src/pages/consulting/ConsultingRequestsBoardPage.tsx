// ConsultingRequestsBoardPage — FOUNDER Service Requests KANBAN (2026-07-24).
//
// A true bucket board: one column per pipeline stage, always visible even
// when empty (Brandon: "a job board with the buckets we discussed"). Cards
// carry an editable STATUS select — same-stage statuses and legal next-stage
// moves in one control, server-validated (PATCH /consulting/requests/:id).
// Data: consulting.service_request via GET /consulting/requests. Every
// founder call is founder-scoped (patchFounder/getFounder) so a lingering
// view-as override can never reroute a founder transition.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import { Plus, AlertCircle } from "lucide-react";
import {
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  TASK_ACTIONS,
  TaskDetailModal,
  type ConsultingTask,
  type TaskDeliverable,
} from "../../components/consulting/ConsultingProjectModal";

interface RequestRow {
  id: string;
  tenant_id: string;
  project_id?: string | null;
  milestone_id?: string | null;
  title: string;
  description?: string | null;
  stage: string;
  status: string;
  origin: string;
  oliver_job_id?: string | null;
  created_at: string;
  updated_at: string;
  deliverables?: TaskDeliverable[];
  project_name?: string | null;
  milestone_name?: string | null;
  client_display_name?: string | null;
  client_company?: string | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
  /** Owning business name from core.tenants — present even with no project. */
  tenant_name?: string | null;
}

const STAGE_ORDER = [
  "new", "in_progress", "client_review", "revision",
  "client_revision_review", "approved", "completed",
] as const;

const STAGE_TINT: Record<string, string> = {
  new: "#64748b",
  in_progress: "#d97706",
  client_review: "#2563eb",
  revision: "#b45309",
  client_revision_review: "#2563eb",
  approved: "#059669",
  completed: "#334155",
  cancelled: "#b91c1c",
};

function clientName(r: RequestRow): string | null {
  return (
    r.client_display_name ||
    r.client_company ||
    ([r.client_first_name, r.client_last_name].filter(Boolean).join(" ") || null) ||
    // Falls back to the owning business. The fields above all come from
    // lumen.contact joined through the PROJECT, so a request a client filed
    // directly (no project) had no name at all — see ConsultingWorkBoardPage.
    r.tenant_name ||
    null
  );
}

function CreateRequestModal({
  tenants,
  onClose,
  onCreated,
}: {
  tenants: Array<{ tenant_id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { postFounder } = useOliverApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || !tenantId) return;
    setBusy(true); setError(null);
    try {
      await postFounder("/consulting/requests", {
        title: title.trim(),
        description: description.trim() || undefined,
        tenant_id: tenantId,
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message || "Could not create the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="NEW SERVICE REQUEST"
      title="Create a service request"
      subtitle="Standalone work not tied to a project. It starts in New — approve it to create the OLIVER job."
      size="info"
    >
      <div className="p-4 space-y-3">
        {error && (
          <div className="inline-flex items-center gap-1.5 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Client *</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Select a client…</option>
            {tenants.map((t) => <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !title.trim() || !tenantId}
            className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create request"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

export function ConsultingRequestsBoardPage() {
  const { getFounder, patchFounder, ready } = useOliverApi();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [openRow, setOpenRow] = useState<RequestRow | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    try {
      const data = await getFounder<RequestRow[]>("/consulting/requests");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getFounder, ready]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getFounder<{ clients?: Array<{ tenant_id?: string | null; business_name?: string | null; display_name?: string | null; company_name?: string | null }> }>(
      "/consulting/_/active-oliver-clients",
    )
      .then((r) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        (r?.clients || []).forEach((c) => {
          if (!c.tenant_id) return;
          map[String(c.tenant_id).toUpperCase()] =
            (c.business_name && c.business_name !== "(unnamed)" ? c.business_name : null) ||
            c.display_name || c.company_name || c.tenant_id;
        });
        setTenantNames(map);
      })
      .catch(() => { /* raw ids are an acceptable fallback */ });
    return () => { cancelled = true; };
  }, [getFounder, ready]);

  const transition = async (r: RequestRow, value: string) => {
    const [stage, status] = value.split("|");
    if (!stage || !status || (stage === r.stage && status === r.status)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await patchFounder(`/consulting/requests/${r.id}`, { stage, status });
      await load();
    } catch (e) {
      setError((e as Error).message || "Transition failed.");
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, RequestRow[]> = {};
    for (const s of [...STAGE_ORDER, "cancelled"]) g[s] = [];
    for (const r of rows) (g[r.stage] || (g[r.stage] = [])).push(r);
    return g;
  }, [rows]);

  const tenantOptions = useMemo(
    () => Object.entries(tenantNames)
      .map(([tenant_id, name]) => ({ tenant_id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [tenantNames],
  );

  const columns: string[] = showCancelled ? [...STAGE_ORDER, "cancelled"] : [...STAGE_ORDER];

  return (
    // Page-width convention: content never runs full-bleed — cap at 80%.
    <div className="mx-auto space-y-4" style={{ maxWidth: "80%" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Service Requests</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Client asks and milestone tasks, one pipeline. Approving a New request creates its OLIVER job.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled
          </label>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d95d27]"
          >
            <Plus className="h-3.5 w-3.5" /> New Request
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>Loading…</div>
      ) : (
        // The board: fixed columns, horizontal scroll, every bucket always
        // visible so work drops into the right column at a glance.
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-3" style={{ minWidth: `${columns.length * 252}px` }}>
            {columns.map((stage) => {
              const items = grouped[stage] || [];
              return (
                <div key={stage} className="w-60 flex-shrink-0 rounded-xl border border-slate-200 bg-slate-50/80">
                  <div
                    className="flex items-center justify-between rounded-t-xl border-b-2 bg-white px-3 py-2"
                    style={{ borderBottomColor: STAGE_TINT[stage] }}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: STAGE_TINT[stage] }}>
                      {TASK_STAGE_LABELS[stage] || stage}
                    </span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2 p-2" style={{ minHeight: 80 }}>
                    {items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-[10px] italic text-slate-400">
                        Empty
                      </div>
                    ) : (
                      items.map((r) => (
                        <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                          <div className="flex items-start justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => setOpenRow(r)}
                              className="text-left text-xs font-semibold leading-snug text-slate-900 hover:underline"
                              title="Open task"
                            >
                              {r.title}
                              {(r.deliverables?.length || 0) > 0 && (
                                <span className="ml-1 text-[9px] text-sky-600">📄{r.deliverables?.length}</span>
                              )}
                            </button>
                            {r.oliver_job_id && (
                              <span className="mt-0.5 flex-shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700" title="Synced to an OLIVER job">
                                OLIVER
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] leading-snug text-slate-500">
                            <div className="font-medium text-slate-600">
                              {clientName(r) || tenantNames[String(r.tenant_id).toUpperCase()] || "—"}
                            </div>
                            {r.project_name && (
                              <div className="truncate">{r.project_name}{r.milestone_name ? ` / ${r.milestone_name}` : ""}</div>
                            )}
                            <div className="mt-0.5 text-slate-400">
                              {r.origin === "client" ? "Client request" : r.origin === "milestone" ? "Milestone task" : "Founder-created"}
                            </div>
                          </div>
                          {/* Editable status: current pair + every legal move. */}
                          <select
                            value={`${r.stage}|${r.status}`}
                            disabled={busyId === r.id}
                            onChange={(e) => transition(r, e.target.value)}
                            className="mt-1.5 w-full rounded border border-slate-300 bg-white px-1 py-1 text-[10px] text-slate-700"
                          >
                            <option value={`${r.stage}|${r.status}`}>
                              {busyId === r.id ? "Saving…" : (TASK_STATUS_LABELS[r.status] || r.status)}
                            </option>
                            {(TASK_ACTIONS[r.stage] || [])
                              .filter((a) => a.value !== `${r.stage}|${r.status}`)
                              .map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateRequestModal
          tenants={tenantOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {openRow && (
        <TaskDetailModal
          task={openRow as ConsultingTask}
          deliverables={openRow.deliverables || []}
          onClose={() => setOpenRow(null)}
          onChanged={() => { setOpenRow(null); load(); }}
        />
      )}
    </div>
  );
}

export default ConsultingRequestsBoardPage;
