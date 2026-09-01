// ConsultingCategoryBuilderModal — F6 (Consulting Rework, 2026-06-25)
//
// Founder-only modal that powers the "+ New Category" + "Edit Category"
// buttons on the Projects page. Backed by:
//
//   POST   /consulting/categories          → create
//   PUT    /consulting/categories/:id      → edit (system seeds: name +
//                                            description + icon + milestones
//                                            editable, slug + seed flag NOT)
//   DELETE /consulting/categories/:id      → archive (blocked for system
//                                            seeds; blocked when in-use)
//
// Layout (IadmModal size="info" — the 1200×80vh canvas Brandon's brief
// calls "large"): single-column form. Left half is meta (name, slug,
// description, icon, default duration, default budget cap). Right half
// is the milestone template — a drag-reorderable list of {name,
// description, default_duration_days, is_payment_trigger toggle,
// payment_pct} cards with an Add Milestone button below.
//
// Drag-reorder pattern mirrors ConsultingTicketsBoardPage's HTML5 drag-
// drop wiring (no library, just dataTransfer.setData + onDrop). One row
// is dragged at a time; drop replaces the target index.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase, Zap, Plus, Image as ImageIcon, Palette, BarChart2, Monitor,
  TrendingUp, Megaphone, ArrowRightLeft, Calendar, Code,
  GripVertical, Trash2, AlertCircle, Archive as ArchiveIcon,
} from "lucide-react";
import { IadmModal } from "../../components/IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";

// ── Icon set ────────────────────────────────────────────────────────────
// Locked Brandon 2026-06-25 set (matches _seed_consulting_categories.cjs).
// Each entry pairs a server-stored slug with the actual lucide-react
// component so the picker can render real icons.
export const CATEGORY_ICONS: Array<{ key: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { key: "Briefcase",      label: "Briefcase",      Icon: Briefcase },
  { key: "Zap",            label: "Zap",            Icon: Zap },
  { key: "Plus",           label: "Plus",           Icon: Plus },
  { key: "Image",          label: "Image",          Icon: ImageIcon },
  { key: "Palette",        label: "Palette",        Icon: Palette },
  { key: "BarChart2",      label: "BarChart2",      Icon: BarChart2 },
  { key: "Monitor",        label: "Monitor",        Icon: Monitor },
  { key: "TrendingUp",     label: "TrendingUp",     Icon: TrendingUp },
  { key: "Megaphone",      label: "Megaphone",      Icon: Megaphone },
  { key: "ArrowRightLeft", label: "ArrowRightLeft", Icon: ArrowRightLeft },
  { key: "Calendar",       label: "Calendar",       Icon: Calendar },
  { key: "Code",           label: "Code",           Icon: Code },
];

export function iconComponentFor(slug: string | null | undefined): React.ComponentType<{ className?: string }> | null {
  if (!slug) return null;
  // Exact match first; then try lowercase to be lenient against
  // historical seed values like "handshake" / "chart-bar".
  const exact = CATEGORY_ICONS.find((i) => i.key === slug);
  if (exact) return exact.Icon;
  const lc = String(slug).toLowerCase();
  const fuzzy = CATEGORY_ICONS.find((i) => i.key.toLowerCase() === lc);
  return fuzzy?.Icon || null;
}

// ── Types ───────────────────────────────────────────────────────────────
export interface MilestoneTemplateEntry {
  name: string;
  description?: string | null;
  default_duration_days?: number | null;
  is_payment_trigger?: boolean;
  payment_pct?: number | null;
  // sort_order is implicit (array index); server recomputes it on save.
  sort_order?: number;
}

export interface CategoryShape {
  category_id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  milestone_template_json?: MilestoneTemplateEntry[] | null;
  default_duration_days?: number | null;
  default_budget_cap_cents?: number | null;
  is_system_seed?: boolean;
  is_archived?: boolean;
}

interface Props {
  /** When non-null we render in edit mode against an existing category. */
  category: CategoryShape | null;
  onClose: () => void;
  onSaved: (saved: CategoryShape) => void;
  /** Optional — called after a successful archive so the parent can refresh. */
  onArchived?: (categoryId: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function autoSlugClient(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function blankMilestone(): MilestoneTemplateEntry {
  return {
    name: "",
    description: "",
    default_duration_days: 1,
    is_payment_trigger: false,
    payment_pct: null,
  };
}

// ── Component ───────────────────────────────────────────────────────────
export function ConsultingCategoryBuilderModal({
  category, onClose, onSaved, onArchived,
}: Props) {
  const { post, put, del } = useOliverApi();

  const isEdit = !!category;
  const isSystemSeed = !!category?.is_system_seed;

  // Slug stays editable on create only — once a category exists the slug
  // is immutable (changing it would break consulting.project.FK_category +
  // any seed-script invariants).
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit); // edit ⇒ don't auto-rewrite slug
  const [description, setDescription] = useState(category?.description ?? "");
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [durationDays, setDurationDays] = useState<string>(
    category?.default_duration_days != null ? String(category.default_duration_days) : "",
  );
  const [budgetCapUsd, setBudgetCapUsd] = useState<string>(
    category?.default_budget_cap_cents != null ? String(category.default_budget_cap_cents / 100) : "",
  );
  const [milestones, setMilestones] = useState<MilestoneTemplateEntry[]>(
    () => (category?.milestone_template_json && category.milestone_template_json.length > 0)
      ? category.milestone_template_json.map((m) => ({
          name: m.name || "",
          description: m.description || "",
          default_duration_days: m.default_duration_days ?? 1,
          is_payment_trigger: !!m.is_payment_trigger,
          payment_pct: m.payment_pct ?? null,
        }))
      : [blankMilestone()],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Auto-derive slug from name UNTIL the user touches the slug field. Once
  // touched, lock it — same UX pattern as the Brand Refresh field on the
  // founder wizard.
  useEffect(() => {
    if (isEdit) return;
    if (slugTouched) return;
    setSlug(autoSlugClient(name));
  }, [name, slugTouched, isEdit]);

  // Drag-reorder state — store the source index, swap on drop. Same shape
  // as ConsultingTicketsBoardPage's bucket drag wiring but on list rows.
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const moveMilestone = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setMilestones((prev) => {
      const next = prev.slice();
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, []);

  const updateMilestone = useCallback((idx: number, patch: Partial<MilestoneTemplateEntry>) => {
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }, []);

  const addMilestone = useCallback(() => {
    setMilestones((prev) => [...prev, blankMilestone()]);
  }, []);

  const removeMilestone = useCallback((idx: number) => {
    setMilestones((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  }, []);

  // Total payment % — used by the inline validation banner so the founder
  // knows if their payment-trigger splits add up to 100 (not a hard rule
  // yet; F2 will enforce it but for now we surface the math).
  const totalPaymentPct = useMemo(() => {
    let sum = 0;
    for (const m of milestones) {
      if (m.is_payment_trigger && m.payment_pct != null) {
        const n = Number(m.payment_pct);
        if (Number.isFinite(n)) sum += n;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [milestones]);

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (!slug.trim()) return false;
    if (milestones.length === 0) return false;
    if (milestones.some((m) => !m.name.trim())) return false;
    return true;
  }, [name, slug, milestones]);

  async function save() {
    setErr(null);
    if (!canSave) {
      setErr("Fill in name, slug, and at least one named milestone.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        icon: icon || null,
        milestone_template_json: milestones.map((m, idx) => ({
          name: m.name.trim(),
          description: m.description?.trim() || null,
          sort_order: idx + 1,
          default_duration_days: m.default_duration_days == null ? null : Number(m.default_duration_days) || 0,
          is_payment_trigger: !!m.is_payment_trigger,
          payment_pct: m.is_payment_trigger && m.payment_pct != null ? Number(m.payment_pct) : null,
        })),
        default_duration_days: durationDays.trim() ? Math.max(0, Math.floor(Number(durationDays))) : null,
        default_budget_cap_cents: budgetCapUsd.trim() ? Math.round(Number(budgetCapUsd) * 100) : null,
      };
      if (!isEdit) payload.slug = slug.trim();

      let saved: CategoryShape;
      if (isEdit && category) {
        // 2026-09-01 — useOliverApi unwraps the envelope, so `r.data` was
        // undefined on BOTH branches and `saved` was always falsy. Every save
        // therefore hit the throw below and reported "Server did not return the
        // saved category" — while the category had in fact been saved.
        const r = await put<CategoryShape>(`/consulting/categories/${category.category_id}`, payload);
        saved = r;
      } else {
        const r = await post<CategoryShape>("/consulting/categories", payload);
        saved = r;
      }
      if (!saved) throw new Error("Server did not return the saved category.");
      onSaved(saved);
    } catch (e) {
      setErr((e as Error).message || "Failed to save category.");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!category) return;
    setErr(null);
    setBusy(true);
    try {
      await del<{ data: { is_archived: boolean } }>(`/consulting/categories/${category.category_id}`);
      onArchived?.(category.category_id);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to archive category.");
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow={isEdit ? (isSystemSeed ? "SYSTEM CATEGORY · EDIT" : "CUSTOM CATEGORY · EDIT") : "NEW CATEGORY"}
      title={isEdit ? `Edit "${category?.name || "category"}"` : "Build a new project category"}
      size="info"
    >
      <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
        {err && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 inline-flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {err}
          </div>
        )}

        {isSystemSeed && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            This is a system seed category. You can update the name, description, icon,
            and milestone template — but archival and slug edits are blocked so the
            seed script stays in sync.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── Left column: meta ──────────────────────────────────── */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Quarterly Insights Review"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Slug {isEdit ? <span className="text-slate-400 font-normal">(locked)</span> : "*"}
              </label>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  // Filter to slug-safe chars as the user types so they
                  // can't accidentally save spaces or punctuation.
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
                }}
                disabled={isEdit}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="auto_from_name"
              />
              {!isEdit && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Auto-fills from name until you edit it. Lowercase letters, numbers, underscores.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Short one-liner shown in the New Project picker."
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Icon</label>
              <div className="grid grid-cols-6 gap-1.5">
                {CATEGORY_ICONS.map((opt) => {
                  const active = icon === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setIcon(active ? null : opt.key)}
                      title={opt.label}
                      className={`flex items-center justify-center p-2 rounded border transition ${
                        active
                          ? "border-[#0C4A60] bg-[#0C4A60]/10 text-[#0C4A60]"
                          : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <opt.Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default duration (days)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="e.g. 14"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default budget cap (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={budgetCapUsd}
                  onChange={(e) => setBudgetCapUsd(e.target.value)}
                  placeholder="optional"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Stored as cents server-side. Currency: USD (locked).
                </p>
              </div>
            </div>
          </div>

          {/* ── Right column: milestones ───────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Milestone template
              </label>
              <span className="text-[10px] text-slate-500">
                Drag <GripVertical className="inline h-3 w-3" /> to reorder · {milestones.length} step{milestones.length === 1 ? "" : "s"}
              </span>
            </div>

            {totalPaymentPct > 0 && (
              <div
                className={`text-[11px] rounded px-2 py-1 border ${
                  totalPaymentPct === 100
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                Payment splits sum to <strong>{totalPaymentPct}%</strong>
                {totalPaymentPct !== 100 && " · usually targets 100%"}
              </div>
            )}

            <div className="space-y-2">
              {milestones.map((m, idx) => {
                const isDragging = dragIdx === idx;
                return (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(idx));
                      setDragIdx(idx);
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromStr = e.dataTransfer.getData("text/plain");
                      const from = Number(fromStr);
                      if (Number.isInteger(from) && from !== idx) moveMilestone(from, idx);
                      setDragIdx(null);
                    }}
                    onDragEnd={() => setDragIdx(null)}
                    className={`rounded-lg border bg-white p-2 ${
                      isDragging ? "opacity-50 border-[#0C4A60]" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        title="Drag to reorder"
                        className="text-slate-400 hover:text-slate-700 cursor-grab pt-1"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <span className="text-[10px] font-mono text-slate-500 pt-1">{idx + 1}</span>
                      <div className="flex-1 space-y-1.5">
                        <input
                          value={m.name}
                          onChange={(e) => updateMilestone(idx, { name: e.target.value })}
                          placeholder="Milestone name *"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-medium"
                        />
                        <input
                          value={m.description ?? ""}
                          onChange={(e) => updateMilestone(idx, { description: e.target.value })}
                          placeholder="Short description (optional)"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                        <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap">
                          <label className="flex items-center gap-1">
                            <span className="text-slate-500">Duration:</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={m.default_duration_days ?? ""}
                              onChange={(e) => updateMilestone(idx, {
                                default_duration_days: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              })}
                              className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                            />
                            <span className="text-slate-500">days</span>
                          </label>

                          <label className="flex items-center gap-1 ml-2">
                            <input
                              type="checkbox"
                              checked={!!m.is_payment_trigger}
                              onChange={(e) => updateMilestone(idx, {
                                is_payment_trigger: e.target.checked,
                                payment_pct: e.target.checked ? (m.payment_pct ?? 25) : null,
                              })}
                            />
                            <span>Payment trigger</span>
                          </label>

                          {m.is_payment_trigger && (
                            <label className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={m.payment_pct ?? ""}
                                onChange={(e) => updateMilestone(idx, {
                                  payment_pct: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))),
                                })}
                                className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                              />
                              <span className="text-slate-500">%</span>
                            </label>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMilestone(idx)}
                        disabled={milestones.length <= 1}
                        title={milestones.length <= 1 ? "At least one milestone required" : "Remove milestone"}
                        className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed pt-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addMilestone}
              className="w-full mt-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-3 w-3" /> Add milestone
            </button>
          </div>
        </div>

        {/* ── Footer actions ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <div>
            {isEdit && !isSystemSeed && (
              confirmArchive ? (
                <div className="inline-flex items-center gap-2 text-xs">
                  <span className="text-rose-700 font-semibold">Archive this category?</span>
                  <button
                    type="button"
                    onClick={archive}
                    disabled={busy}
                    className="px-2 py-1 rounded bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busy ? "Archiving…" : "Yes, archive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmArchive(false)}
                    disabled={busy}
                    className="px-2 py-1 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
                >
                  <ArchiveIcon className="h-3 w-3" /> Archive category
                </button>
              )
            )}
            {isEdit && isSystemSeed && (
              <span className="text-[11px] text-slate-400 italic">System seeds can't be archived.</span>
            )}
          </div>
          <div className="flex gap-2">
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
              onClick={save}
              disabled={busy || !canSave}
              className="px-3 py-1.5 rounded bg-[#0C4A60] text-white text-xs font-semibold disabled:opacity-50"
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Create category"}
            </button>
          </div>
        </div>
      </div>
    </IadmModal>
  );
}

export default ConsultingCategoryBuilderModal;
