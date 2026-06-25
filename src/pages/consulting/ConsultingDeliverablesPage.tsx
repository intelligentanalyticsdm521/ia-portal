// ConsultingDeliverablesPage — F1.7
//
// Cross-cutting Deliverables view. Per SCOPE_WORKING.md:
//   "Top-nav entry 'Deliverables' → flat list of all in-review items across
//    Service Requests + Project nodes. Filters: status, project, due window.
//    Click any row → opens owning context (Service Request ticket OR Project
//    workspace scrolled to the feature/task)."
//
// Backend: GET /consulting-deliverables (shipped 2026-06-21). Returns both
// project artifacts AND ticket deliverables in one flat list with an
// `open_url` that deep-links to the owning surface.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface CrossDeliverable {
  deliverable_kind: "project_artifact" | "request_deliverable";
  deliverable_id: string;
  project_id: string | null;
  project_number?: string | null;
  project_title?: string | null;
  engagement_type?: string | null;
  project_type?: string | null;
  parent_phase_id?: number | null;
  parent_feature_id?: number | null;
  parent_task_id?: number | null;
  parent_ticket_id?: string | null;
  parent_ticket_number?: string | null;
  parent_ticket_title?: string | null;
  parent_ticket_status?: string | null;
  kind: string;
  title: string;
  description?: string | null;
  file_url?: string | null;
  external_link?: string | null;
  status: string;
  is_client_visible: boolean;
  uploaded_by_kind: string;
  uploaded_by_name?: string | null;
  created_at: string | null;
  revision_notes?: string | null;
  reviewed_at?: string | null;
  open_url: string;
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  build_your_brand: "#EF6C33",
  build_your_foundation: "#3B82F6",
  build_your_clarity: "#8B5CF6",
  build_your_engine: "#10B981",
};

const KIND_ICON: Record<string, string> = {
  proposal: "📄",
  design: "🎨",
  contract: "📝",
  brief: "📋",
  spec: "📐",
  code: "💻",
  copy: "✍️",
  ticket_deliverable: "📦",
  other: "📎",
};

const STATUS_COLOR: Record<string, string> = {
  delivered: "#10b981",
  draft: "#94a3b8",
  submitted: "#3b82f6",
  in_review: "#8b5cf6",
  revision_requested: "#f59e0b",
  approved: "#10b981",
};

// F4 (Consulting Rework 2026-06-25) — client-side intake submissions row.
// Surface the rendered "Your Deliverables" stub so a client landing here
// from a SPARK email + submission can see their previously-submitted
// intakes. Full intake-submission list view ships in F4+; for now this is
// a "you have N intakes" badge that links to the most recent one.
interface IntakeSubmissionStub {
  submission_id: string;
  project_id: string;
  project_name: string | null;
  template_name: string;
  is_draft: boolean | number;
  submitted_at: string | null;
  score_total: number | null;
}

export function ConsultingDeliverablesPage() {
  const { get, ready } = useOliverApi();
  const [items, setItems] = useState<CrossDeliverable[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // F4 stub — client-side intake submissions list. Quietly degrades to empty
  // on 404 since the F4 backend may not be deployed yet.
  const [intakes, setIntakes] = useState<IntakeSubmissionStub[]>([]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (sourceFilter) qs.set("source", sourceFilter);
      if (statusFilter) qs.set("status", statusFilter);
      // Envelope auto-stripped by useOliverApi — type the inner shape directly.
      const r = await get<{ deliverables: CrossDeliverable[] }>(
        `/consulting-deliverables?${qs}`
      );
      setItems(r?.deliverables || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, sourceFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // F4 stub — also load the viewer's intake submissions. Founder gets every
  // submission (returns flat list), client gets only their own. Endpoint
  // shape mirrors the F4 backend brief; 404s degrade silently so the rest
  // of the page renders fine pre-deploy.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<{ submissions: IntakeSubmissionStub[] }>("/consulting/intake-submissions?mine=1")
      .then((r) => {
        if (cancelled) return;
        setIntakes(Array.isArray(r?.submissions) ? r.submissions : []);
      })
      .catch(() => { if (!cancelled) setIntakes([]); });
    return () => { cancelled = true; };
  }, [get, ready]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (kindFilter && i.kind !== kindFilter) return false;
        if (tagFilter && i.engagement_type !== tagFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (
            !(i.title || "").toLowerCase().includes(s) &&
            !(i.project_title || "").toLowerCase().includes(s) &&
            !(i.parent_ticket_title || "").toLowerCase().includes(s)
          ) {
            return false;
          }
        }
        return true;
      }),
    [items, kindFilter, tagFilter, search]
  );

  const kinds = useMemo(() => Array.from(new Set(items.map((i) => i.kind))), [items]);
  const tags = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.engagement_type).filter(Boolean) as string[])
      ),
    [items]
  );

  const statuses = useMemo(
    () => Array.from(new Set(items.map((i) => i.status).filter(Boolean))),
    [items]
  );

  const counts = useMemo(() => {
    let pendingReview = 0;
    let revisionRequested = 0;
    for (const i of items) {
      if (i.status === "submitted" || i.status === "in_review") pendingReview++;
      if (i.status === "revision_requested") revisionRequested++;
    }
    return { pendingReview, revisionRequested, total: items.length };
  }, [items]);

  return (
    <OliverPageWrapper
      title="Deliverables"
      subtitle="IA Consulting · Cross-cutting library (Projects + Service Requests)"
      error={error}
      loading={loading}
    >
      <div className="space-y-3">
        {/* F4 stub — intake submissions strip (client lens). Surfaces every
            intake form the viewer has submitted or drafted so they can
            re-open / download the snapshot. Empty state (incl. pre-deploy
            404) hides the strip entirely. */}
        {intakes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Your intake forms ({intakes.length})
              </div>
              <span className="text-[10px] italic text-amber-700">F4 preview · full list ships with the F4 backend</span>
            </div>
            <ul className="space-y-1">
              {intakes.slice(0, 5).map((s) => (
                <li key={s.submission_id} className="flex items-center justify-between gap-2 text-xs">
                  <a
                    href={`/app/consulting/intake/${s.submission_id}`}
                    className="font-semibold text-amber-900 hover:underline"
                  >
                    {s.template_name}
                  </a>
                  <span className="text-amber-800">
                    {s.project_name && <span className="mr-2">· {s.project_name}</span>}
                    {s.is_draft && !s.submitted_at ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 border border-amber-300">Draft</span>
                    ) : (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 border border-emerald-300">
                        {s.score_total != null ? `Score ${s.score_total}` : "Submitted"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Counts strip */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            <strong>{counts.total}</strong> total
          </span>
          {counts.pendingReview > 0 && (
            <span className="rounded-full bg-purple-100 px-3 py-1 text-purple-700">
              <strong>{counts.pendingReview}</strong> pending review
            </span>
          )}
          {counts.revisionRequested > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
              <strong>{counts.revisionRequested}</strong> revision requested
            </span>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or project…"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56"
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All sources</option>
            <option value="project">Project artifacts only</option>
            <option value="request">Service Request deliverables only</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_ICON[k] || ""} {k}
              </option>
            ))}
          </select>
          {tags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All engagements</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {filtered.length} of {items.length} deliverable
            {items.length === 1 ? "" : "s"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
            {items.length === 0
              ? "No deliverables yet — they'll appear here when you upload project artifacts or attach files to Service Request tickets."
              : "No matches for current filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((d) => {
              const tagColor = d.engagement_type
                ? ENGAGEMENT_COLORS[d.engagement_type]
                : "#94a3b8";
              const statusColor = STATUS_COLOR[d.status] || "#94a3b8";
              const isTicket = d.deliverable_kind === "request_deliverable";
              return (
                <div
                  key={`${d.deliverable_kind}-${d.deliverable_id}`}
                  className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition flex flex-col"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{KIND_ICON[d.kind] || "📎"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2">
                        <span>{d.kind}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-white font-bold"
                          style={{ background: isTicket ? "#0EA5E9" : "#64748b" }}
                        >
                          {isTicket ? "Request" : "Project"}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {d.title}
                      </div>
                    </div>
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                      style={{ background: statusColor }}
                    >
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  {d.description && (
                    <div className="text-xs text-slate-600 mb-2 line-clamp-2">
                      {d.description}
                    </div>
                  )}

                  {d.revision_notes && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 rounded p-2 mb-2">
                      <strong>Revision notes:</strong> {d.revision_notes}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    {d.engagement_type && (
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                        style={{ background: tagColor }}
                      >
                        {d.engagement_type
                          .replace(/_/g, " ")
                          .replace("build your ", "")}
                      </span>
                    )}
                    {d.project_type && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {d.project_type}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 mb-2">
                    {isTicket && d.parent_ticket_number && (
                      <>📨 {d.parent_ticket_number} · {d.parent_ticket_title} · </>
                    )}
                    {!isTicket && d.project_number && (
                      <>📁 {d.project_title || d.project_number} ({d.project_number}) · </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-auto">
                    {(d.file_url || d.external_link) && (
                      <a
                        href={d.file_url || d.external_link || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        Open file ↗
                      </a>
                    )}
                    <a
                      href={d.open_url}
                      className="text-xs font-semibold text-[#EF6C33] hover:underline"
                    >
                      Go to {isTicket ? "request" : "workspace"} →
                    </a>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-400">
                    {d.created_at
                      ? new Date(d.created_at).toLocaleDateString()
                      : "—"}{" "}
                    · by {d.uploaded_by_kind}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default ConsultingDeliverablesPage;
