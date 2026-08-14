// ConsultingDocumentLibraryPage — F4 (Consulting Rework 2026-06-25).
//
// Founder-only library of every consulting document template — intake
// forms (rendered question schemas, scored) plus proposal / report /
// scope_of_work / custom markdown templates with merge-tag support.
//
// Backed by:
//   GET    /consulting/document-templates?kind=...&include_archived=...
//   GET    /consulting/document-templates/:id
//   POST   /consulting/document-templates
//   PATCH  /consulting/document-templates/:id
//
// All endpoints are founder-gated server-side (consulting documents are
// not surfaced to client tenants). The Document Library nav entry is
// hidden from non-founder users via CONSULTING_FOUNDER_ONLY in
// AppShell.tsx — the page itself does NOT re-check isFounder beyond
// trusting the backend's 403 to render an empty list with an inline
// banner.
//
// Behavioral rules (locked 2026-06-25):
//   - Kind filter chips: All | Intake | Proposal | Report | Scope of Work
//     | Custom. Default: All.
//   - Sorted by updated_at DESC.
//   - Click any row → opens the editor modal for the row's kind:
//       intake     → IntakeTemplateEditorModal (drag-drop question builder)
//       proposal / report / scope_of_work / custom
//                  → ProposalTemplateEditorModal (TipTap rich-text +
//                                                 merge-tag autocomplete)
//   - "+ New Template" → mini picker: pick kind → open editor with blanks.
//   - System-seed rows (is_system_seed=1) render with a lock icon and the
//     "Edit" CTA becomes "View / Clone" — system templates are read-only
//     in the backend; the modal opens read-only with a "Clone to founder
//     scope" action that POSTs a new founder-scoped template seeded from
//     the system row.
//
// Per [[no-tenant-in-ui]] — the UI never says "tenant"; founder-scope
// templates are labeled "All projects" and per_tenant-scope templates
// are labeled "Per client" in the scope badge.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal } from "../../components/IadmModal";
import { FileText, ClipboardList, BarChart3, ScrollText, Sparkles, Lock, Plus, Search, Clock } from "lucide-react";
import { IntakeTemplateEditorModal } from "../../components/consulting/IntakeTemplateEditorModal";
import { ProposalTemplateEditorModal } from "../../components/consulting/ProposalTemplateEditorModal";

// ─── Types ──────────────────────────────────────────────────────────────

export type DocumentTemplateKind =
  | "intake"
  | "proposal"
  | "report"
  | "scope_of_work"
  | "custom";

export type DocumentTemplateScope = "system" | "founder" | "per_tenant";

export interface DocumentTemplateRow {
  template_id: string;
  slug: string;
  scope: DocumentTemplateScope;
  kind: DocumentTemplateKind;
  name: string;
  description?: string | null;
  version: number;
  is_system_seed: boolean | number;
  is_archived: boolean | number;
  updated_at: string;
  created_at?: string | null;
}

// Kind chip metadata. Order matters — this is the chip strip in render order.
const KIND_META: Array<{
  key: DocumentTemplateKind | "all";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "all",           label: "All",            icon: FileText },
  { key: "intake",        label: "Intake",         icon: ClipboardList },
  { key: "proposal",      label: "Proposal",       icon: ScrollText },
  { key: "report",        label: "Report",         icon: BarChart3 },
  { key: "scope_of_work", label: "Scope of Work",  icon: ScrollText },
  { key: "custom",        label: "Custom",         icon: Sparkles },
];

const KIND_BADGE: Record<DocumentTemplateKind, { bg: string; fg: string; label: string }> = {
  intake:        { bg: "#FEF3C7", fg: "#92400E", label: "Intake" },
  proposal:      { bg: "#DBEAFE", fg: "#1E40AF", label: "Proposal" },
  report:        { bg: "#D1FAE5", fg: "#065F46", label: "Report" },
  scope_of_work: { bg: "#E0E7FF", fg: "#3730A3", label: "Scope" },
  custom:        { bg: "#F3E8FF", fg: "#6B21A8", label: "Custom" },
};

const SCOPE_BADGE: Record<DocumentTemplateScope, { bg: string; fg: string; label: string }> = {
  system:     { bg: "#E2E8F0", fg: "#334155", label: "System" },
  founder:    { bg: "#FEC82C33", fg: "#7A4F0B", label: "All projects" },
  per_tenant: { bg: "#DCFCE7", fg: "#166534", label: "Per client" },
};

function asBool(v: boolean | number | undefined): boolean {
  return typeof v === "number" ? v === 1 : !!v;
}

function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Page ───────────────────────────────────────────────────────────────

export function ConsultingDocumentLibraryPage() {
  const { get, ready } = useOliverApi();

  const [rows, setRows] = useState<DocumentTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<DocumentTemplateKind | "all">("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Editor modal state
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [openTemplateKind, setOpenTemplateKind] = useState<DocumentTemplateKind | null>(null);
  // 'new' picker
  const [showNewPicker, setShowNewPicker] = useState(false);
  // when modal closes, refresh
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (kindFilter !== "all") qs.set("kind", kindFilter);
      if (showArchived) qs.set("include_archived", "1");
      // useOliverApi auto-strips the {data:...} envelope.
      const r = await get<{ templates: DocumentTemplateRow[] }>(`/consulting/document-templates?${qs}`);
      setRows(Array.isArray(r?.templates) ? r.templates : []);
    } catch (e) {
      const msg = (e as Error).message || "Could not load templates";
      // FIX-6 (2026-07-22): real error — the F4 backend is mounted, so a 404
      // here means a genuine routing/data problem, not an unshipped feature.
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready, kindFilter, showArchived, refreshTick]);

  useEffect(() => { load(); }, [load]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.slice();
    if (q) {
      out = out.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q),
      );
    }
    // Default sort: updated_at DESC. Defensive — the API should already
    // be returning in this order.
    out.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return out;
  }, [rows, search]);

  function handleRowOpen(row: DocumentTemplateRow) {
    setOpenTemplateId(row.template_id);
    setOpenTemplateKind(row.kind);
  }

  function handleCloseEditor(opts?: { refresh?: boolean }) {
    setOpenTemplateId(null);
    setOpenTemplateKind(null);
    if (opts?.refresh) setRefreshTick((t) => t + 1);
  }

  function handlePickNewKind(kind: DocumentTemplateKind) {
    setShowNewPicker(false);
    // open editor with id=null (=> create mode); kind drives which editor
    // surface is mounted.
    setOpenTemplateId("__new__");
    setOpenTemplateKind(kind);
  }

  return (
    <OliverPageWrapper
      title="Document Library"
      subtitle="IA Consulting · Intake forms, proposals, and report templates"
      error={null /* errors render inline so the table shell stays visible */}
      loading={false}
    >
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-500" />
              Document Library
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Founder-only · templates for intake forms, proposals, scopes of work, and reports.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewPicker(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#0C4A60] text-white text-xs font-semibold hover:bg-[#0a3d50]"
            >
              <Plus className="h-3.5 w-3.5" /> New Template
            </button>
          </div>
        </div>

        {/* Kind filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {KIND_META.map(({ key, label, icon: Icon }) => {
            const active = kindFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setKindFilter(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                  active
                    ? "bg-[#0C4A60] text-white border border-[#0C4A60]"
                    : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show archived
          </label>
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-[320px] ml-auto">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs bg-white"
            />
          </div>
          <span className="text-[11px] text-slate-500">
            {visibleRows.length} template{visibleRows.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            {error}
          </div>
        )}

        {/* List body */}
        {loading ? (
          <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>Loading templates…</div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">No templates match these filters.</div>
            <p className="text-xs text-slate-500 mt-1">
              Adjust the kind filter or click <strong>+ New Template</strong> to start one.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Name</th>
                  <th style={{ textAlign: "left" }}>Kind</th>
                  <th style={{ textAlign: "left" }}>Scope</th>
                  <th style={{ textAlign: "left" }}>Version</th>
                  <th style={{ textAlign: "right" }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const isSystem = asBool(r.is_system_seed);
                  const isArchived = asBool(r.is_archived);
                  const kindBadge = KIND_BADGE[r.kind];
                  const scopeBadge = SCOPE_BADGE[r.scope];
                  return (
                    <tr
                      key={r.template_id}
                      onClick={() => handleRowOpen(r)}
                      style={{ cursor: "pointer", opacity: isArchived ? 0.55 : 1 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F8FAFC"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      <td>
                        <div className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
                          {isSystem && <Lock className="h-3 w-3 text-slate-400" aria-label="System template" />}
                          {r.name}
                          {isArchived && (
                            <span className="ml-1 text-[10px] uppercase font-bold text-slate-400">Archived</span>
                          )}
                        </div>
                        {r.description && (
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{r.description}</div>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            background: kindBadge.bg, color: kindBadge.fg,
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                            padding: "2px 8px", borderRadius: 99, textTransform: "uppercase",
                          }}
                        >
                          {kindBadge.label}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            background: scopeBadge.bg, color: scopeBadge.fg,
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                            padding: "2px 8px", borderRadius: 99, textTransform: "uppercase",
                          }}
                        >
                          {scopeBadge.label}
                        </span>
                      </td>
                      <td><div className="text-xs text-slate-600">v{r.version}</div></td>
                      <td style={{ textAlign: "right" }}>
                        <div className="text-xs text-slate-600 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {fmtRelative(r.updated_at)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New-template picker */}
      {showNewPicker && (
        <IadmModal
          open
          onClose={() => setShowNewPicker(false)}
          product="oliver"
          eyebrow="NEW TEMPLATE"
          title="Pick a template kind"
          size="nav"
        >
          <div className="p-4 space-y-2">
            <p className="text-xs text-slate-600">
              Intake templates use a drag-drop question builder with scoring. Everything
              else uses the rich-text editor with merge-tag autocomplete.
            </p>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {(["intake", "proposal", "report", "scope_of_work", "custom"] as DocumentTemplateKind[]).map((k) => {
                const m = KIND_META.find((x) => x.key === k);
                const Icon = m?.icon || FileText;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handlePickNewKind(k)}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-[#0C4A60] hover:bg-[#0C4A60]/5 transition"
                  >
                    <Icon className="h-4 w-4 text-slate-500" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{m?.label || k}</div>
                      <div className="text-[11px] text-slate-500">
                        {k === "intake"
                          ? "Scored question form — sliders, multi/single-select, free text."
                          : "Markdown body with merge-tag autocomplete."}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </IadmModal>
      )}

      {/* Editor modals — mounted by kind */}
      {openTemplateId && openTemplateKind === "intake" && (
        <IntakeTemplateEditorModal
          open
          templateId={openTemplateId === "__new__" ? null : openTemplateId}
          onClose={() => handleCloseEditor()}
          onSaved={() => handleCloseEditor({ refresh: true })}
        />
      )}
      {openTemplateId && openTemplateKind && openTemplateKind !== "intake" && (
        <ProposalTemplateEditorModal
          open
          templateId={openTemplateId === "__new__" ? null : openTemplateId}
          kind={openTemplateKind}
          onClose={() => handleCloseEditor()}
          onSaved={() => handleCloseEditor({ refresh: true })}
        />
      )}
    </OliverPageWrapper>
  );
}

export default ConsultingDocumentLibraryPage;
