// PortalLayoutTab — F-114 Phase 3 (Onboarding V3 Phase 3 final sub-item).
//
// Constrained WYSIWYG portal layout editor. Lives inside the Portal Settings
// hub's per-portal modal (OliverPortalsHubPage.tsx) as the 5th tab next to
// Design / Signup / Domain / Workflow.
//
// What it does:
//   • Loads the layout row for a (portal_kind, page_key) pair from
//     /portal-layout?kind=…&page=… (the backend implicitly creates an empty
//     row on first read).
//   • Shows each pre-defined slot for that page as a card with a vertical
//     list of blocks. Each block has Edit / Delete / ↑ / ↓ buttons.
//   • Add block: opens a per-kind config form. embed_html is gated on
//     embed_html_unlocked from the backend response (Pro+).
//   • Save (PATCH) persists the slots JSON without changing publish state.
//   • Publish (POST .../publish) flips is_published=1 — separate button so
//     the tenant can iterate in draft.
//
// The backend whitelists block_kind on PATCH so a misbehaving client can't
// inject a new kind by editing localStorage / DevTools — the server will 400
// any unknown kind or any disallowed kind for the tenant's tier.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers, Plus, Trash2, ArrowUp, ArrowDown, Save, Send, RotateCcw,
  Megaphone, MousePointerClick, Zap, Clock, Link as LinkIcon, Code2, Lock,
  Eye,
} from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";

// ─────────────────────────────────────────────────────────────────────────
// Types — mirror the backend payload shapes in routes/portalLayout.js.
// ─────────────────────────────────────────────────────────────────────────

export type PortalKind = "customer" | "crew" | "booking";

type BlockKind =
  | "announcement_banner"
  | "cta_card"
  | "quick_actions"
  | "recent_activity"
  | "links_list"
  | "embed_html";

type BlockConfig = Record<string, unknown>;

interface Block {
  block_kind: BlockKind;
  config: BlockConfig;
}

type Slots = Record<string, Block[]>;

interface LayoutResponse {
  layout_id: string;
  portal_kind: PortalKind;
  page_key: string;
  slots: Slots;
  is_published: boolean;
  updated_at: string;
  allowed_block_kinds: BlockKind[];
  embed_html_unlocked: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-page slot menu. Adding a portal page is two changes:
//   1) Add a page_key here with the human label + slot list.
//   2) Add the matching slot wrappers in the customer portal SWA (separate
//      task — see followups in commit message).
// Slot order = display order in the editor.
// ─────────────────────────────────────────────────────────────────────────

const PAGE_SLOTS: Record<PortalKind, Array<{ key: string; label: string; slots: Array<{ key: string; label: string; hint: string }> }>> = {
  customer: [
    {
      key: "dashboard",
      label: "Dashboard (home)",
      slots: [
        { key: "top_banner",   label: "Top banner",   hint: "Welcome message or announcement above the fold." },
        { key: "primary",      label: "Primary area", hint: "Main column — quick actions, CTAs, recent activity." },
        { key: "sidebar",      label: "Sidebar",      hint: "Right column — links, help, account snapshot." },
        { key: "footer",       label: "Footer",       hint: "Below-the-fold footer content." },
      ],
    },
    {
      key: "login",
      label: "Sign-in page",
      slots: [
        { key: "above_form", label: "Above sign-in form", hint: "Pitch or trust copy above the form." },
        { key: "below_form", label: "Below sign-in form", hint: "Support contact or company links." },
      ],
    },
    {
      key: "profile",
      label: "My account / profile",
      slots: [
        { key: "top_banner", label: "Top banner", hint: "Reminders, plan upsell, or announcements." },
        { key: "sidebar",    label: "Sidebar",    hint: "Help links beside the profile form." },
      ],
    },
  ],
  crew: [
    {
      key: "dashboard",
      label: "Crew dashboard",
      slots: [
        { key: "top_banner", label: "Top banner",    hint: "Shift notes, weather, or motivational copy." },
        { key: "primary",    label: "Job board",     hint: "Above/below the live job feed." },
        { key: "sidebar",    label: "Sidebar",       hint: "Links, supply requests, time-off shortcuts." },
      ],
    },
    {
      key: "profile",
      label: "Worker profile",
      slots: [
        { key: "top_banner", label: "Top banner", hint: "HR announcements." },
        { key: "sidebar",    label: "Sidebar",    hint: "Quick links beside the profile form." },
      ],
    },
  ],
  booking: [
    {
      key: "landing",
      label: "Booking page",
      slots: [
        { key: "above_form", label: "Above booking form", hint: "Headline + value props." },
        { key: "below_form", label: "Below booking form", hint: "Reassurance, testimonials, FAQ links." },
      ],
    },
  ],
};

const BLOCK_LABEL: Record<BlockKind, string> = {
  announcement_banner: "Announcement banner",
  cta_card: "Call-to-action card",
  quick_actions: "Quick actions",
  recent_activity: "Recent activity",
  links_list: "Links list",
  embed_html: "Custom HTML (Pro+)",
};

const BLOCK_ICON: Record<BlockKind, typeof Megaphone> = {
  announcement_banner: Megaphone,
  cta_card: MousePointerClick,
  quick_actions: Zap,
  recent_activity: Clock,
  links_list: LinkIcon,
  embed_html: Code2,
};

function defaultConfigFor(kind: BlockKind): BlockConfig {
  switch (kind) {
    case "announcement_banner": return { headline: "Welcome!", body: "", dismissible: true };
    case "cta_card":            return { headline: "Get started", cta_text: "Continue", cta_route: "/" };
    case "quick_actions":       return { actions: [{ label: "New job", route: "/jobs/new", icon: "plus" }] };
    case "recent_activity":     return { limit: 5 };
    case "links_list":          return { links: [{ label: "Help center", url: "https://" }] };
    case "embed_html":          return { html: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────

interface Props {
  portalKind: PortalKind;
  /**
   * Accent color from the parent modal so save/publish buttons match the
   * surrounding tab visuals. Customer = navy, crew = yellow.
   */
  accent: string;
  /** Notifies the hub page that something persisted (refreshes status). */
  onSaved: () => void;
}

export function PortalLayoutTab({ portalKind, accent, onSaved }: Props) {
  const { get, patch, post, ready } = useOliverApi();

  const pages = PAGE_SLOTS[portalKind] || [];
  const [pageKey, setPageKey] = useState<string>(pages[0]?.key || "dashboard");
  const [layout, setLayout] = useState<LayoutResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Track unsaved edits so the Save button is meaningful (and so Publish
  // can warn if there are unsaved changes).
  const [dirty, setDirty] = useState(false);
  // "Add block" picker — slot key being added to (null = closed).
  const [addingToSlot, setAddingToSlot] = useState<string | null>(null);
  // Preview pane (Phase 1: simple mock; Phase 2 will wire the SWA iframe).
  const [showPreview, setShowPreview] = useState(false);

  const pageDef = useMemo(() => pages.find((p) => p.key === pageKey) || pages[0], [pages, pageKey]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setLoadError(null);
    try {
      const r = await get<LayoutResponse>(`/portal-layout?kind=${portalKind}&page=${pageKey}`);
      setLayout(r);
      setDirty(false);
    } catch (err) {
      setLoadError((err as Error).message || "Failed to load layout.");
    } finally {
      setLoading(false);
    }
  }, [get, ready, portalKind, pageKey]);

  useEffect(() => { load(); }, [load]);

  // ─── Slot mutators (all operate on layout.slots; mark dirty) ──────────
  const setSlots = (next: Slots) => {
    if (!layout) return;
    setLayout({ ...layout, slots: next });
    setDirty(true);
  };

  const addBlock = (slot: string, kind: BlockKind) => {
    if (!layout) return;
    const next: Slots = { ...layout.slots };
    next[slot] = [...(next[slot] || []), { block_kind: kind, config: defaultConfigFor(kind) }];
    setSlots(next);
    setAddingToSlot(null);
  };

  const deleteBlock = (slot: string, idx: number) => {
    if (!layout) return;
    const blocks = (layout.slots[slot] || []).slice();
    blocks.splice(idx, 1);
    setSlots({ ...layout.slots, [slot]: blocks });
  };

  const moveBlock = (slot: string, idx: number, dir: -1 | 1) => {
    if (!layout) return;
    const blocks = (layout.slots[slot] || []).slice();
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    setSlots({ ...layout.slots, [slot]: blocks });
  };

  const updateBlockConfig = (slot: string, idx: number, config: BlockConfig) => {
    if (!layout) return;
    const blocks = (layout.slots[slot] || []).slice();
    blocks[idx] = { ...blocks[idx], config };
    setSlots({ ...layout.slots, [slot]: blocks });
  };

  // ─── Persist ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!layout) return;
    setSaving(true); setMsg(null);
    try {
      const r = await patch<LayoutResponse>(`/portal-layout/${layout.layout_id}`, { slots: layout.slots });
      setLayout((prev) => prev ? { ...prev, ...r } : r);
      setDirty(false);
      setMsg("Saved as draft.");
      setTimeout(() => setMsg(null), 3000);
      onSaved();
    } catch (e) {
      // Validation errors come back as 400 with message like
      // "invalid_slots: tier_required:pro@primary[2]" — surface verbatim.
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!layout) return;
    if (dirty) {
      if (!window.confirm("You have unsaved edits. Publish will only push your last saved draft. Save first?")) return;
    } else if (!window.confirm("Publish this layout to your live portal? Customers will see it on next load.")) {
      return;
    }
    setPublishing(true); setMsg(null);
    try {
      const r = await post<{ layout_id: string; is_published: boolean; updated_at: string }>(
        `/portal-layout/${layout.layout_id}/publish`
      );
      setLayout((prev) => prev ? { ...prev, is_published: r.is_published, updated_at: r.updated_at } : prev);
      setMsg("Published.");
      setTimeout(() => setMsg(null), 3000);
      onSaved();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    if (!layout) return;
    if (!window.confirm("Unpublish? Customers will revert to the default layout until you publish again.")) return;
    setPublishing(true); setMsg(null);
    try {
      const r = await post<{ layout_id: string; is_published: boolean; updated_at: string }>(
        `/portal-layout/${layout.layout_id}/unpublish`
      );
      setLayout((prev) => prev ? { ...prev, is_published: r.is_published, updated_at: r.updated_at } : prev);
      setMsg("Unpublished.");
      setTimeout(() => setMsg(null), 3000);
      onSaved();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setPublishing(false);
    }
  };

  const resetSlot = (slot: string) => {
    if (!layout) return;
    if (!window.confirm(`Remove all blocks from "${slot}"? You'll still need to Save to persist.`)) return;
    setSlots({ ...layout.slots, [slot]: [] });
  };

  if (loading) return <div className="text-xs text-slate-500">Loading layout…</div>;
  if (loadError) return <div className="text-xs text-rose-700">Couldn't load layout: {loadError}</div>;
  if (!layout || !pageDef) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="h-4 w-4" /> Page layout
          </h3>
          <p className="text-xs text-slate-600">
            Drop blocks into pre-defined slots on each page. Backend whitelists block kinds — your
            customers can't see arbitrary code, and you can't accidentally break the React app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border ${
              layout.is_published
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {layout.is_published ? "Live" : "Draft"}
          </span>
          {dirty && (
            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase">
              Unsaved
            </span>
          )}
        </div>
      </div>

      {/* Page picker — tabs across the top */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-200 pb-2">
        {pages.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              if (dirty && !window.confirm("Switch pages? Unsaved edits on this page will be lost.")) return;
              setPageKey(p.key);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              pageKey === p.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-3 w-3" /> {showPreview ? "Hide preview" : "Preview"}
          </button>
        </div>
      </div>

      {/* Slot list (left) + optional preview (right) */}
      <div className={`grid gap-3 ${showPreview ? "grid-cols-1 lg:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>
        <div className="space-y-3">
          {pageDef.slots.map((slot) => (
            <SlotCard
              key={slot.key}
              slot={slot}
              blocks={layout.slots[slot.key] || []}
              allowedKinds={layout.allowed_block_kinds}
              embedUnlocked={layout.embed_html_unlocked}
              accent={accent}
              isAdding={addingToSlot === slot.key}
              onOpenAdd={() => setAddingToSlot(slot.key)}
              onCloseAdd={() => setAddingToSlot(null)}
              onAdd={(kind) => addBlock(slot.key, kind)}
              onDelete={(idx) => deleteBlock(slot.key, idx)}
              onMove={(idx, dir) => moveBlock(slot.key, idx, dir)}
              onUpdateConfig={(idx, cfg) => updateBlockConfig(slot.key, idx, cfg)}
              onClear={() => resetSlot(slot.key)}
            />
          ))}
        </div>

        {showPreview && (
          <PreviewPane portalKind={portalKind} pageDef={pageDef} slots={layout.slots} />
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        {msg && <span className="text-xs text-slate-700">{msg}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save draft"}
          </button>
          {layout.is_published ? (
            <button
              type="button"
              onClick={unpublish}
              disabled={publishing}
              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" /> {publishing ? "Unpublishing…" : "Unpublish"}
            </button>
          ) : (
            <button
              type="button"
              onClick={publish}
              disabled={publishing}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}
            >
              <Send className="h-3 w-3" /> {publishing ? "Publishing…" : "Publish to live portal"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SlotCard — one slot row with its blocks + add-block picker.
// ─────────────────────────────────────────────────────────────────────────

function SlotCard({
  slot, blocks, allowedKinds, embedUnlocked, accent,
  isAdding, onOpenAdd, onCloseAdd, onAdd,
  onDelete, onMove, onUpdateConfig, onClear,
}: {
  slot: { key: string; label: string; hint: string };
  blocks: Block[];
  allowedKinds: BlockKind[];
  embedUnlocked: boolean;
  accent: string;
  isAdding: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (kind: BlockKind) => void;
  onDelete: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onUpdateConfig: (idx: number, cfg: BlockConfig) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <div className="text-xs font-bold text-slate-900">{slot.label}</div>
          <div className="text-[10px] text-slate-500">{slot.hint}</div>
        </div>
        <div className="flex items-center gap-2">
          {blocks.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] text-slate-500 hover:text-rose-600"
              title="Remove all blocks from this slot"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAdd}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white"
            style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}
          >
            <Plus className="h-3 w-3" /> Add block
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {blocks.length === 0 && !isAdding && (
          <div className="text-[11px] text-slate-400 italic text-center py-2">No blocks yet — click "Add block" above.</div>
        )}

        {blocks.map((b, idx) => (
          <BlockRow
            key={`${slot.key}-${idx}`}
            block={b}
            onDelete={() => onDelete(idx)}
            onMoveUp={() => onMove(idx, -1)}
            onMoveDown={() => onMove(idx, 1)}
            onUpdateConfig={(cfg) => onUpdateConfig(idx, cfg)}
            canMoveUp={idx > 0}
            canMoveDown={idx < blocks.length - 1}
          />
        ))}

        {isAdding && (
          <BlockKindPicker
            allowedKinds={allowedKinds}
            embedUnlocked={embedUnlocked}
            onPick={(kind) => onAdd(kind)}
            onCancel={onCloseAdd}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BlockRow — single block with inline edit form + reorder controls.
// ─────────────────────────────────────────────────────────────────────────

function BlockRow({
  block, onDelete, onMoveUp, onMoveDown, onUpdateConfig, canMoveUp, canMoveDown,
}: {
  block: Block;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateConfig: (cfg: BlockConfig) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = BLOCK_ICON[block.block_kind];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <div className="text-xs font-semibold text-slate-800 flex-1">{BLOCK_LABEL[block.block_kind]}</div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-slate-500 hover:text-slate-900"
        >
          {expanded ? "Collapse" : "Edit"}
        </button>
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp} className="text-slate-400 hover:text-slate-900 disabled:opacity-30">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown} className="text-slate-400 hover:text-slate-900 disabled:opacity-30">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="text-rose-400 hover:text-rose-700">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-slate-200 bg-white p-3">
          <BlockConfigForm block={block} onChange={onUpdateConfig} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BlockKindPicker — small chooser shown when "Add block" is clicked.
// Locked kinds (above tenant's tier) appear greyed with a tooltip.
// ─────────────────────────────────────────────────────────────────────────

function BlockKindPicker({
  allowedKinds, embedUnlocked, onPick, onCancel,
}: {
  allowedKinds: BlockKind[];
  embedUnlocked: boolean;
  onPick: (kind: BlockKind) => void;
  onCancel: () => void;
}) {
  // Always show all 6 kinds; lock the ones the tenant can't use.
  const allKinds: BlockKind[] = [
    "announcement_banner", "cta_card", "quick_actions",
    "recent_activity", "links_list", "embed_html",
  ];
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pick a block</div>
        <button type="button" onClick={onCancel} className="text-[10px] text-slate-500 hover:text-slate-900">Cancel</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {allKinds.map((kind) => {
          const Icon = BLOCK_ICON[kind];
          const allowed = allowedKinds.includes(kind);
          const isEmbed = kind === "embed_html";
          const locked = isEmbed ? !embedUnlocked : !allowed;
          return (
            <button
              key={kind}
              type="button"
              disabled={locked}
              onClick={() => onPick(kind)}
              title={locked ? "Requires a higher tier" : ""}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-left ${
                locked
                  ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                  : "border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
              }`}
            >
              {locked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span className="truncate">{BLOCK_LABEL[kind]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BlockConfigForm — per-kind inline editor. Each branch builds a tiny form
// scoped to the block's config shape. New block kinds need an entry here +
// in the backend whitelist + in PAGE_SLOTS (if exposed to new pages).
// ─────────────────────────────────────────────────────────────────────────

function BlockConfigForm({ block, onChange }: { block: Block; onChange: (cfg: BlockConfig) => void }) {
  const cfg = block.config || {};

  const setField = (key: string, value: unknown) => onChange({ ...cfg, [key]: value });

  switch (block.block_kind) {
    case "announcement_banner": {
      const headline = (cfg.headline as string) || "";
      const body = (cfg.body as string) || "";
      const dismissible = Boolean(cfg.dismissible);
      return (
        <div className="space-y-2">
          <LabeledInput label="Headline" value={headline} maxLen={200} onChange={(v) => setField("headline", v)} />
          <LabeledTextarea label="Body" value={body} maxLen={1000} onChange={(v) => setField("body", v)} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={dismissible} onChange={(e) => setField("dismissible", e.target.checked)} />
            <span>Customer can dismiss this banner</span>
          </label>
        </div>
      );
    }
    case "cta_card": {
      return (
        <div className="space-y-2">
          <LabeledInput label="Headline" value={(cfg.headline as string) || ""} maxLen={200} onChange={(v) => setField("headline", v)} />
          <LabeledInput label="Button text" value={(cfg.cta_text as string) || ""} maxLen={80} onChange={(v) => setField("cta_text", v)} />
          <LabeledInput label="Button route (e.g. /jobs/new)" value={(cfg.cta_route as string) || ""} maxLen={200} onChange={(v) => setField("cta_route", v)} />
        </div>
      );
    }
    case "quick_actions": {
      const actions = Array.isArray(cfg.actions) ? (cfg.actions as Array<{ label?: string; route?: string; icon?: string }>) : [];
      const update = (idx: number, key: string, value: string) => {
        const next = actions.slice();
        next[idx] = { ...next[idx], [key]: value };
        setField("actions", next);
      };
      const remove = (idx: number) => {
        const next = actions.slice();
        next.splice(idx, 1);
        setField("actions", next);
      };
      const add = () => {
        if (actions.length >= 6) return;
        setField("actions", [...actions, { label: "", route: "/", icon: "" }]);
      };
      return (
        <div className="space-y-2">
          {actions.length === 0 && <div className="text-[11px] text-slate-400 italic">No actions yet.</div>}
          {actions.map((a, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1 items-center">
              <input className="text-xs px-2 py-1 rounded border border-slate-300" value={a.label || ""} maxLength={80} placeholder="Label" onChange={(e) => update(idx, "label", e.target.value)} />
              <input className="text-xs px-2 py-1 rounded border border-slate-300 font-mono" value={a.route || ""} maxLength={200} placeholder="/route" onChange={(e) => update(idx, "route", e.target.value)} />
              <input className="text-xs px-2 py-1 rounded border border-slate-300 w-16" value={a.icon || ""} maxLength={40} placeholder="icon" onChange={(e) => update(idx, "icon", e.target.value)} />
              <button type="button" onClick={() => remove(idx)} className="text-rose-400 hover:text-rose-700"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <button type="button" onClick={add} disabled={actions.length >= 6} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-50">
            <Plus className="h-3 w-3" /> Add action ({actions.length}/6)
          </button>
        </div>
      );
    }
    case "recent_activity": {
      const limit = Number(cfg.limit) || 5;
      return (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Number of items to show</span>
            <input type="number" min={1} max={20} value={limit} onChange={(e) => setField("limit", Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
          <div className="text-[10px] text-slate-500">Pulled from the customer's recent jobs / invoices / messages.</div>
        </div>
      );
    }
    case "links_list": {
      const links = Array.isArray(cfg.links) ? (cfg.links as Array<{ label?: string; url?: string }>) : [];
      const update = (idx: number, key: string, value: string) => {
        const next = links.slice();
        next[idx] = { ...next[idx], [key]: value };
        setField("links", next);
      };
      const remove = (idx: number) => {
        const next = links.slice();
        next.splice(idx, 1);
        setField("links", next);
      };
      const add = () => {
        if (links.length >= 20) return;
        setField("links", [...links, { label: "", url: "https://" }]);
      };
      return (
        <div className="space-y-2">
          {links.length === 0 && <div className="text-[11px] text-slate-400 italic">No links yet.</div>}
          {links.map((l, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
              <input className="text-xs px-2 py-1 rounded border border-slate-300" value={l.label || ""} maxLength={80} placeholder="Label" onChange={(e) => update(idx, "label", e.target.value)} />
              <input className="text-xs px-2 py-1 rounded border border-slate-300 font-mono" value={l.url || ""} maxLength={400} placeholder="https://…" onChange={(e) => update(idx, "url", e.target.value)} />
              <button type="button" onClick={() => remove(idx)} className="text-rose-400 hover:text-rose-700"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <button type="button" onClick={add} disabled={links.length >= 20} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-50">
            <Plus className="h-3 w-3" /> Add link ({links.length}/20)
          </button>
        </div>
      );
    }
    case "embed_html": {
      const html = (cfg.html as string) || "";
      return (
        <div className="space-y-2">
          <LabeledTextarea
            label="HTML (sanitized server-side — script/on*/iframe stripped)"
            value={html}
            maxLen={40000}
            rows={6}
            mono
            onChange={(v) => setField("html", v)}
          />
          <div className="text-[10px] text-slate-500">
            <strong>Pro+ feature.</strong> Server-side sanitizer removes scripts, on* handlers, iframes,
            and javascript: URLs. If your snippet relies on JavaScript it won't work.
          </div>
        </div>
      );
    }
    default:
      return <div className="text-xs text-slate-500">Unknown block kind.</div>;
  }
}

function LabeledInput({
  label, value, onChange, maxLen,
}: { label: string; value: string; onChange: (v: string) => void; maxLen?: number }) {
  return (
    <label className="block text-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={maxLen}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300"
      />
    </label>
  );
}

function LabeledTextarea({
  label, value, onChange, maxLen, rows = 3, mono = false,
}: { label: string; value: string; onChange: (v: string) => void; maxLen?: number; rows?: number; mono?: boolean }) {
  return (
    <label className="block text-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLen}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PreviewPane — Phase 1 lo-fi mock. We render a stack of slot labels +
// block badges so the tenant has visual confirmation of what they've built
// without needing a full SWA iframe wire-up. Phase 2 swaps this for an
// iframe of the actual customer portal.
// ─────────────────────────────────────────────────────────────────────────

function PreviewPane({
  portalKind, pageDef, slots,
}: {
  portalKind: PortalKind;
  pageDef: { key: string; label: string; slots: Array<{ key: string; label: string }> };
  slots: Slots;
}) {
  return (
    <div className="lg:sticky lg:top-2 self-start">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
        Preview · {portalKind} · {pageDef.label}
      </div>
      <div className="rounded-md border border-slate-200 bg-white shadow-sm p-2 space-y-2 text-[11px]">
        {pageDef.slots.map((s) => (
          <div key={s.key} className="rounded border border-dashed border-slate-200 p-2">
            <div className="text-[9px] uppercase font-bold tracking-wider text-slate-500 mb-1">{s.label}</div>
            {(slots[s.key] || []).length === 0 ? (
              <div className="text-[10px] italic text-slate-400">empty</div>
            ) : (
              <div className="space-y-1">
                {(slots[s.key] || []).map((b, idx) => {
                  const Icon = BLOCK_ICON[b.block_kind];
                  return (
                    <div key={idx} className="flex items-center gap-1.5 rounded bg-slate-100 px-1.5 py-0.5">
                      <Icon className="h-3 w-3 text-slate-600" />
                      <span className="text-[10px] text-slate-700 truncate">{BLOCK_LABEL[b.block_kind]}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-400 mt-1 italic">
        Phase 1 mock. Phase 2 will replace this with a live iframe of your portal.
      </div>
    </div>
  );
}

export default PortalLayoutTab;
