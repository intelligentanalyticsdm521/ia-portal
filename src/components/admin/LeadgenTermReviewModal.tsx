// LeadgenTermReviewModal — resolves a single platform.term_review_queue entry.
//
// Four actions (mirror POST /admin/leadgen-v1/term-review-queue/:id/resolve):
//   • add_root    — promote the submitted term to a new root keyword_term
//   • add_variant — add as a variant under an existing parent_term_id
//   • duplicate   — mark queue entry resolved, point at existing parent term
//   • reject      — drop without inserting anything
//
// Industry pickers are simple <input type=number> fields for now (no
// keyword_industry list endpoint exists yet). Parent-term picker uses the
// already-deployed /leadgen/terms/autocomplete — that endpoint requires the
// user's MSAL token, so we lazy-import the spark API client and call it the
// normal way (NOT via the founder token).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { AlertTriangle, ChevronRight, Tag, Copy, X as XIcon, Layers } from "lucide-react";
import { sparkGet } from "../../lib/sparkApi";

type ResolveAction = "add_root" | "add_variant" | "duplicate" | "reject";

interface QueueEntry {
  id: number;
  submitted_term: string;
  normalized_term: string | null;
  hint: string | null;
  tenant_id: string | null;
  occurrence_count: number;
}

interface ParentTermHit { id: number; term: string; industry_id: number | null; is_root: number }

interface Props {
  open: boolean;
  entry: QueueEntry | null;
  token: string;
  apiBase: string;
  onClose: () => void;
  onResolved: () => void;
}

export function LeadgenTermReviewModal({ open, entry, token, apiBase, onClose, onResolved }: Props) {
  const [action, setAction] = useState<ResolveAction | null>(null);
  const [industryId, setIndustryId] = useState<string>("");
  const [parent, setParent] = useState<ParentTermHit | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const [parentHits, setParentHits] = useState<ParentTermHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAction(null);
      setIndustryId("");
      setParent(null);
      setParentQuery("");
      setParentHits([]);
      setError(null);
    }
  }, [open]);

  // Parent-term autocomplete (MSAL-auth — uses the tenant API the way the new
  // search page does). Skipped unless the chosen action needs it.
  const { instance, accounts } = useMsal();
  const msalAccount = accounts[0];
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (action !== "add_variant" && action !== "duplicate") return;
    if (!parentQuery.trim() || !msalAccount) { setParentHits([]); return; }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await sparkGet<{ data: ParentTermHit[] }>(
          instance, msalAccount,
          `/api/v1/leadgen/terms/autocomplete?q=${encodeURIComponent(parentQuery.trim())}&limit=20`
        );
        setParentHits(r.data || []);
      } catch {
        setParentHits([]);
      }
    }, 200);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [action, parentQuery, instance, msalAccount]);

  const canSave = useMemo(() => {
    if (!action) return false;
    if (action === "add_root") return industryId.trim().length > 0;
    if (action === "add_variant") return !!parent;
    if (action === "duplicate") return !!parent;
    if (action === "reject") return true;
    return false;
  }, [action, industryId, parent]);

  const save = useCallback(async () => {
    if (!entry || !action) return;
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "add_root") body.industry_id = parseInt(industryId);
      if (action === "add_variant") {
        body.parent_term_id = parent?.id;
        body.industry_id = parent?.industry_id ?? null;
      }
      if (action === "duplicate") body.parent_term_id = parent?.id;

      const res = await fetch(`${apiBase}/api/v1/admin/leadgen-v1/term-review-queue/${entry.id}/resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [entry, action, industryId, parent, apiBase, token, onResolved]);

  if (!open || !entry) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[80vh] w-[min(1200px,94vw)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 text-white"
             style={{ background: "linear-gradient(to right, #0B1C24, #1a3540)" }}>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#EF6C33" }}>
              SPARK · TERM REVIEW
            </div>
            <h2 className="mt-0.5 truncate text-base font-semibold">
              "{entry.submitted_term}"
            </h2>
            <div className="mt-0.5 truncate text-[11px] text-white/60">
              {entry.occurrence_count} occurrence{entry.occurrence_count === 1 ? "" : "s"}
              {entry.hint ? ` · hint: ${entry.hint}` : ""}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div><strong>Normalized:</strong> <code className="font-mono">{entry.normalized_term || "—"}</code></div>
            <div><strong>Tenant:</strong> <code className="font-mono">{entry.tenant_id || "—"}</code></div>
          </div>

          {/* Action picker */}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Action</h3>
          <div className="grid gap-2 md:grid-cols-2">
            <ActionCard
              icon={<Layers className="h-4 w-4" />}
              title="Add as root term"
              desc="Promote to its own keyword_term row in the chosen industry."
              active={action === "add_root"}
              onClick={() => setAction("add_root")}
            />
            <ActionCard
              icon={<ChevronRight className="h-4 w-4" />}
              title="Add as variant of existing"
              desc="Inserts a narrower keyword_term + relation row under a parent."
              active={action === "add_variant"}
              onClick={() => setAction("add_variant")}
            />
            <ActionCard
              icon={<Copy className="h-4 w-4" />}
              title="Duplicate of existing"
              desc="Resolves the queue entry to an existing term; nothing new is inserted."
              active={action === "duplicate"}
              onClick={() => setAction("duplicate")}
            />
            <ActionCard
              icon={<Tag className="h-4 w-4" />}
              title="Reject"
              desc="Mark resolved without inserting. Use for junk submissions."
              active={action === "reject"}
              onClick={() => setAction("reject")}
            />
          </div>

          {/* Per-action form */}
          {action === "add_root" && (
            <div className="mt-5">
              <label className="block text-xs font-semibold text-slate-700">Industry ID *</label>
              <input
                type="number"
                value={industryId}
                onChange={(e) => setIndustryId(e.target.value)}
                placeholder="platform.keyword_industry.id"
                className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {/* TODO(backend): add /leadgen/industries/autocomplete so this is a search, not a numeric ID. */}
                No industry autocomplete endpoint yet — paste the numeric <code>keyword_industry.id</code>.
              </p>
            </div>
          )}

          {(action === "add_variant" || action === "duplicate") && (
            <div className="mt-5">
              <label className="block text-xs font-semibold text-slate-700">Parent term *</label>
              <input
                type="text"
                value={parent ? parent.term : parentQuery}
                onChange={(e) => { setParent(null); setParentQuery(e.target.value); }}
                placeholder="Search by term (e.g. property managers)"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {!parent && parentHits.length > 0 && (
                <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  {parentHits.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => setParent(h)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span>
                          <span className="font-semibold text-slate-900">{h.term}</span>
                          {h.is_root === 1 && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-700">root</span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          industry #{h.industry_id ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {parent && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  Picked <strong>"{parent.term}"</strong> (id {parent.id}, industry {parent.industry_id ?? "—"})
                  <button onClick={() => setParent(null)} className="ml-2 text-slate-500 underline">change</button>
                </div>
              )}
            </div>
          )}

          {action === "reject" && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Marks the queue entry resolved with <code>action_taken="reject"</code> and no inserts.
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose}
                  className="rounded px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={!canSave || saving} onClick={() => void save()}
                  className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Resolve"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon, title, desc, active, onClick,
}: {
  icon: React.ReactNode; title: string; desc: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        active ? "border-[#EF6C33] bg-amber-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className={`mt-0.5 rounded-md p-1.5 ${active ? "bg-[#EF6C33] text-white" : "bg-slate-100 text-slate-600"}`}>
        {icon}
      </span>
      <span>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
      </span>
    </button>
  );
}

export default LeadgenTermReviewModal;
