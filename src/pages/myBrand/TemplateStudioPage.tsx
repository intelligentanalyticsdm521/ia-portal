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
import {
  ArrowRight, Award, BadgePercent, FilePlus, Image as ImageIcon,
  LayoutTemplate, Mail, Megaphone, PenTool, PieChart, Plus, Smartphone,
  Square, Store, Trash2,
} from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";
import { useLumenApi } from "../../hooks/useLumenApi";
import {
  TemplateStudioEditorModal,
  type CanvasDoc,
  type DesignDto,
  type TemplateDto,
} from "../../components/myBrand/TemplateStudioEditorModal";

// ── Purpose-first "What are you making?" (Brandon 2026-07-22: the studio
// exists so a business owner can make social content, flyers, infographics,
// logos, icons — the front door should ask for the JOB, not a blank file).
// Each purpose carries its canvas + which template kinds count as starters.
interface Purpose {
  key: string;
  label: string;
  blurb: string;
  icon: typeof Megaphone;
  w: number;
  h: number;
  transparent?: boolean;
  templateKinds: string[];
}
const PURPOSES: Purpose[] = [
  { key: "social",  label: "Social post",   blurb: "Square post for FB / IG / LinkedIn", icon: Megaphone, w: 1080, h: 1080, templateKinds: ["ig_post", "fb_post", "li_post"] },
  { key: "story",   label: "Story",         blurb: "Full-screen 9:16 story",             icon: Smartphone, w: 1080, h: 1920, templateKinds: ["ig_story"] },
  { key: "logo",    label: "Logo",          blurb: "Transparent background, brand colors", icon: Award, w: 1024, h: 1024, transparent: true, templateKinds: ["logo"] },
  { key: "icon",    label: "Icon",          blurb: "App / favicon mark, transparent",    icon: Square, w: 512, h: 512, transparent: true, templateKinds: ["icon"] },
  { key: "infographic", label: "Infographic", blurb: "Numbers → chart in brand colors",  icon: PieChart, w: 1080, h: 1080, templateKinds: ["ig_post"] },
  { key: "flyer",   label: "Flyer",         blurb: "Print-ready letter flyer",           icon: BadgePercent, w: 1275, h: 1650, templateKinds: ["flyer"] },
  { key: "card",    label: "Business card", blurb: "Standard 3.5×2 card",                icon: Store, w: 1050, h: 600, templateKinds: ["business_card"] },
  { key: "email",   label: "Email header",  blurb: "Newsletter / campaign banner",       icon: Mail, w: 1200, h: 400, templateKinds: ["email_header"] },
  { key: "banner",  label: "Cover / banner", blurb: "FB cover · LinkedIn banner",        icon: ImageIcon, w: 1584, h: 396, templateKinds: ["fb_cover", "li_banner"] },
];

function canvasFor(p: Purpose): CanvasDoc {
  return {
    version: 1,
    width: p.w,
    height: p.h,
    background_color: p.transparent ? "transparent" : "#FFFFFF",
    layers: [],
  };
}

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
  const { get, del, ready } = useLumenApi();

  // Design delete — the gallery was un-cleanable (no DELETE existed).
  const [confirmDelete, setConfirmDelete] = useState<GalleryCard | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [designs, setDesigns] = useState<DesignDto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  // Toolbar facets — client-side only (fetch once, filter in a useMemo).
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [search, setSearch] = useState("");

  // Modal open-state — plain useState, modals mounted at the bottom.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Step 2 of the picker: a chosen purpose showing its starter templates.
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [editor, setEditor] = useState<{
    designId: string | null;
    templateId: string | null;
    initialCanvas?: CanvasDoc | null;
    initialName?: string;
  } | null>(null);

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

  const performDelete = useCallback(async () => {
    if (!confirmDelete?.designId) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await del(`/api/v1/my-brand/designs/${confirmDelete.designId}`);
      setConfirmDelete(null);
      await loadGallery({ silent: true });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }, [confirmDelete, del, loadGallery]);

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
        title="Design Studio"
        subtitle="Create social posts, flyers, infographics, logos, and icons — already in your brand"
      >
        <MyBrandUpgradeGate
          featureName="Design Studio"
          requiredTier={gate.requiredTier("template_studio")}
          currentTier={gate.tier}
        />
      </SparkPageShell>
    );
  }

  return (
    <SparkPageShell
      title="Design Studio"
      subtitle="Create social posts, flyers, infographics, logos, and icons — already in your brand"
      help="Click + New design and pick what you are making — social post, story, logo, icon, flyer, infographic, business card — and the canvas opens pre-sized in your brand colors. Finished designs export to the Asset Library or go straight to the social composer."
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
              className="group relative text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 transition-colors"
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
                {card.kind === "design" && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(card); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setConfirmDelete(card); } }}
                    title="Delete design"
                    className="invisible rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 group-hover:visible"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
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

      {/* Purpose-first picker — step 1 asks WHAT you're making, step 2 shows
          that purpose's starter templates + a right-sized blank canvas. */}
      {pickerOpen && (
        <IadmModal
          open
          onClose={() => { setPickerOpen(false); setPurpose(null); }}
          product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO"
          title={purpose ? purpose.label : "What are you making?"}
          subtitle={purpose
            ? "Start from a template already in your brand — or a blank canvas."
            : "Pick the job and the canvas comes pre-sized in your brand."}
          size="nav"
        >
          {!purpose ? (
            <div className="grid grid-cols-3 gap-2 p-5">
              {PURPOSES.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className="group flex flex-col items-start gap-1.5 rounded-lg border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                    <div className="text-[11px] leading-snug text-slate-500">{p.blurb}</div>
                    <div className="text-[10px] tabular-nums text-slate-400">
                      {p.w}×{p.h}{p.transparent ? " · transparent" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-5">
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false); setPurpose(null);
                    setEditor({
                      designId: null, templateId: null,
                      initialCanvas: canvasFor(purpose),
                      initialName: `New ${purpose.label.toLowerCase()}`,
                    });
                  }}
                  className="group flex items-center gap-3 rounded-lg border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33]">
                    <FilePlus className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Blank {purpose.label.toLowerCase()}</div>
                    <div className="text-[11px] text-slate-500">
                      {purpose.w}×{purpose.h}{purpose.transparent ? " · transparent background" : ""}
                    </div>
                  </div>
                </button>
                {templates
                  .filter((t) => purpose.templateKinds.includes(t.kind))
                  .map((t) => (
                    <button
                      key={t.template_id}
                      type="button"
                      onClick={() => {
                        setPickerOpen(false); setPurpose(null);
                        setEditor({ designId: null, templateId: t.template_id });
                      }}
                      className="group flex items-center gap-3 rounded-lg border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                        <LayoutTemplate className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-500">Opens as a new design, already in your brand colors</div>
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-[#EF6C33]" />
                    </button>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => setPurpose(null)}
                className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                ← All purposes
              </button>
            </div>
          )}
        </IadmModal>
      )}

      {/* Editor modal — CRUD contract { open, onClose, designId, templateId,
          onChanged }. onChanged silently refreshes the gallery; the editor
          stays open because design work is iterative (see modal docblock). */}
      {/* Delete-design confirm — replaces window.confirm per canon. */}
      {confirmDelete && (
        <IadmModal
          open
          onClose={() => { if (!deleteBusy) setConfirmDelete(null); }}
          product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO"
          title="Delete this design?"
          size="confirm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteBusy}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Keep design
              </button>
              <button
                type="button"
                onClick={() => void performDelete()}
                disabled={deleteBusy}
                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete design"}
              </button>
            </>
          }
        >
          <div className="p-5 text-sm text-slate-700">
            “{confirmDelete.name}” will be removed permanently. Exports it already
            produced stay in your Media Library.
            {deleteError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{deleteError}</div>
            )}
          </div>
        </IadmModal>
      )}

      {editor && (
        <TemplateStudioEditorModal
          open
          designId={editor.designId}
          templateId={editor.templateId}
          initialCanvas={editor.initialCanvas}
          initialName={editor.initialName}
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
