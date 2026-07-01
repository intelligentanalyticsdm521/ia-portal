// ConsultingTicketsBoardPage — F-138
//
// Kanban board for IA Consulting work. Mirrors OliverJobBoardPage's
// drag-drop pattern. Columns map to the consulting ticket status state
// machine. Same component serves the founder (sees all clients' tickets,
// can filter by client) and clients (sees only their own tickets).
//
// Click a ticket → IadmModal with comments, status timeline, time entries
// (provider only), and inline status transitions.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal } from "../../components/IadmModal";
import { iconComponentFor } from "./ConsultingCategoryBuilderModal";

type TicketStatus = "new" | "client_review" | "revision" | "client_revision_review" | "approved" | "completed";

const BUCKETS: Array<{ key: TicketStatus; label: string; color: string }> = [
  { key: "new",                    label: "New",                    color: "#94a3b8" },
  { key: "client_review",          label: "Client Review",          color: "#3b82f6" },
  { key: "revision",               label: "Revision",               color: "#f59e0b" },
  { key: "client_revision_review", label: "Client Revision Review", color: "#8b5cf6" },
  { key: "approved",               label: "Approved",               color: "#10b981" },
  { key: "completed",              label: "Completed",              color: "#334155" },
];

// M2 fix (audit 2026-06-12): mirror of the server-side TRANSITIONS table
// in consultingTickets.js:67-84. Each side (provider/client) can only push
// a ticket to specific next-statuses from any given current status. The
// modal previously rendered every non-current bucket as a transition
// button — half the buttons errored 422 when clicked because the server
// rejected the disallowed move. Now only allowed transitions are shown.
const TRANSITIONS: Record<"provider" | "client", Record<TicketStatus, TicketStatus[]>> = {
  provider: {
    new:                    ["client_review", "revision"],
    client_review:          ["revision", "approved", "completed"],
    revision:               ["client_revision_review", "completed"],
    client_revision_review: ["revision", "approved", "completed"],
    approved:               ["completed"],
    completed:              [],
  },
  client: {
    new:                    [],
    client_review:          ["revision", "approved"],
    revision:               [],
    client_revision_review: ["revision", "approved"],
    approved:               [],
    completed:              [],
  },
};

function allowedTransitions(status: TicketStatus, side: "provider" | "client"): TicketStatus[] {
  return TRANSITIONS[side]?.[status] || [];
}

// F6 — legacy chip set kept here as a fallback rendering shim for any
// engagement_type values that DIDN'T get remapped by the
// /consulting/_admin/remap-engagement-type one-shot. Post-remap, tickets
// should hold one of the 12 new category slugs and the page loads the
// chip set from /consulting/categories at mount (see useEffect below).
// Color palette for legacy values matches the pre-rework board so any
// leftover row still renders with familiar coloring.
const LEGACY_ENGAGEMENT_TYPES = [
  { key: "build_your_brand",      label: "Build Your Brand",      color: "#EF6C33" },
  { key: "build_your_foundation", label: "Build Your Foundation", color: "#3B82F6" },
  { key: "build_your_clarity",    label: "Build Your Clarity",    color: "#8B5CF6" },
  { key: "build_your_engine",     label: "Build Your Engine",     color: "#10B981" },
];

// Stable accent palette indexed by category sort order — keeps the chips
// distinguishable even with 12 categories. Repeats after 12, but with 12
// categories defined we only ever pull the first 12 colors.
const CATEGORY_CHIP_COLORS = [
  "#EF6C33", // brand orange (Onboarding Consulting)
  "#3B82F6", // blue          (Onboarding One-Time)
  "#0EA5E9", // sky           (New Engagement)
  "#8B5CF6", // violet        (Logo / Graphic)
  "#EC4899", // pink          (Brand Refresh)
  "#10B981", // emerald       (Insights Review)
  "#F59E0B", // amber         (Web Design)
  "#14B8A6", // teal          (SEM Campaign)
  "#F97316", // orange-600    (Marketing Campaign)
  "#6366F1", // indigo        (Platform Migration)
  "#84CC16", // lime          (Annual Strategy Refresh)
  "#0C4A60", // core blue     (Custom Dev FORGE)
];

interface EngagementTypeOption {
  key: string;
  label: string;
  color: string;
  icon?: string | null;
}

interface Ticket {
  ticket_id: string;
  ticket_number: string;
  provider_tenant_id: string;
  client_tenant_id: string;
  provider_business_name?: string | null;
  client_business_name?: string | null;
  engagement_id?: string | null;
  engagement_type?: string | null;
  title: string;
  description?: string | null;
  status: TicketStatus;
  priority: string;
  created_by_kind: "provider" | "client";
  created_by_name?: string | null;
  hours_estimated?: number | null;
  hours_actual: number;
  due_date?: string | null;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

interface Client { tenant_id: string; business_name: string; open_count: number; }

export function ConsultingTicketsBoardPage() {
  const { get, post, patch, ready } = useOliverApi();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  // F6 — engagement-type chip set is sourced from /consulting/categories
  // so the new 12-category set replaces the legacy Build-Your-* quartet
  // post-remap. Founder-only endpoint, so the fetch may 403 for client
  // viewers — in which case we fall back to LEGACY_ENGAGEMENT_TYPES so
  // they still get coloured chips on their existing tickets.
  const [engagementTypes, setEngagementTypes] = useState<EngagementTypeOption[]>(() =>
    LEGACY_ENGAGEMENT_TYPES.map((e) => ({ ...e, icon: null }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverBucket, setDragOverBucket] = useState<TicketStatus | null>(null);
  const [clientFilter, setClientFilter] = useState<string>("");
  const [engTypeFilter, setEngTypeFilter] = useState<string>("");
  const [viewerSide, setViewerSide] = useState<"provider" | "client">("provider");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (clientFilter) params.set("client_tenant_id", clientFilter);
      if (engTypeFilter) params.set("engagement_type", engTypeFilter);
      const r = await get<{ data: { tickets: Ticket[] } }>(`/consulting-tickets${params.toString() ? `?${params}` : ""}`);
      const list = r.data?.tickets || [];
      setTickets(list);
      // Infer viewer side from the first ticket (works once a ticket exists; otherwise provider by default)
      if (list[0]) {
        // Most reliable: do a tiny self-side test on the first ticket
        // We'll just leave it as 'provider' for now — backend reports
        // it in the ticket detail call too.
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready, clientFilter, engTypeFilter]);

  const [hasConsultingAccess, setHasConsultingAccess] = useState<boolean | null>(null);

  const loadClients = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: { clients: Client[] } }>(`/consulting-tickets/_/clients`);
      setClients(r.data?.clients || []);
      setViewerSide("provider");
      setHasConsultingAccess(true);
    } catch {
      // Not a founder — they're a client. Whether they have consulting
      // access depends on whether they have any tickets OR an active
      // consulting engagement. We infer from /consulting-tickets returning
      // a non-empty list. Brand-new clients with no tickets see the gate
      // overlay until they book a consultation.
      setViewerSide("client");
    }
  }, [get, ready]);

  // Decide whether to show the gate overlay (client viewer + no tickets ever)
  useEffect(() => {
    if (viewerSide === "provider") { setHasConsultingAccess(true); return; }
    if (viewerSide === "client") {
      // If client has any tickets (open or archived), they have access.
      setHasConsultingAccess(tickets.length > 0);
    }
  }, [viewerSide, tickets.length]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadClients(); }, [loadClients]);

  // F6 — fan out a single fetch for the new 12-category chip set on mount.
  // Falls back silently to the legacy quartet for non-founder viewers
  // (founder-gated 403) so client-side users still see colored chips on
  // any pre-rework tickets they hold.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    interface CategoryRow {
      slug: string;
      name: string;
      icon?: string | null;
    }
    get<{ data: CategoryRow[] }>("/consulting/categories")
      .then((r) => {
        if (cancelled) return;
        const rows = Array.isArray(r?.data) ? r.data : [];
        if (rows.length === 0) return;
        // Stable color assignment: index into CATEGORY_CHIP_COLORS by the
        // category's position in the alphabetised list. Stable per-name
        // so the same category always gets the same colour across reloads.
        const sorted = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
        const mapped: EngagementTypeOption[] = sorted.map((row, idx) => ({
          key: row.slug,
          label: row.name,
          color: CATEGORY_CHIP_COLORS[idx % CATEGORY_CHIP_COLORS.length],
          icon: row.icon || null,
        }));
        setEngagementTypes(mapped);
      })
      .catch(() => {
        // Non-founder caller. Keep legacy fallback.
      });
    return () => { cancelled = true; };
  }, [get, ready]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of BUCKETS) c[b.key] = 0;
    for (const t of tickets) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [tickets]);

  const moveTicket = async (ticketId: string, newStatus: TicketStatus) => {
    // Optimistic update
    const prev = tickets;
    setTickets(prev.map(t => t.ticket_id === ticketId ? { ...t, status: newStatus } : t));
    try {
      await patch(`/consulting-tickets/${ticketId}/status`, { to_status: newStatus });
    } catch (e) {
      setTickets(prev);
      setError((e as Error).message);
    }
  };

  // Gate overlay for clients with no consulting access yet
  if (viewerSide === "client" && hasConsultingAccess === false) {
    return (
      <OliverPageWrapper title="Consulting Tickets" subtitle="IA Consulting" error={error} loading={loading}>
        <div className="relative">
          {/* Greyed background placeholder */}
          <div className="opacity-30 pointer-events-none select-none">
            <div className="flex gap-3 overflow-x-auto pb-3">
              {BUCKETS.map(b => (
                <div key={b.key} className="w-72 flex-shrink-0">
                  <div className="rounded-t-lg px-3 py-2 text-white" style={{ background: b.color }}>
                    <span className="text-xs font-semibold uppercase tracking-wide">{b.label}</span>
                  </div>
                  <div className="rounded-b-lg p-2 min-h-[400px] bg-slate-50" />
                </div>
              ))}
            </div>
          </div>
          {/* Overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white border-2 border-[#EF6C33] rounded-2xl p-8 max-w-md text-center shadow-xl">
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Book your consultation today</h3>
              <p className="text-sm text-slate-600 mb-4">
                Get hands-on help building your brand, foundation, clarity, or engine — direct from the IA team.
                Once you have an active consulting engagement, your tickets will live here.
              </p>
              <a href="https://book.intelligentanalyticsdm.com" target="_blank" rel="noreferrer"
                className="inline-block px-6 py-3 rounded-lg bg-[#EF6C33] text-white font-semibold hover:bg-[#d75a25]">
                Book a consultation →
              </a>
            </div>
          </div>
        </div>
      </OliverPageWrapper>
    );
  }

  return (
    <OliverPageWrapper title="Service Requests" subtitle="IA Consulting · Client work pipeline" error={error} loading={loading}>
      <div className="space-y-3">
        {/* Header / actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-[#EF6C33] text-white text-sm font-semibold hover:bg-[#d75a25]"
          >
            ＋ New Request
          </button>

          {viewerSide === "provider" && clients.length > 0 && (
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All clients ({tickets.length})</option>
              {clients.map(c => (
                <option key={c.tenant_id} value={c.tenant_id}>{c.business_name} ({c.open_count})</option>
              ))}
            </select>
          )}

          <select value={engTypeFilter} onChange={(e) => setEngTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {engagementTypes.map(et => <option key={et.key} value={et.key}>{et.label}</option>)}
          </select>

          <span className="ml-auto text-xs text-slate-500">
            Tip: drag any card to a different column to change its status.
          </span>
        </div>

        {/* Kanban */}
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 min-w-max">
            {BUCKETS.map((bucket) => {
              const colTickets = tickets.filter(t => t.status === bucket.key);
              const isDropTarget = dragOverBucket === bucket.key;
              return (
                <div key={bucket.key} className="w-72 flex-shrink-0">
                  <div className="rounded-t-lg px-3 py-2 flex items-center justify-between text-white"
                       style={{ background: bucket.color }}>
                    <span className="text-xs font-semibold uppercase tracking-wide">{bucket.label}</span>
                    <span className="text-xs">{counts[bucket.key]}</span>
                  </div>
                  <div
                    className={`rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors ${
                      isDropTarget ? "bg-amber-50 ring-2 ring-amber-300" : "bg-slate-50"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverBucket !== bucket.key) setDragOverBucket(bucket.key);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (dragOverBucket === bucket.key) setDragOverBucket(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverBucket(null);
                      const ticketId = e.dataTransfer.getData("text/plain");
                      if (!ticketId) return;
                      const t = tickets.find(x => x.ticket_id === ticketId);
                      if (!t || t.status === bucket.key) return;
                      moveTicket(ticketId, bucket.key);
                    }}
                  >
                    {colTickets.length === 0 && (
                      <div className="text-xs text-slate-400 italic text-center py-4">No requests</div>
                    )}
                    {colTickets.map(t => (
                      <TicketCard
                        key={t.ticket_id}
                        ticket={t}
                        isDragging={draggingId === t.ticket_id}
                        viewerSide={viewerSide}
                        engagementTypes={engagementTypes}
                        onPick={() => setOpenTicketId(t.ticket_id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", t.ticket_id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(t.ticket_id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {openTicketId && (
        <TicketDetailModal
          ticketId={openTicketId}
          onClose={() => setOpenTicketId(null)}
          onChanged={() => { setOpenTicketId(null); load(); }}
        />
      )}

      {showCreate && (
        <CreateTicketModal
          clients={clients}
          viewerSide={viewerSide}
          engagementTypes={engagementTypes}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); loadClients(); }}
        />
      )}
    </OliverPageWrapper>
  );
}

function TicketCard({ ticket, isDragging, viewerSide, engagementTypes, onPick, onDragStart, onDragEnd }: {
  ticket: Ticket; isDragging: boolean; viewerSide: "provider" | "client";
  engagementTypes: EngagementTypeOption[];
  onPick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  // F6 — try dynamic chip set first; fall back to legacy quartet for any
  // ticket whose engagement_type didn't get remapped (paranoia — the prod
  // remap script wiped them on deploy but the fallback keeps colored chips
  // working in dev environments that haven't run it yet).
  const engType =
    engagementTypes.find(e => e.key === ticket.engagement_type) ||
    LEGACY_ENGAGEMENT_TYPES.find(e => e.key === ticket.engagement_type);
  // Strip the "Build Your " prefix only on legacy labels — keep new-set
  // labels intact (they're already concise).
  const chipLabel = engType
    ? engType.label.startsWith("Build Your ")
      ? engType.label.replace("Build Your ", "")
      : engType.label
    : null;
  const ChipIcon = engType && "icon" in engType ? iconComponentFor(engType.icon as string | null) : null;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onPick}
      className={`bg-white rounded-lg shadow-sm border border-slate-200 p-3 cursor-pointer hover:shadow-md transition-shadow ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[10px] font-mono text-slate-500">{ticket.ticket_number}</span>
        {engType && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white inline-flex items-center gap-1"
                style={{ background: engType.color }}>
            {ChipIcon && <ChipIcon className="h-2.5 w-2.5" />}
            {chipLabel}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-slate-900 mb-1">{ticket.title}</div>
      {viewerSide === "provider" && ticket.client_business_name && (
        <div className="text-[11px] text-slate-600 mb-1">📁 {ticket.client_business_name}</div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        {ticket.comment_count > 0 && <span>💬 {ticket.comment_count}</span>}
        {ticket.hours_actual > 0 && <span>⏱ {ticket.hours_actual}h</span>}
        {ticket.due_date && <span>📅 {new Date(ticket.due_date).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}

function TicketDetailModal({ ticketId, onClose, onChanged }: { ticketId: string; onClose: () => void; onChanged: () => void; }) {
  const { get, post, patch } = useOliverApi();
  const [detail, setDetail] = useState<any>(null);
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [newHours, setNewHours] = useState("");
  const [newHoursDesc, setNewHoursDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [convertType, setConvertType] = useState("");
  const [convertTypes, setConvertTypes] = useState<Array<{ type_key: string; display_name: string; default_phases: any[] }>>([]);

  const load = useCallback(async () => {
    try {
      const r = await get<{ data: any }>(`/consulting-tickets/${ticketId}`);
      setDetail(r.data);
    } catch (e) { setErr((e as Error).message); }
  }, [get, ticketId]);

  useEffect(() => { load(); }, [load]);

  // Load project type templates for the Convert dropdown (only fetched
  // when the operator opens the convert form, to avoid wasting a call)
  useEffect(() => {
    if (!showConvert || convertTypes.length > 0) return;
    get<{ data: { types: any[] } }>("/consulting-projects/_/types")
      .then(r => setConvertTypes(r.data?.types || []))
      .catch(() => {});
  }, [showConvert, convertTypes.length, get]);

  const convertToProject = async () => {
    if (!convertType) return;
    setBusy(true); setErr(null);
    try {
      const r = await post<{ data: { project_id: string; project_number: string } }>(
        `/consulting-tickets/${ticketId}/convert-to-project`,
        { project_type: convertType, title: detail?.ticket?.title }
      );
      // Jump to the new project
      window.location.href = `/app/admin/consulting/projects?open=${r.data.project_id}`;
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const transition = async (to: TicketStatus) => {
    setBusy(true); setErr(null);
    try {
      await patch(`/consulting-tickets/${ticketId}/status`, { to_status: to });
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setBusy(true); setErr(null);
    try {
      await post(`/consulting-tickets/${ticketId}/comments`, { body: newComment, is_internal: isInternal });
      setNewComment(""); setIsInternal(false);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const logTime = async () => {
    if (!newHours || isNaN(Number(newHours)) || Number(newHours) <= 0) return;
    setBusy(true); setErr(null);
    try {
      await post(`/consulting-tickets/${ticketId}/time-entries`, { hours: Number(newHours), description: newHoursDesc });
      setNewHours(""); setNewHoursDesc("");
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!detail) {
    return (
      <IadmModal open onClose={onClose} product="oliver" eyebrow="CONSULTING TICKET" title="Loading…" size="report">
        <div className="p-8 text-center text-slate-500">Loading…</div>
      </IadmModal>
    );
  }

  const t = detail.ticket;
  const side: "provider" | "client" = detail.viewer_side;
  const bucket = BUCKETS.find(b => b.key === t.status);

  return (
    <IadmModal open onClose={onClose} product="oliver"
      eyebrow={`${t.ticket_number} · ${t.client_business_name || ""}`}
      title={t.title} size="report">
      <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded text-white"
                style={{ background: bucket?.color || "#94a3b8" }}>
            {bucket?.label || t.status}
          </span>
          {/* M2 fix (audit 2026-06-12): previously rendered every non-current
              bucket as a transition button, ignoring the server-side
              TRANSITIONS allow-list (consultingTickets.js:67-84). Half the
              buttons errored with 422. Now mirrors the server allow-list
              based on which side the caller is on. */}
          {allowedTransitions(t.status, side).map(toStatus => {
            const b = BUCKETS.find(x => x.key === toStatus);
            if (!b) return null;
            return (
              <button key={b.key} disabled={busy}
                onClick={() => transition(b.key)}
                className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50">
                → {b.label}
              </button>
            );
          })}
        </div>

        {/* Description */}
        {t.description && (
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-sm whitespace-pre-wrap">{t.description}</div>
        )}

        {/* Convert to Project (founder + not-already-in-project only) */}
        {side === "provider" && !t.project_id && (
          <div className="bg-purple-50 border border-purple-200 rounded p-3">
            {!showConvert ? (
              <button onClick={() => setShowConvert(true)}
                className="text-xs font-semibold text-purple-800 hover:underline">
                ↪ Convert this request into a Project
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-purple-900">Pick a project type to convert into:</div>
                <select value={convertType} onChange={(e) => setConvertType(e.target.value)}
                  className="w-full rounded border border-purple-300 px-2 py-1 text-sm">
                  <option value="">— pick a type —</option>
                  {convertTypes.map(ct => <option key={ct.type_key} value={ct.type_key}>{ct.display_name}</option>)}
                </select>
                {convertType && (convertTypes.find(c => c.type_key === convertType)?.default_phases?.length ?? 0) > 0 && (
                  <div className="text-[11px] text-purple-700">
                    Phases will auto-populate: {convertTypes.find(c => c.type_key === convertType)!.default_phases.map((p: any) => p.name).join(" → ")}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowConvert(false); setConvertType(""); }}
                    className="text-xs px-3 py-1 rounded border border-purple-300">Cancel</button>
                  <button disabled={busy || !convertType} onClick={convertToProject}
                    className="text-xs px-3 py-1 rounded bg-purple-700 text-white font-semibold disabled:opacity-50">
                    {busy ? "Converting…" : "Convert + open"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {t.project_id && (
          <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs">
            🔗 Part of project — <a href={`/app/admin/consulting/projects?open=${t.project_id}`} className="font-semibold text-purple-700 hover:underline">open project</a>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><span className="text-slate-500">Created by:</span> <strong>{t.created_by_kind}</strong> ({t.created_by_name || "—"})</div>
          <div><span className="text-slate-500">Priority:</span> <strong>{t.priority}</strong></div>
          {t.engagement_type && <div><span className="text-slate-500">Engagement:</span> {t.engagement_type.replace(/_/g, " ")}</div>}
          {t.due_date && <div><span className="text-slate-500">Due:</span> {new Date(t.due_date).toLocaleDateString()}</div>}
          {t.hours_estimated != null && <div><span className="text-slate-500">Est. hours:</span> {t.hours_estimated}</div>}
          <div><span className="text-slate-500">Actual hours:</span> <strong>{t.hours_actual}</strong></div>
        </div>

        {/* Comments */}
        <div>
          <div className="text-sm font-semibold text-slate-900 mb-2">Conversation</div>
          <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
            {(detail.comments || []).map((c: any) => (
              <div key={c.comment_id} className={`p-2 rounded text-sm ${
                c.author_kind === "provider" ? "bg-blue-50 border border-blue-200" : "bg-emerald-50 border border-emerald-200"
              } ${c.is_internal ? "ring-1 ring-amber-300" : ""}`}>
                <div className="flex items-center gap-2 text-[10px] text-slate-600 mb-1">
                  <strong>{c.author_name || c.author_kind}</strong>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                  {c.is_internal && <span className="px-1 bg-amber-200 text-amber-900 rounded">INTERNAL</span>}
                </div>
                <div className="text-slate-800 whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
            {(detail.comments || []).length === 0 && <div className="text-xs text-slate-400 italic">No comments yet</div>}
          </div>
          <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment…"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm" rows={3} />
          <div className="flex items-center gap-2 mt-1">
            {side === "provider" && (
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                Internal note (client won't see)
              </label>
            )}
            <button disabled={busy || !newComment.trim()} onClick={addComment}
              className="ml-auto px-3 py-1.5 rounded bg-[#EF6C33] text-white text-xs font-semibold disabled:opacity-50">
              Post
            </button>
          </div>
        </div>

        {/* Time entries — provider only */}
        {side === "provider" && (
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-2">Time entries</div>
            <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
              {(detail.time_entries || []).map((te: any) => (
                <div key={te.entry_id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono">{te.occurred_on?.slice(0, 10) || "—"}</span>
                  <strong>{te.hours}h</strong>
                  <span className="text-slate-600">{te.description || ""}</span>
                  <span className="ml-auto text-slate-400">{te.user_name || ""}</span>
                </div>
              ))}
              {(detail.time_entries || []).length === 0 && <div className="text-xs text-slate-400 italic">No time logged</div>}
            </div>
            <div className="flex gap-2">
              <input type="number" step="0.25" min="0" value={newHours}
                onChange={(e) => setNewHours(e.target.value)} placeholder="Hours"
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input value={newHoursDesc} onChange={(e) => setNewHoursDesc(e.target.value)}
                placeholder="What did you do?"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
              <button disabled={busy || !newHours} onClick={logTime}
                className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-semibold disabled:opacity-50">
                Log
              </button>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-rose-600">{err}</div>}
      </div>
    </IadmModal>
  );
}

function CreateTicketModal({ clients, viewerSide, engagementTypes, onClose, onCreated }: {
  clients: Client[]; viewerSide: "provider" | "client";
  engagementTypes: EngagementTypeOption[];
  onClose: () => void; onCreated: () => void;
}) {
  const { post } = useOliverApi();
  const [clientTenantId, setClientTenantId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [engagementType, setEngagementType] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [hoursEst, setHoursEst] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim()) { setErr("Title required"); return; }
    setBusy(true); setErr(null);
    try {
      await post(`/consulting-tickets`, {
        client_tenant_id: viewerSide === "provider" ? clientTenantId : undefined,
        title: title.trim(),
        description: description || undefined,
        engagement_type: engagementType || undefined,
        priority,
        due_date: dueDate || undefined,
        hours_estimated: hoursEst ? Number(hoursEst) : undefined,
      });
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <IadmModal open onClose={onClose} product="oliver" eyebrow="NEW TICKET" title="Create consulting ticket" size="info">
      <div className="p-4 space-y-3">
        {viewerSide === "provider" && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Client *</label>
            <select value={clientTenantId} onChange={(e) => setClientTenantId(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">— pick a client —</option>
              {clients.map(c => <option key={c.tenant_id} value={c.tenant_id}>{c.business_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category (tag)</label>
            <select value={engagementType} onChange={(e) => setEngagementType(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">— none —</option>
              {engagementTypes.map(et => <option key={et.key} value={et.key}>{et.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Est. hours</label>
            <input type="number" step="0.5" min="0" value={hoursEst} onChange={(e) => setHoursEst(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-slate-300 text-sm font-semibold">Cancel</button>
          <button disabled={busy} onClick={create}
            className="px-4 py-2 rounded bg-[#EF6C33] text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

export default ConsultingTicketsBoardPage;
