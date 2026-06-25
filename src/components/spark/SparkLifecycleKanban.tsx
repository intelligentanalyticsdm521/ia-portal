// SparkLifecycleKanban — F5 Lifecycle Preset Cutover (Brandon 2026-06-25).
//
// Kanban view of lumen.contact rows grouped by lifecycle_stage. Columns are
// rendered from the tenant's preset (simplified=3, moderate=5, advanced=10)
// — fetched once from GET /api/v1/lifecycle/preset and held in state. Drag
// a card from one column to another and we POST
// /api/v1/contacts/:id/lifecycle-stage with the new stage; LUMEN owns the
// state machine + version-controlled concurrency.
//
// SCOPE_WORKING.md "F5: Lifecycle Preset Cutover":
//   - View toggle [List | Kanban] on SparkContactsPage
//   - 3/5/10 columns based on preset
//   - Drag-drop = PATCH-equivalent (we use POST /lifecycle-stage)
//   - 7-day closed grace handled server-side by the kanban endpoint
//
// White-label rule: customer-facing labels never say "tenant". Column
// headers use plain English ("Lead", "Active Customer"); the internal stage
// keys (snake_case) stay in code only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";

// Stable display labels for every possible stage. The preset endpoint
// returns the ORDERED visible list — we look up the label here.
const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  engaged_prospect: "Engaged Prospect",
  qualified_prospect: "Qualified",
  prospect: "Prospect",
  proposal_sent: "Proposal Sent",
  proposal_lapsed: "Proposal Lapsed",
  negotiation: "Negotiation",
  active_customer: "Active Customer",
  past_customer: "Past Customer",
  repeat_customer: "Repeat Customer",
  disqualified: "Disqualified",
  _other: "Other",
};

// Per-stage accent (subtle bg + ring). Mirrors the SubscriptionPill palette
// on SparkContactsPage so the page-wide colour language reads consistently.
const STAGE_ACCENT: Record<string, { bg: string; ring: string; text: string }> = {
  lead:               { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-700" },
  engaged_prospect:   { bg: "bg-sky-50",     ring: "ring-sky-200",     text: "text-sky-700" },
  qualified_prospect: { bg: "bg-blue-50",    ring: "ring-blue-200",    text: "text-blue-700" },
  prospect:           { bg: "bg-indigo-50",  ring: "ring-indigo-200",  text: "text-indigo-700" },
  proposal_sent:      { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-800" },
  proposal_lapsed:    { bg: "bg-rose-50",    ring: "ring-rose-200",    text: "text-rose-700" },
  negotiation:        { bg: "bg-orange-50",  ring: "ring-orange-200",  text: "text-orange-700" },
  active_customer:    { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-800" },
  past_customer:      { bg: "bg-slate-100",  ring: "ring-slate-300",   text: "text-slate-600" },
  repeat_customer:    { bg: "bg-violet-50",  ring: "ring-violet-200",  text: "text-violet-700" },
  disqualified:       { bg: "bg-rose-50",    ring: "ring-rose-200",    text: "text-rose-600" },
  _other:             { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-500" },
};

interface KanbanContact {
  id: number;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company?: string | null;
  lifecycle_stage: string;
  lifecycle_stage_version: number;
  updated_at?: string;
  last_activity_at?: string;
}

interface KanbanPayload {
  preset: "simplified" | "moderate" | "advanced";
  stages: string[];
  buckets: Record<string, KanbanContact[]>;
}

function contactLabel(c: KanbanContact): string {
  if (c.display_name?.trim()) return c.display_name.trim();
  if (c.company?.trim()) return c.company.trim();
  const fullName = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  if (fullName) return fullName;
  return c.email || "—";
}

function contactInitials(c: KanbanContact): string {
  const label = contactLabel(c);
  const parts = label.split(/\s+/);
  const a = (parts[0]?.[0] || "?").toUpperCase();
  const b = (parts[1]?.[0] || "").toUpperCase();
  return a + b;
}

export interface SparkLifecycleKanbanProps {
  /** Optional callback when a contact card is clicked — opens the
   *  unified SparkContactModal so the user can edit details inline. */
  onOpenContact?: (id: number) => void;
  /** Whether to include past_customer / disqualified contacts older than
   *  7 days (the Brandon-LOCKED closed grace window). */
  includeClosed?: boolean;
  /** Render compact (one stat strip width) vs full. Currently no-op but
   *  reserved for future embedding (e.g. inside the customer modal). */
  compact?: boolean;
}

export function SparkLifecycleKanban({ onOpenContact, includeClosed }: SparkLifecycleKanbanProps) {
  const { get, post, ready } = useSparkApi();
  const [payload, setPayload] = useState<KanbanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [moving, setMoving] = useState<{ contactId: number; targetStage: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeClosed) params.set("include_closed", "1");
      const r = await get<{ data: KanbanPayload }>(`/api/v1/lifecycle/kanban?${params}`);
      setPayload(r.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, ready, includeClosed]);

  useEffect(() => { reload(); }, [reload]);

  const handleDrop = useCallback(async (contactId: number, targetStage: string, currentStage: string) => {
    if (targetStage === currentStage) {
      setDragOver(null);
      return;
    }
    setMoving({ contactId, targetStage });
    setDragOver(null);

    // Optimistic move — pluck the card out of its current column, drop it
    // into the new column. If the server rejects we reload to resync.
    setPayload((prev) => {
      if (!prev) return prev;
      const next: KanbanPayload = {
        ...prev,
        buckets: Object.fromEntries(Object.entries(prev.buckets).map(([k, arr]) => [k, [...arr]])),
      };
      // Remove from current
      for (const k of Object.keys(next.buckets)) {
        next.buckets[k] = next.buckets[k].filter((c) => c.id !== contactId);
      }
      // Add to target if it exists
      const moved = prev.buckets[currentStage]?.find((c) => c.id === contactId);
      if (moved && next.buckets[targetStage]) {
        next.buckets[targetStage] = [{ ...moved, lifecycle_stage: targetStage }, ...next.buckets[targetStage]];
      }
      return next;
    });

    try {
      await post(`/api/v1/contacts/${contactId}/lifecycle-stage`, { stage: targetStage });
    } catch (e) {
      // Roll back via reload — the kanban endpoint is the source of truth.
      console.error("[SparkLifecycleKanban] move failed, resyncing", e);
      reload();
    } finally {
      setMoving(null);
    }
  }, [post, reload]);

  // Column descriptors: preset's ordered stages + optional `_other` bucket
  // when persisted stages don't match the preset (rare cutover edge case).
  const columns = useMemo(() => {
    if (!payload) return [];
    const cols = payload.stages.map((s) => ({ key: s, label: STAGE_LABELS[s] || s }));
    if ((payload.buckets._other?.length ?? 0) > 0) {
      cols.push({ key: "_other", label: STAGE_LABELS._other });
    }
    return cols;
  }, [payload]);

  if (loading && !payload) {
    return (
      <div className="text-sm text-slate-500 p-6 text-center">Loading lifecycle…</div>
    );
  }
  if (error) {
    return (
      <div className="text-sm text-rose-600 p-4 border border-rose-200 bg-rose-50 rounded-md">
        Failed to load lifecycle kanban: {(error as Error)?.message || "unknown error"}
      </div>
    );
  }
  if (!payload) return null;

  return (
    <div className="w-full">
      {/* Header strip — preset badge + counts */}
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700">Lifecycle:</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 capitalize ring-1 ring-slate-200">
            {payload.preset}
          </span>
          <span className="text-slate-400">·</span>
          <span>{columns.length} columns</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Drag a card to a new column to change a contact&apos;s stage.
        </div>
      </div>

      {/* Horizontal scroller — each column is min-w-[260px]. Mirrors the
          Consulting Tickets kanban pattern so the surface reads familiar. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {columns.map((col) => {
            const bucket = payload.buckets[col.key] || [];
            const accent = STAGE_ACCENT[col.key] || STAGE_ACCENT._other;
            const isDragTarget = dragOver === col.key;
            return (
              <div
                key={col.key}
                className={`flex flex-col w-[260px] flex-shrink-0 rounded-lg ring-1 ${accent.ring} ${accent.bg} ${
                  isDragTarget ? "ring-2 ring-orange-400" : ""
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                onDragLeave={() => { if (dragOver === col.key) setDragOver(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const data = e.dataTransfer.getData("application/x-spark-contact");
                  if (!data) return;
                  try {
                    const { contactId, fromStage } = JSON.parse(data);
                    handleDrop(contactId, col.key, fromStage);
                  } catch { /* ignore */ }
                }}
              >
                <div className={`px-3 py-2 border-b border-white/60 flex items-center justify-between ${accent.text}`}>
                  <div className="text-xs font-semibold uppercase tracking-wider">
                    {col.label}
                  </div>
                  <div className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white/70 ring-1 ring-black/5">
                    {bucket.length}
                  </div>
                </div>
                <div className="p-2 flex flex-col gap-1.5 min-h-[100px] max-h-[60vh] overflow-y-auto">
                  {bucket.length === 0 && (
                    <div className="text-[11px] text-slate-400 italic px-2 py-3 text-center">
                      Empty
                    </div>
                  )}
                  {bucket.map((c) => {
                    const isMoving = moving?.contactId === c.id;
                    return (
                      <div
                        key={c.id}
                        draggable={!isMoving}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/x-spark-contact",
                            JSON.stringify({ contactId: c.id, fromStage: c.lifecycle_stage }),
                          );
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onOpenContact?.(c.id)}
                        className={`bg-white rounded-md ring-1 ring-slate-200 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing px-2.5 py-2 ${
                          isMoving ? "opacity-50" : ""
                        }`}
                        title="Drag to move, click to open"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-semibold text-slate-700">
                              {contactInitials(c)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium text-slate-900 truncate">
                              {contactLabel(c)}
                            </div>
                            {c.email && (
                              <div className="text-[10px] text-slate-500 truncate">{c.email}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SparkLifecycleKanban;
