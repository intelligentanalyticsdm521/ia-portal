// TemplateStudioPage — My Brand · Template Studio library.
//
// Canonical SPARK-shell library page (skeleton rebuild 2026-07-21): the
// template/design gallery is a card grid inside SparkPageShell; the actual
// Fabric.js canvas editor lives in TemplateStudioEditorModal (IadmModal
// size "info"), launched by clicking a card or "+ New design". This file
// owns the fetch-once gallery load, client-side filtering, and modal
// open-state — nothing else.
//
// API surface (LUMEN-API My Brand, wave 1):
//   GET /api/v1/my-brand/templates
//   GET /api/v1/my-brand/designs?limit=50
// (Per-record GET / POST / PUT / export live in the editor modal.)

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, FilePlus, LayoutTemplate, PenTool, Plus } from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";
import { useLumenApi } from "../../hooks/useLumenApi";
import {
  TemplateStudioEditorModal,
  type DesignDto,
  type TemplateDto,
} from "../../components/myBrand/TemplateStudioEditorModal";

type GalleryFilter = "all" | "system" | "brand" | "mine";

const FILTER_SEGMENTS: Array<{ key: GalleryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "system", label: "System templates" },
  { key: "brand", label: "Brand templates" },
  { key: "mine", label: "My designs" },
];

interface GalleryCard {
  key: string;
  kind: "template" | "design";
  name: string;
  secondary: string;
  isSystem: boolean;
  updatedAt: string;
  templateId: string | null;
  designId: string | null;
}

export function TemplateStudioPage() {
  // ALL hooks run unconditionally — the tier-gate return lives BELOW them.
  // (The old page returned before ~20 hooks; when gate.ready flipped after
  // mount the hook count changed between renders and React crashed.)
  const gate = useMyBrandTier();
  const { get, ready } = useLumenApi();

  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [designs, setDesigns] = useState<DesignDto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  // Toolbar facets — client-side only (fetch once, filter in a useMemo).
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [search, setSearch] = useState("");

  // Modal open-state — plain useState, modals mounted at the bottom.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editor, setEditor] = useState<{ designId: string | null; templateId: string | null } | null>(null);

  // ── Load gallery once, gated on `ready`. `silent` refreshes (editor
  // onChanged) skip the loading/error flips so the shell never unmounts an
  // open editor modal mid-session; a stale list beats a nuked canvas.
  const loadGallery = useCallback(async (opts?: { silent?: boolean }) => {
    if (!ready) return;
    if (!opts?.silent) {
      setGalleryLoading(true);
      setGalleryError(null);
    }
    try {
      const [tplRes, dRes] = await Promise.all([
        get<TemplateDto[]>("/api/v1/my-brand/templates"),
        get<DesignDto[]>("/api/v1/my-brand/designs?limit=50"),
      ]);
      // The backend returns the array inside { data }, which lumenApi.ts
      // auto-unwraps to the array.
      setTemplates(Array.isArray(tplRes) ? tplRes : []);
      setDesigns(Array.isArray(dRes) ? dRes : []);
    } catch (e) {
      if (!opts?.silent) setGalleryError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!opts?.silent) setGalleryLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void loadGallery(); }, [loadGallery]);

  // ── Client-side filtering + sort (canon: one useMemo over the fetched
  // lists, name-search lowercased .includes, updated_at desc). ─────────────
  const cards = useMemo<GalleryCard[]>(() => {
    const tpl: GalleryCard[] = templates.map((t) => ({
      key: `tpl-${t.template_id}`,
      kind: "template",
      name: t.name,
      secondary: t.kind,
      isSystem: t.is_system,
      updatedAt: t.updated_at,
      templateId: t.template_id,
      designId: null,
    }));
    const mine: GalleryCard[] = designs.map((d) => ({
      key: `des-${d.design_id}`,
      kind: "design",
      name: d.name || "Untitled design",
      secondary: `Updated ${new Date(d.updated_at).toLocaleDateString()}`,
      isSystem: false,
      updatedAt: d.updated_at,
      templateId: null,
      designId: d.design_id,
    }));
    let list: GalleryCard[];
    if (filter === "system") list = tpl.filter((c) => c.isSystem);
    else if (filter === "brand") list = tpl.filter((c) => !c.isSystem);
    else if (filter === "mine") list = mine;
    else list = [...mine, ...tpl];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [templates, designs, filter, search]);

  // ── Tier gate — Template Studio requires Standard+. Rendered through the
  // shell so the page header survives; backend mirrors this with
  // requireTier("template_studio") on every templateStudio endpoint. ────────
  if (gate.ready && !gate.meets("template_studio")) {
    return (
      <SparkPageShell
        title="Template Studio"
        subtitle="Design on-brand graphics from reusable templates"
      >
        <MyBrandUpgradeGate
          featureName="Template Studio"
          requiredTier={gate.requiredTier("template_studio")}
          currentTier={gate.tier}
        />
      </SparkPageShell>
    );
  }

  return (
    <SparkPageShell
      title="Template Studio"
      subtitle="Design on-brand graphics from reusable templates"
      help="Click a template or a saved design to open it in the editor, or click + New design to start from a blank canvas. Finished designs export to the Asset Library or go straight to the social composer."
      actions={
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New design
        </button>
      }
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {FILTER_SEGMENTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setFilter(s.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filter === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 w-44"
          />
        </div>
      }
      loading={galleryLoading}
      error={galleryError}
    >
      {/* Grid — library item cards are whole-card buttons opening the editor. */}
      {cards.length === 0 && !galleryLoading ? (
        <EmptyState onNew={() => setPickerOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setEditor({ designId: card.designId, templateId: card.templateId })}
              className="group text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div
                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    card.kind === "template" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {card.kind === "template" ? <LayoutTemplate className="h-3 w-3" /> : <PenTool className="h-3 w-3" />}
                  {card.kind}
                </div>
                {card.isSystem && (
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">System</span>
                )}
              </div>
              <div className="font-semibold text-slate-900 truncate mb-0.5">{card.name}</div>
              <div className="text-xs text-slate-600 truncate mb-2 capitalize">{card.secondary}</div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span>{card.kind === "template" ? "Opens as a new design" : "Continue editing"}</span>
                <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[#EF6C33]" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step-1 picker — IadmModal size="nav" (F-107: "what do you want to
          create?" choice modals are nav-sized). */}
      {pickerOpen && (
        <IadmModal
          open
          onClose={() => setPickerOpen(false)}
          product="spark"
          eyebrow="MY BRAND · TEMPLATE STUDIO"
          title="New design"
          subtitle="How do you want to start?"
          size="nav"
        >
          <div className="grid grid-cols-2 gap-3 p-5">
            <button
              type="button"
              onClick={() => { setPickerOpen(false); setEditor({ designId: null, templateId: null }); }}
              className="group flex flex-col items-start gap-2 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33]">
                <FilePlus className="h-5 w-5" />
              </div>
              <div className="font-semibold text-slate-900">Blank canvas</div>
              <div className="text-xs text-slate-500 leading-snug">Start from an empty 1080×1080 canvas.</div>
            </button>
            <button
              type="button"
              onClick={() => { setPickerOpen(false); setFilter("system"); }}
              className="group flex flex-col items-start gap-2 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <LayoutTemplate className="h-5 w-5" />
              </div>
              <div className="font-semibold text-slate-900">From a template</div>
              <div className="text-xs text-slate-500 leading-snug">Browse the templates below and click one to open it.</div>
            </button>
          </div>
        </IadmModal>
      )}

      {/* Editor modal — CRUD contract { open, onClose, designId, templateId,
          onChanged }. onChanged silently refreshes the gallery; the editor
          stays open because design work is iterative (see modal docblock). */}
      {editor && (
        <TemplateStudioEditorModal
          open
          designId={editor.designId}
          templateId={editor.templateId}
          onClose={() => setEditor(null)}
          onChanged={() => { void loadGallery({ silent: true }); }}
        />
      )}
    </SparkPageShell>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <LayoutTemplate className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">No templates or designs yet</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        System templates appear here once seeded. Start a blank design and it will show up under My designs after your first save.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
      >
        <Plus className="h-3.5 w-3.5" /> New design
      </button>
    </div>
  );
}

export default TemplateStudioPage;
