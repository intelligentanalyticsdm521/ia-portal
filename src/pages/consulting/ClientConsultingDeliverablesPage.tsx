// ClientConsultingDeliverablesPage — F-Client.Consulting (2026-06-29).
//
// CLIENT-facing flat deliverables list across every project + every service
// request. Uses the same /consulting-deliverables endpoint the founder
// surface uses; tenant scoping is handled server-side (see
// consultingDeliverables.js:46 — `WHERE p.provider_tenant_id = @tid OR
// p.client_tenant_id = @tid`), so a client tenant naturally sees only
// their own rows.
//
// Layout:
//   1. PENDING REVIEW (top, full cards, action panel inline) — anything
//      submitted/in_review/awaiting_client_review that the client needs to
//      act on.
//   2. APPROVED (collapsed by default, click to expand) — last 365 days
//      only, "Show older" toggle reveals everything older than 1 year.
//   3. Archived stays hidden behind a separate explicit toggle.
//
// Per Brandon's brief: "1-year archive cutoff: only show approved
// deliverables where approved_at >= now - 365d; 'Show older' toggle".

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { DeliverableActionPanel } from "../../components/consulting/DeliverableActionPanel";

interface CrossDeliverable {
  deliverable_kind: "project_artifact" | "request_deliverable";
  deliverable_id: string;
  project_id: string | null;
  project_number?: string | null;
  project_title?: string | null;
  engagement_type?: string | null;
  project_type?: string | null;
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
  approved_at?: string | null;
  revision_notes?: string | null;
  reviewed_at?: string | null;
  open_url?: string;
  is_payment_trigger?: boolean | number | null;
  payment_amount_cents?: number | null;
  payment_charge_status?: string | null;
  milestone_id?: number | string | null;
  service_request_id?: string | null;
}

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

// "Pending the client's attention" — the three wire statuses the
// approve/revise flow accepts from the client side (per DeliverableActionPanel
// status vocabulary).
const PENDING_STATUSES = new Set([
  "submitted",
  "in_review",
  "awaiting_client",
  "awaiting_client_review",
]);

// 1-year cutoff in ms.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function DeliverableCard({
  d,
  onChanged,
  viewerRole = "client",
}: {
  d: CrossDeliverable;
  onChanged: () => void;
  viewerRole?: "client" | "founder";
}) {
  const isRequest = d.deliverable_kind === "request_deliverable";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{KIND_ICON[d.kind] || "📎"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2">
            <span>{d.kind}</span>
            <span
              className="px-1.5 py-0.5 rounded text-white font-bold"
              style={{ background: isRequest ? "#0EA5E9" : "#64748b" }}
            >
              {isRequest ? "Request" : "Project"}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate">{d.title}</div>
        </div>
      </div>

      {d.description && (
        <div className="text-xs text-slate-600 mb-2 line-clamp-2 whitespace-pre-wrap">
          {d.description}
        </div>
      )}

      <div className="text-[11px] text-slate-500 mb-2">
        {isRequest && d.parent_ticket_number && (
          <>📨 {d.parent_ticket_number} · {d.parent_ticket_title}</>
        )}
        {!isRequest && d.project_number && (
          <>📁 {d.project_title || d.project_number} ({d.project_number})</>
        )}
      </div>

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

      <div className="mt-2">
        <DeliverableActionPanel
          deliverable={{
            deliverable_id: d.deliverable_id,
            status: d.status,
            approved_at: d.approved_at,
            revision_notes: d.revision_notes,
            is_payment_trigger: d.is_payment_trigger ?? null,
            payment_amount_cents: d.payment_amount_cents ?? null,
            payment_charge_status: d.payment_charge_status ?? null,
          }}
          viewerRole={viewerRole}
          context={
            d.milestone_id != null
              ? "milestone"
              : d.service_request_id != null
              ? "sr"
              : "standalone"
          }
          onChanged={onChanged}
        />
      </div>

      <div className="mt-2 text-[10px] text-slate-400">
        {fmtDate(d.created_at)} · by {d.uploaded_by_kind}
      </div>
    </div>
  );
}

export function ClientConsultingDeliverablesPage() {
  const { get, ready } = useOliverApi();
  const [items, setItems] = useState<CrossDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [showOlder, setShowOlder] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ deliverables: CrossDeliverable[] }>("/consulting-deliverables");
      setItems(Array.isArray(r?.deliverables) ? r.deliverables : []);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const { pending, approvedRecent, approvedOlder } = useMemo(() => {
    const pend: CrossDeliverable[] = [];
    const apprRecent: CrossDeliverable[] = [];
    const apprOlder: CrossDeliverable[] = [];
    const now = Date.now();
    for (const d of items) {
      const status = String(d.status).toLowerCase();
      if (PENDING_STATUSES.has(status)) {
        pend.push(d);
        continue;
      }
      if (status === "approved") {
        // Use approved_at if available, fall back to reviewed_at, fall back
        // to created_at. The 365-day cutoff matches the SCOPE rule.
        const ts =
          d.approved_at || d.reviewed_at || d.created_at || null;
        const age = ts ? now - new Date(ts).getTime() : 0;
        if (!ts || age <= ONE_YEAR_MS) apprRecent.push(d);
        else apprOlder.push(d);
      }
      // archived / revision_requested intentionally not surfaced on the
      // client list — revision_requested rounds back to the founder
      // (client has already acted), archived is hidden by design.
    }
    // Most recent first within each bucket.
    const byDateDesc = (a: CrossDeliverable, b: CrossDeliverable) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    pend.sort(byDateDesc);
    apprRecent.sort(byDateDesc);
    apprOlder.sort(byDateDesc);
    return { pending: pend, approvedRecent: apprRecent, approvedOlder: apprOlder };
  }, [items]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
        Loading deliverables…
      </div>
    );
  }
  if (error) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-red-600">Couldn&apos;t load your deliverables.</div>
        <p className="text-xs text-slate-500 mt-1">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center">
        <Inbox className="mx-auto h-8 w-8 text-slate-400 mb-2" />
        <div className="text-sm font-semibold text-slate-700">No approved deliverables yet.</div>
        {/* 2026-08-29 — the old copy promised that work submitted FOR REVIEW
            shows up here. It doesn't: this library is approval-gated
            (consultingDeliverables.js filters status='approved'), so a client
            with a design sitting in review read an empty page as broken.
            Say where the in-review item actually is. */}
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          This is your library of finished work — designs, proposals, and brand assets
          land here once you&apos;ve approved them. Anything waiting on you right now is
          under <strong>Service Requests</strong>, where you can review it and approve or
          ask for changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Counts strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {pending.length > 0 && (
          <span className="rounded-full bg-purple-100 px-3 py-1 text-purple-800 font-semibold">
            {pending.length} pending review
          </span>
        )}
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
          {approvedRecent.length} approved (last year)
        </span>
        {approvedOlder.length > 0 && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {approvedOlder.length} older
          </span>
        )}
      </div>

      {/* Pending Review — top, always expanded */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-900">Pending your review</h2>
          {pending.length === 0 && (
            <span className="text-[11px] text-slate-500 italic">All caught up.</span>
          )}
        </div>
        {pending.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pending.map((d) => (
              <DeliverableCard
                key={`${d.deliverable_kind}-${d.deliverable_id}`}
                d={d}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </section>

      {/* Approved — collapsed by default. Last year only unless "show older". */}
      {(approvedRecent.length > 0 || approvedOlder.length > 0) && (
        <section>
          <button
            type="button"
            onClick={() => setApprovedOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
          >
            <div className="flex items-center gap-2">
              {approvedOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
              <span className="text-sm font-semibold text-slate-900">Approved</span>
              <span className="text-[10px] text-slate-500">
                ({approvedRecent.length}
                {showOlder && approvedOlder.length > 0 ? ` + ${approvedOlder.length} older` : ""})
              </span>
            </div>
          </button>

          {approvedOpen && (
            <div className="mt-2 space-y-3">
              {approvedRecent.length === 0 && !showOlder && (
                <div className="text-xs text-slate-500 italic px-3">
                  No approved deliverables in the last year.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {approvedRecent.map((d) => (
                  <DeliverableCard
                    key={`${d.deliverable_kind}-${d.deliverable_id}`}
                    d={d}
                    onChanged={load}
                  />
                ))}
                {showOlder &&
                  approvedOlder.map((d) => (
                    <DeliverableCard
                      key={`older-${d.deliverable_kind}-${d.deliverable_id}`}
                      d={d}
                      onChanged={load}
                    />
                  ))}
              </div>
              {approvedOlder.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowOlder((s) => !s)}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {showOlder
                      ? `Hide older deliverables`
                      : `Show ${approvedOlder.length} older deliverable${
                          approvedOlder.length === 1 ? "" : "s"
                        }`}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default ClientConsultingDeliverablesPage;
