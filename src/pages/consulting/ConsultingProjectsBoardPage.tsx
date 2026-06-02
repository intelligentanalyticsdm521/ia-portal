// ConsultingProjectsBoardPage — F-140
//
// Project hub: card grid of all active projects with phase progress bar +
// client name + open request count. Click → 4-tab project modal
// (Overview / Phases / Requests / Artifacts).
//
// Phases tab is the workflow brain — operator transitions phases here,
// which (a) auto-advance to the next phase on completion, (b) auto-create
// "Review" Requests on the Requests Board when a phase enters
// client_review.

import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal } from "../../components/IadmModal";

type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
type PhaseStatus = "pending" | "in_progress" | "client_review" | "completed" | "skipped";

interface ProjectType {
  type_key: string;
  display_name: string;
  default_phases: Array<{ name: string; order: number; description?: string }>;
  color: string;
}

interface Project {
  project_id: string;
  project_number: string;
  provider_tenant_id: string;
  client_tenant_id: string;
  provider_business_name?: string | null;
  client_business_name?: string | null;
  project_type: string;
  project_type_display: string;
  project_type_color: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  engagement_type?: string | null;
  current_phase_name?: string | null;
  target_completion_date?: string | null;
  budget_hours?: number | null;
  hours_logged: number;
  phase_count: number;
  phases_completed: number;
  open_request_count: number;
  created_at: string;
  updated_at: string;
}

interface Phase {
  phase_id: number;
  name: string;
  description?: string;
  phase_order: number;
  status: PhaseStatus;
  target_completion_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  auto_request_on_review: boolean;
}

interface Artifact {
  artifact_id: string;
  phase_id: number | null;
  kind: string;
  title: string;
  description?: string;
  file_url?: string;
  external_link?: string;
  status: string;
  is_client_visible: boolean;
  uploaded_by_kind: string;
  uploaded_by_name?: string;
  created_at: string;
}

interface RequestRow {
  ticket_id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "#3b82f6", on_hold: "#f59e0b", completed: "#10b981", cancelled: "#94a3b8",
};

const PHASE_COLOR: Record<PhaseStatus, string> = {
  pending: "#cbd5e1", in_progress: "#3b82f6", client_review: "#8b5cf6",
  completed: "#10b981", skipped: "#94a3b8",
};

const ARTIFACT_KINDS = ["proposal", "design", "contract", "brief", "spec", "code", "copy", "other"];

export function ConsultingProjectsBoardPage() {
  const { get, post, patch, ready } = useOliverApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<ProjectType[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (typeFilter) qs.set("project_type", typeFilter);
      const r = await get<{ data: { projects: Project[] } }>(`/consulting-projects?${qs}`);
      setProjects(r.data?.projects || []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready, statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ready) return;
    get<{ data: { types: ProjectType[] } }>("/consulting-projects/_/types")
      .then(r => setTypes(r.data?.types || []))
      .catch(() => {});
  }, [get, ready]);

  return (
    <OliverPageWrapper title="Projects" subtitle="IA Consulting · Multi-phase engagements" error={error} loading={loading}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-[#EF6C33] text-white text-sm font-semibold hover:bg-[#d75a25]">
            ＋ New Project
          </button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="">All statuses</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All types</option>
            {types.map(t => <option key={t.type_key} value={t.type_key}>{t.display_name}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500">{projects.length} project{projects.length === 1 ? "" : "s"}</span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
            No projects yet. Click <strong>+ New Project</strong> to start one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map(p => {
              const progressPct = p.phase_count > 0 ? Math.round((p.phases_completed / p.phase_count) * 100) : 0;
              return (
                <button key={p.project_id} onClick={() => setOpenProjectId(p.project_id)}
                  className="text-left bg-white rounded-xl border-2 border-slate-200 hover:border-slate-300 hover:shadow-md p-4 transition">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-[10px] font-mono text-slate-500">{p.project_number}</div>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ background: p.project_type_color }}>
                        {p.project_type_display}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ background: STATUS_COLOR[p.status] }}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900 mb-1">{p.title}</div>
                  {p.client_business_name && (
                    <div className="text-xs text-slate-600 mb-2">📁 {p.client_business_name}</div>
                  )}

                  {/* Phase progress */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>{p.current_phase_name || "—"}</span>
                      <span>{p.phases_completed}/{p.phase_count} phases</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#EF6C33] rounded-full" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    {p.open_request_count > 0 && <span>📋 {p.open_request_count} open requests</span>}
                    {p.hours_logged > 0 && <span>⏱ {p.hours_logged}h logged</span>}
                    {p.target_completion_date && <span>📅 due {new Date(p.target_completion_date).toLocaleDateString()}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openProjectId && (
        <ProjectDetailModal projectId={openProjectId} onClose={() => setOpenProjectId(null)} onChanged={load} />
      )}
      {showCreate && (
        <CreateProjectModal types={types} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </OliverPageWrapper>
  );
}

function ProjectDetailModal({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged: () => void; }) {
  const { get, post, patch } = useOliverApi();
  const [detail, setDetail] = useState<{ project: Project; phases: Phase[]; artifacts: Artifact[]; requests: RequestRow[] } | null>(null);
  const [tab, setTab] = useState<"overview" | "phases" | "requests" | "artifacts">("overview");
  const [showAddArtifact, setShowAddArtifact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await get<{ data: any }>(`/consulting-projects/${projectId}`);
      setDetail(r.data);
    } catch (e) { setErr((e as Error).message); }
  }, [get, projectId]);

  useEffect(() => { load(); }, [load]);

  const setPhaseStatus = async (phaseId: number, status: PhaseStatus) => {
    setBusy(true); setErr(null);
    try {
      await patch(`/consulting-projects/${projectId}/phases/${phaseId}`, { to_status: undefined, status });
      await load(); onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!detail) {
    return (
      <IadmModal open onClose={onClose} product="oliver" eyebrow="PROJECT" title="Loading…" size="report">
        <div className="p-8 text-center text-slate-500">Loading…</div>
      </IadmModal>
    );
  }

  const p = detail.project;

  return (
    <IadmModal open onClose={onClose} product="oliver"
      eyebrow={`${p.project_number} · ${p.client_business_name || ""}`}
      title={p.title} size="report">
      <div className="border-b border-slate-200 px-4 flex gap-1">
        {(["overview", "phases", "requests", "artifacts"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
              tab === t ? "border-b-2 border-[#EF6C33] text-[#EF6C33]" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t}
            {t === "requests" && p.open_request_count > 0 && <span className="ml-1 px-1 bg-amber-100 text-amber-800 text-[10px] rounded">{p.open_request_count}</span>}
          </button>
        ))}
      </div>

      <div className="p-4 max-h-[70vh] overflow-y-auto space-y-3">
        {err && <div className="text-sm text-rose-600">{err}</div>}

        {tab === "overview" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Type:</span> <strong>{p.project_type_display}</strong></div>
              <div><span className="text-slate-500">Status:</span> <strong>{p.status}</strong></div>
              <div><span className="text-slate-500">Client:</span> {p.client_business_name || "—"}</div>
              <div><span className="text-slate-500">Current phase:</span> {p.current_phase_name || "—"}</div>
              {p.target_completion_date && <div><span className="text-slate-500">Target completion:</span> {new Date(p.target_completion_date).toLocaleDateString()}</div>}
              {p.budget_hours != null && <div><span className="text-slate-500">Budget:</span> {p.budget_hours}h ({p.hours_logged}h logged)</div>}
            </div>
            {p.description && (
              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-sm whitespace-pre-wrap">{p.description}</div>
            )}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1">Phases</div>
              <div className="flex gap-1 overflow-x-auto">
                {detail.phases.map(ph => (
                  <div key={ph.phase_id} className="flex-1 min-w-[80px] text-center">
                    <div className="h-1.5 rounded-full" style={{ background: PHASE_COLOR[ph.status] }} />
                    <div className="text-[10px] text-slate-600 mt-1 truncate">{ph.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "phases" && (
          <div className="space-y-2">
            {detail.phases.map(ph => (
              <div key={ph.phase_id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-500">#{ph.phase_order}</span>
                  <span className="font-semibold text-slate-900">{ph.name}</span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white ml-auto" style={{ background: PHASE_COLOR[ph.status] }}>
                    {ph.status.replace(/_/g, " ")}
                  </span>
                </div>
                {ph.description && <div className="text-xs text-slate-600 mb-2">{ph.description}</div>}
                {ph.target_completion_date && <div className="text-[11px] text-slate-500 mb-2">Target: {new Date(ph.target_completion_date).toLocaleDateString()}</div>}
                <div className="flex flex-wrap gap-1">
                  {(["pending", "in_progress", "client_review", "completed", "skipped"] as PhaseStatus[]).filter(s => s !== ph.status).map(s => (
                    <button key={s} disabled={busy} onClick={() => setPhaseStatus(ph.phase_id, s)}
                      className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50">
                      → {s.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "requests" && (
          <div className="space-y-2">
            {detail.requests.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-6">No requests attached to this project yet.</div>
            ) : (
              detail.requests.map(r => (
                <a key={r.ticket_id} href={`/app/services/consulting_tickets?open=${r.ticket_id}`}
                  className="block border border-slate-200 rounded-lg p-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-mono">{r.ticket_number}</span>
                    <span className="uppercase font-bold">{r.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{r.title}</div>
                </a>
              ))
            )}
          </div>
        )}

        {tab === "artifacts" && (
          <div className="space-y-2">
            <button onClick={() => setShowAddArtifact(true)}
              className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-semibold">
              ＋ Add artifact
            </button>
            {detail.artifacts.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-6">No artifacts uploaded yet.</div>
            ) : (
              detail.artifacts.map(a => (
                <div key={a.artifact_id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-bold uppercase">{a.kind}</span>
                    <span>·</span>
                    <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    <span>by {a.uploaded_by_kind}</span>
                    {a.is_client_visible && <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">CLIENT-VISIBLE</span>}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                  {a.description && <div className="text-xs text-slate-600 mt-1">{a.description}</div>}
                  {(a.file_url || a.external_link) && (
                    <a href={a.file_url || a.external_link} target="_blank" rel="noreferrer"
                      className="text-[11px] text-blue-600 hover:underline mt-1 inline-block">
                      Open ↗
                    </a>
                  )}
                </div>
              ))
            )}
            {showAddArtifact && (
              <AddArtifactInline projectId={projectId} phases={detail.phases} onSaved={() => { setShowAddArtifact(false); load(); }} onCancel={() => setShowAddArtifact(false)} />
            )}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

function AddArtifactInline({ projectId, phases, onSaved, onCancel }: { projectId: string; phases: Phase[]; onSaved: () => void; onCancel: () => void; }) {
  const { post } = useOliverApi();
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [kind, setKind] = useState("proposal");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phaseId, setPhaseId] = useState<string>("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (mode === "upload") {
      if (!file) { setErr("Pick a file"); return; }
    } else {
      if (!title) { setErr("Title required"); return; }
    }
    setBusy(true); setErr(null);
    try {
      if (mode === "upload") {
        // Multipart upload via the API base from the oliver hook (manual fetch
        // since useOliverApi.post sends JSON).
        const apiBase = (import.meta.env.VITE_OLIVER_API_BASE as string)
          || "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";
        const token = sessionStorage.getItem("oliver_access_token") || ""; // best-effort; the hook normally injects
        const fd = new FormData();
        fd.append("file", file as Blob);
        fd.append("kind", kind);
        fd.append("title", title || file!.name);
        if (phaseId) fd.append("phase_id", phaseId);
        fd.append("is_client_visible", visible ? "1" : "0");
        const res = await fetch(`${apiBase}/consulting-projects/${projectId}/artifacts/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`Upload failed (HTTP ${res.status}): ${t.slice(0, 200)}`);
        }
      } else {
        await post(`/consulting-projects/${projectId}/artifacts`, {
          kind, title, external_link: link || undefined,
          phase_id: phaseId ? Number(phaseId) : null,
          is_client_visible: visible,
        });
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="border border-[#EF6C33] rounded-lg p-3 bg-orange-50 space-y-2">
      <div className="flex gap-1">
        <button onClick={() => setMode("upload")}
          className={`text-xs px-2 py-1 rounded ${mode === "upload" ? "bg-[#EF6C33] text-white" : "bg-white border border-slate-300"}`}>
          📤 Upload file
        </button>
        <button onClick={() => setMode("link")}
          className={`text-xs px-2 py-1 rounded ${mode === "link" ? "bg-[#EF6C33] text-white" : "bg-white border border-slate-300"}`}>
          🔗 External link
        </button>
      </div>
      <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm">
        {ARTIFACT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "upload" ? "Title (defaults to filename)" : "Title *"}
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      {mode === "upload" ? (
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-xs" />
      ) : (
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://figma.com/..."
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      )}
      <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm">
        <option value="">— no phase —</option>
        {phases.map(ph => <option key={ph.phase_id} value={ph.phase_id}>{ph.name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Client can see this
      </label>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1 rounded border border-slate-300">Cancel</button>
        <button onClick={submit} disabled={busy || (mode === "upload" ? !file : !title)}
          className="text-xs px-3 py-1 rounded bg-[#EF6C33] text-white font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function CreateProjectModal({ types, onClose, onCreated }: { types: ProjectType[]; onClose: () => void; onCreated: () => void; }) {
  const { get, post } = useOliverApi();
  const [clients, setClients] = useState<Array<{ tenant_id: string; business_name: string }>>([]);
  const [type, setType] = useState("");
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    get<{ data: { clients: any[] } }>("/consulting-tickets/_/clients")
      .then(r => setClients(r.data?.clients || []))
      .catch(() => {});
  }, [get]);

  const submit = async () => {
    if (!type || !clientId || !title) { setErr("Type, client, title required"); return; }
    setBusy(true); setErr(null);
    try {
      await post("/consulting-projects", {
        project_type: type, client_tenant_id: clientId, title,
        description: description || undefined,
        target_completion_date: targetDate || undefined,
      });
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const selectedType = types.find(t => t.type_key === type);

  return (
    <IadmModal open onClose={onClose} product="oliver" eyebrow="NEW PROJECT" title="Start a new project" size="info">
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Project type *</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— pick a type —</option>
            {types.map(t => <option key={t.type_key} value={t.type_key}>{t.display_name}</option>)}
          </select>
          {selectedType && selectedType.default_phases.length > 0 && (
            <div className="mt-1 text-[11px] text-slate-500">
              Phases will auto-populate: {selectedType.default_phases.map(p => p.name).join(" → ")}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Client *</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— pick a client —</option>
            {clients.map(c => <option key={c.tenant_id} value={c.tenant_id}>{c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Target completion</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-slate-300 text-sm font-semibold">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 rounded bg-[#EF6C33] text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

export default ConsultingProjectsBoardPage;
