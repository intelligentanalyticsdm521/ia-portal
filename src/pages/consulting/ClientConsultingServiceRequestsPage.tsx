// ClientConsultingServiceRequestsPage — F-Client.Consulting (2026-06-29).
//
// CLIENT-facing Service Requests list. Gated on a "Build Your Brand"-family
// subscription:
//
//   GET /consulting/access            → { has_byb_sub: bool, … }
//
// Until the backend ships this endpoint we treat a 404 (or any 4xx) as
// "permissive" and let the tickets list endpoint do the real authoritative
// scoping. A client without subscription would still get an empty array
// from /consulting-tickets because the server tenant-scopes by
// provider/client tenant id. The upsell card renders ONLY when the access
// endpoint explicitly responds with has_byb_sub:false.
//
// Single-list view (NOT a kanban — clients don't need cross-client board
// columns). New Request modal mirrors the founder ConsultingTicketsBoardPage
// CreateTicketModal but without the client picker (caller IS the client).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import { MessageCircle, Plus, AlertCircle, Sparkles } from "lucide-react";

interface Ticket {
  ticket_id: string;
  ticket_number: string;
  provider_tenant_id: string;
  client_tenant_id: string;
  engagement_type?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  hours_estimated?: number | null;
  hours_actual?: number | null;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
  comment_count?: number;
}

interface AccessResponse {
  has_byb_sub?: boolean;
  // Future fields the backend may add (subscription tier, plan name, etc.)
  // are tolerated — we only read has_byb_sub today.
  [k: string]: unknown;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  client_review: "Awaiting your review",
  revision: "In revision",
  client_revision_review: "Awaiting your review",
  approved: "Approved",
  completed: "Completed",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  new:                    { bg: "#e2e8f0", fg: "#475569" },
  client_review:          { bg: "#dbeafe", fg: "#1d4ed8" },
  revision:               { bg: "#fef3c7", fg: "#a16207" },
  client_revision_review: { bg: "#dbeafe", fg: "#1d4ed8" },
  approved:               { bg: "#d1fae5", fg: "#047857" },
  completed:              { bg: "#e2e8f0", fg: "#334155" },
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#64748b",
  normal: "#0EA5E9",
  high: "#f59e0b",
  urgent: "#dc2626",
};

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
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError("Title is required."); return; }
    setBusy(true); setError(null);
    try {
      // No client_tenant_id — server routes to founder as provider when
      // caller IS the client (see consultingTickets.js:174). engagement_type
      // also omitted intentionally; the client surface doesn't ask them to
      // pick a tag (the founder will assign one if needed).
      await post("/consulting-tickets", {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
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
      subtitle="Tell us what you need; we&apos;ll pick it up."
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
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
          >
            <option value="low">Low — whenever you can</option>
            <option value="normal">Normal</option>
            <option value="high">High — needed this week</option>
            <option value="urgent">Urgent — needed today</option>
          </select>
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
  const { get, ready } = useOliverApi();
  // null = unknown (still loading the access check). false = explicit
  // backend response. true = permissive (either explicit yes or 404 fallback).
  const [hasByb, setHasByb] = useState<boolean | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // 1) Access check — gracefully degrades to permissive when the endpoint
  // isn't deployed yet. The /consulting-tickets call still tenant-scopes
  // server-side so we never leak rows even when we treat 404 as permissive.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<AccessResponse>("/consulting/access")
      .then((r) => {
        if (cancelled) return;
        if (r && typeof r.has_byb_sub === "boolean") {
          setHasByb(r.has_byb_sub);
        } else {
          setHasByb(true); // permissive on missing field
        }
        setAccessChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        // 404 / 401 / 500 — treat as permissive. The backend will still
        // gate ticket creation if a subscription is truly required.
        setHasByb(true);
        setAccessChecked(true);
      });
    return () => { cancelled = true; };
  }, [get, ready]);

  // 2) Tickets — load only after access check passes. Even when permissive
  // (hasByb=true via fallback), the call still happens; an empty result
  // is the natural state for non-subscribers and renders the empty card.
  const loadTickets = useCallback(async () => {
    if (!ready || !accessChecked || hasByb === false) return;
    setLoadingTickets(true);
    setError(null);
    try {
      const r = await get<{ tickets: Ticket[] }>("/consulting-tickets");
      setTickets(Array.isArray(r?.tickets) ? r.tickets : []);
    } catch (e) {
      setError((e as Error).message);
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, [get, ready, accessChecked, hasByb]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Render branches ─────────────────────────────────────────────────

  // Still resolving access — show a tiny placeholder rather than flashing
  // the upsell or the list incorrectly.
  if (!accessChecked) {
    return (
      <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
        Checking your access…
      </div>
    );
  }

  // Explicit "no Build Your Brand sub" — upsell.
  if (hasByb === false) {
    return <UpsellCard />;
  }

  // Has access — list + New Request.
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Your service requests</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Open requests we&apos;re working on for you, plus completed ones for the record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#EF6C33] text-white text-xs font-semibold hover:bg-[#d95d27]"
        >
          <Plus className="h-3.5 w-3.5" /> New Request
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loadingTickets ? (
        <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
          Loading requests…
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <div className="text-sm font-semibold text-slate-700">No service requests yet.</div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Need a design, copy edit, or a quick consulting question? Click <strong>New Request</strong>
            {" "}to file one — we&apos;ll pick it up and keep you posted here.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="divide-y divide-slate-200">
            {tickets.map((t) => {
              const sc = STATUS_COLOR[t.status] || { bg: "#e2e8f0", fg: "#334155" };
              const prColor = PRIORITY_COLOR[t.priority] || "#64748b";
              return (
                <li key={t.ticket_id} className="p-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-mono text-slate-400">
                          {t.ticket_number}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: sc.bg, color: sc.fg }}
                        >
                          {STATUS_LABEL[t.status] || t.status}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase"
                          style={{ color: prColor }}
                        >
                          {t.priority}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {t.title}
                      </div>
                      {t.description && (
                        <div className="text-xs text-slate-600 mt-0.5 line-clamp-2 whitespace-pre-wrap">
                          {t.description}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span>Created {fmtRel(t.created_at)}</span>
                        {t.updated_at && t.updated_at !== t.created_at && (
                          <span>· Updated {fmtRel(t.updated_at)}</span>
                        )}
                        {typeof t.comment_count === "number" && t.comment_count > 0 && (
                          <span>· {t.comment_count} comment{t.comment_count === 1 ? "" : "s"}</span>
                        )}
                        {t.due_date && (
                          <span>· Due {new Date(t.due_date).toLocaleDateString()}</span>
                        )}
                      </div>
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
          onCreated={() => { setShowCreate(false); loadTickets(); }}
        />
      )}
    </div>
  );
}

export default ClientConsultingServiceRequestsPage;
