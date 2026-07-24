// ClientConsultingServiceRequestsPage — F-Client.Consulting (2026-06-29,
// rewired 2026-07-24 onto the consulting.service_request pipeline).
//
// CLIENT-facing Service Requests list. Reads GET /consulting/requests (the
// server tenant-scopes to the caller), creates via POST /consulting/requests
// (lands in New/Not Reviewed — nothing is scheduled until the founder
// approves it), and surfaces the TWO client actions when it's their turn:
// approve / request revision (PATCH { action }).
//
// The old /consulting-tickets surface read lumen.consulting_ticket — the
// abandoned fork, verified 0 rows in prod — and is fully replaced by this.
//
// Access gate: GET /consulting/access → { has_byb_sub }. 404/4xx degrade to
// permissive; the requests endpoint still tenant-scopes server-side.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
// Shared with ClientConsultingProjectModal so the client sees ONE review
// dialog whether they arrive from here or from a project milestone.
import { ClientTaskDetailModal, type ClientTaskLike } from "../../components/consulting/ClientTaskDetailModal";
import { MessageCircle, Plus, AlertCircle, Sparkles } from "lucide-react";

interface ServiceRequest {
  id: string;
  title: string;
  description?: string | null;
  stage: string;
  status: string;
  origin: string;
  project_name?: string | null;
  milestone_name?: string | null;
  created_at: string;
  updated_at: string;
  deliverables?: Array<{
    deliverable_id: string;
    title?: string | null;
    file_name?: string | null;
    file_url?: string | null;
    status: string;
  }>;
}

interface AccessResponse {
  has_byb_sub?: boolean;
  [k: string]: unknown;
}

// Client-perspective labels for the 7-stage pipeline.
const STAGE_LABEL: Record<string, string> = {
  new: "Submitted — awaiting review",
  in_progress: "In progress",
  client_review: "Awaiting your review",
  revision: "In revision",
  client_revision_review: "Awaiting your review",
  approved: "Approved — deploying soon",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  new:                    { bg: "#e2e8f0", fg: "#475569" },
  in_progress:            { bg: "#fef9c3", fg: "#854d0e" },
  client_review:          { bg: "#dbeafe", fg: "#1d4ed8" },
  revision:               { bg: "#fef3c7", fg: "#a16207" },
  client_revision_review: { bg: "#dbeafe", fg: "#1d4ed8" },
  approved:               { bg: "#d1fae5", fg: "#047857" },
  completed:              { bg: "#e2e8f0", fg: "#334155" },
  cancelled:              { bg: "#fee2e2", fg: "#b91c1c" },
};

const NEEDS_CLIENT = new Set(["client_review", "client_revision_review"]);

function fmtRel(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Upsell card ────────────────────────────────────────────────────────
function UpsellCard() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center max-w-2xl mx-auto">
      <div className="mx-auto h-12 w-12 rounded-full bg-amber-200 flex items-center justify-center mb-3">
        <Sparkles className="h-6 w-6 text-amber-700" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">Service Requests is a Build Your Brand feature</h2>
      <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
        Build Your Brand subscribers get unlimited on-demand design, copy, and
        consulting requests routed straight to the Intelligent Analytics team.
        Upgrade your plan to start filing requests.
      </p>
      <div className="mt-4">
        <Link
          to="/pricing"
          className="inline-flex items-center gap-1 rounded-full bg-[#EF6C33] px-4 py-2 text-sm font-bold text-white hover:bg-[#d95d27]"
        >
          See Build Your Brand plans
        </Link>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        Already subscribed? Refresh the page — your access updates within a minute of checkout.
      </p>
    </div>
  );
}

// ─── New Request modal ──────────────────────────────────────────────────
function NewRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { post } = useOliverApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError("Title is required."); return; }
    setBusy(true); setError(null);
    try {
      // Lands in New / Not Reviewed — the founder triages before any work is
      // scheduled (nothing auto-schedules; Brandon's intake rule).
      await post("/consulting/requests", {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message || "Could not create request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="NEW REQUEST"
      title="Submit a Service Request"
      subtitle="Tell us what you need; we&apos;ll review it and get it moving."
      size="info"
    >
      <div className="p-4 space-y-3">
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 inline-flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New social-media headers for spring launch"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            What do you need? (optional but helpful)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Include sizes, deadlines, brand notes, links to reference, anything we should know."
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={submit}
            className="px-3 py-1.5 rounded bg-[#EF6C33] text-white text-xs font-semibold disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────
export function ClientConsultingServiceRequestsPage() {
  const { get, patch, download, ready } = useOliverApi();
  const [hasByb, setHasByb] = useState<boolean | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [openReq, setOpenReq] = useState<ServiceRequest | null>(null);
  // Default to ACTIVE work; completed/cancelled stay one click away.
  const [filter, setFilter] = useState<"active" | "all" | "completed" | "cancelled">("active");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<AccessResponse>("/consulting/access")
      .then((r) => {
        if (cancelled) return;
        setHasByb(r && typeof r.has_byb_sub === "boolean" ? r.has_byb_sub : true);
        setAccessChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasByb(true);
        setAccessChecked(true);
      });
    return () => { cancelled = true; };
  }, [get, ready]);

  const load = useCallback(async () => {
    if (!ready || !accessChecked || hasByb === false) return;
    setLoading(true);
    setError(null);
    try {
      // useOliverApi auto-unwraps the { data: ... } envelope.
      const rows = await get<ServiceRequest[]>("/consulting/requests");
      setRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError((e as Error).message);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready, accessChecked, hasByb]);

  useEffect(() => { load(); }, [load]);

  // The two client actions — only offered when it's actually their turn.
  const act = async (r: ServiceRequest, action: "approve" | "request_revision") => {
    setActingId(r.id);
    setError(null);
    try {
      await patch(`/consulting/requests/${r.id}`, { action });
      setOpenReq(null);
      await load();
    } catch (e) {
      setError((e as Error).message || "Action failed.");
    } finally {
      setActingId(null);
    }
  };

  const shown = requests.filter((r) => {
    if (filter === "all") return true;
    if (filter === "completed") return r.stage === "completed";
    if (filter === "cancelled") return r.stage === "cancelled";
    return r.stage !== "completed" && r.stage !== "cancelled"; // active
  });

  if (!accessChecked) {
    return (
      <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
        Checking your access…
      </div>
    );
  }

  if (hasByb === false) {
    return <UpsellCard />;
  }

  return (
    // Same layout convention as the founder surfaces: centered, never
    // full-bleed.
    <div className="mx-auto space-y-3" style={{ maxWidth: "min(80%, 56rem)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Your service requests</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Open requests we&apos;re working on for you, plus completed ones for the record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#EF6C33] text-white text-xs font-semibold hover:bg-[#d95d27]"
          >
            <Plus className="h-3.5 w-3.5" /> New Request
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
          Loading requests…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <div className="text-sm font-semibold text-slate-700">
            {requests.length === 0 ? "No service requests yet." : `No ${filter} requests.`}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {requests.length === 0 ? (
              <>Need a design, copy edit, or a quick consulting question? Click <strong>New Request</strong>
              {" "}to file one — we&apos;ll pick it up and keep you posted here.</>
            ) : (
              <>Switch the filter above to see other requests.</>
            )}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="divide-y divide-slate-200">
            {shown.map((r) => {
              const sc = STAGE_COLOR[r.stage] || { bg: "#e2e8f0", fg: "#334155" };
              const yourTurn = NEEDS_CLIENT.has(r.stage);
              return (
                <li key={r.id} className="p-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    {/* The whole summary is clickable — opens the request detail
                        (description, documents, review actions). */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenReq(r)}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenReq(r); }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: sc.bg, color: sc.fg }}
                        >
                          {STAGE_LABEL[r.stage] || r.stage}
                        </span>
                        {r.project_name && (
                          <span className="text-[10px] text-slate-500 truncate">
                            {r.project_name}{r.milestone_name ? ` · ${r.milestone_name}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {r.title}
                      </div>
                      {r.description && (
                        <div className="text-xs text-slate-600 mt-0.5 line-clamp-2 whitespace-pre-wrap">
                          {r.description}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span>Created {fmtRel(r.created_at)}</span>
                        {r.updated_at && r.updated_at !== r.created_at && (
                          <span>· Updated {fmtRel(r.updated_at)}</span>
                        )}
                      </div>
                      {(r.deliverables?.length || 0) > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {r.deliverables!.map((d) => (
                            <li key={d.deliverable_id} className="flex items-center gap-2 text-[11px]">
                              <span className="truncate text-slate-600">📄 {d.title || d.file_name}</span>
                              {d.file_url && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); download(`/consulting/deliverables/${d.deliverable_id}/download`, d.file_name || d.title || "document"); }}
                                  className="flex-shrink-0 font-semibold text-sky-700 hover:underline"
                                >
                                  Download
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {yourTurn && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actingId === r.id}
                            onClick={(e) => { e.stopPropagation(); act(r, "approve"); }}
                            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {actingId === r.id ? "Saving…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === r.id}
                            onClick={(e) => { e.stopPropagation(); act(r, "request_revision"); }}
                            className="rounded border border-amber-400 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Request revision
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showCreate && (
        <NewRequestModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {openReq && (
        <ClientTaskDetailModal
          task={openReq as ClientTaskLike}
          deliverables={openReq.deliverables || []}
          acting={actingId === openReq.id}
          onAct={(t, action) => act(t as unknown as ServiceRequest, action)}
          onDownload={download}
          onClose={() => setOpenReq(null)}
        />
      )}
    </div>
  );
}

export default ClientConsultingServiceRequestsPage;
