// ConsultingRequestsBoardPage — FOUNDER Service Requests board (2026-07-24).
//
// Replaces ConsultingTicketsBoardPage, which read lumen.consulting_ticket —
// the abandoned fork, verified 0 rows in prod. This board is a lens on
// consulting.service_request: every row here is a task/request in the 7-stage
// pipeline, and each approved one carries an OLIVER job (source='consulting').
//
//   New → In Progress → Client Review → Revision → Client Revision Review
//       → Approved → Completed          (Cancelled from any pre-completed stage)
//
// Data: GET /consulting/requests (founder sees all tenants). Transitions:
// PATCH /consulting/requests/:id { stage, status } — server-validated, so a
// stale UI shows a 400 rather than corrupting anything. Creating here uses
// POST /consulting/requests with an explicit client tenant.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import { Plus, AlertCircle, Briefcase } from "lucide-react";
import {
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  TASK_ACTIONS,
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
  project_name?: string | null;
  milestone_name?: string | null;
  client_display_name?: string | null;
  client_company?: string | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
}

interface TenantOption { tenant_id: string; name: string }

const STAGE_ORDER = [
  "new", "in_progress", "client_review", "revision",
  "client_revision_review", "approved", "completed", "cancelled",
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
    ([r.client_first_name, r.client_last_name].filter(Boolean).join(" ") || null)
  );
}

// ─── Create modal (founder — must name the client tenant) ────────────────
function CreateRequestModal({
  tenants,
  onClose,
  onCreated,
}: {
  tenants: TenantOption[];
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
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Select a client…</option>
            {tenants.map((t) => (
              <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !title.trim() || !tenantId}
            className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create request"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────
export function ConsultingRequestsBoardPage() {
  const { getFounder, patch, ready } = useOliverApi();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
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

  // Tenant names + the create-modal client options. Same proven picker source
  // the create-project modal uses (/consulting/_/active-oliver-clients —
  // Brandon's LOCKED 2026-07-04 broadening to ALL founder-tenant contacts).
  // Fail-soft: raw tenant ids are an acceptable fallback for display.
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
      .catch(() => { /* raw tenant ids are an acceptable fallback */ });
    return () => { cancelled = true; };
  }, [getFounder, ready]);

  const transition = async (r: RequestRow, value: string) => {
    const [stage, status] = value.split("|");
    if (!stage || !status) return;
    setBusyId(r.id);
    setError(null);
    try {
      await patch(`/consulting/requests/${r.id}`, { stage, status });
      await load();
    } catch (e) {
      setError((e as Error).message || "Transition failed.");
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<string, RequestRow[]> = {};
    for (const s of STAGE_ORDER) g[s] = [];
    for (const r of rows) (g[r.stage] || (g[r.stage] = [])).push(r);
    return g;
  }, [rows]);

  const tenantOptions = useMemo<TenantOption[]>(
    () => Object.entries(tenantNames)
      .map(([tenant_id, name]) => ({ tenant_id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [tenantNames],
  );

  const visibleStages = showDone
    ? STAGE_ORDER
    : STAGE_ORDER.filter((s) => s !== "completed" && s !== "cancelled");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Service Requests</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Client asks and milestone tasks, one pipeline. Approving a New request creates its OLIVER job.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show completed &amp; cancelled
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
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <Briefcase className="mx-auto mb-2 h-8 w-8 text-slate-400" />
          <div className="text-sm font-semibold text-slate-700">No service requests yet.</div>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Tasks you add to project milestones appear here automatically, and clients can submit
            requests from their portal. You can also create one directly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleStages.map((stage) => {
            const items = grouped[stage] || [];
            if (!items.length) return null;
            return (
              <section key={stage}>
                <h2 className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: STAGE_TINT[stage] }}>
                  {TASK_STAGE_LABELS[stage] || stage}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{items.length}</span>
                </h2>
                <div className="card" style={{ padding: 0 }}>
                  <ul className="divide-y divide-slate-100">
                    {items.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">{r.title}</span>
                            {r.oliver_job_id && (
                              <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700" title="Synced to an OLIVER job">
                                OLIVER
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="font-medium text-slate-600">
                              {clientName(r) || tenantNames[String(r.tenant_id).toUpperCase()] || "—"}
                            </span>
                            {r.project_name && <span>· {r.project_name}{r.milestone_name ? ` / ${r.milestone_name}` : ""}</span>}
                            <span>· {TASK_STATUS_LABELS[r.status] || r.status}</span>
                            <span>· {r.origin === "client" ? "Client request" : r.origin === "milestone" ? "Milestone task" : "Founder-created"}</span>
                          </div>
                        </div>
                        <select
                          value=""
                          disabled={busyId === r.id}
                          onChange={(e) => { if (e.target.value) transition(r, e.target.value); }}
                          className="flex-shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-600"
                        >
                          <option value="">{busyId === r.id ? "Saving…" : "Move…"}</option>
                          {(TASK_ACTIONS[r.stage] || [])
                            .filter((a) => a.value !== `${r.stage}|${r.status}`)
                            .map((a) => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateRequestModal
          tenants={tenantOptions}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

export default ConsultingRequestsBoardPage;
