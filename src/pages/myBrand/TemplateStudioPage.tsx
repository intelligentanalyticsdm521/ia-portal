// TemplateStudioPage — My Brand · Design Studio library.
//
// The library page: a card grid of what the business has made and what they
// can start from. The STUDIO itself is the shared builder —
// builder/adapters/mybrand/StudioBuilder.tsx — opened from here.
//
// 2026-09-16 (BUILDER_PLATFORM_SCOPE_2026-09-15 §4 step 6): the studio moved
// onto the shared shell. Two things changed on this page and nothing else:
//
//   · TemplateStudioEditorModal is GONE (deleted, not deprecated) and its
//     replacement takes the same four props, so the route and every entry
//     point are untouched.
//   · The "What are you making?" purpose picker is GONE too. It asked the
//     question the template gallery INSIDE the builder now answers with a
//     picture of each template already in the business's brand (§7, the
//     template principle: never a blank page). Two front doors asking the same
//     question, one of them with previews, is the duplication this scope
//     exists to remove.
//
// API surface (LUMEN-API My Brand):
//   GET    /api/v1/my-brand/templates
//   GET    /api/v1/my-brand/designs?limit=50
//   DELETE /api/v1/my-brand/designs/:id
// (Per-record GET / POST / PUT / export live in the builder.)

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, LayoutTemplate, PenTool, Plus, Trash2 } from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useFeatureGate } from "../../hooks/useFeatureGate";
import { useLumenApi } from "../../hooks/useLumenApi";
import { StudioBuilder } from "../../builder/adapters/mybrand/StudioBuilder";
import type { DesignDto, TemplateDto } from "../../builder/adapters/mybrand/scene";
import { designKindLabel } from "../../builder/adapters/mybrand/templates";

type GalleryFilter = "all" | "system" | "brand" | "mine";

const FILTER_SEGMENTS: Array<{ key: GalleryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "system", label: "Starter templates" },
  { key: "brand", label: "Your templates" },
  { key: "mine", label: "Your designs" },
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
  const gate = useFeatureGate();
  const { get, del, ready } = useLumenApi();

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

  const [studio, setStudio] = useState<{
    designId: string | null;
    templateId: string | null;
    startOnGallery?: boolean;
  } | null>(null);

  // Load once, gated on `ready`. `silent` refreshes (the builder saved) skip
  // the loading/error flips so the shell never unmounts an open studio
  // mid-session; a stale list beats a nuked canvas.
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

  const cards = useMemo<GalleryCard[]>(() => {
    const tpl: GalleryCard[] = templates.map((t) => ({
      key: `tpl-${t.template_id}`,
      kind: "template",
      name: t.name,
      // D-32: "Instagram post", never the stored enum "Ig_post".
      secondary: designKindLabel(t.kind),
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

  // Tier gate — the studio requires Standard+. Rendered through the shell so
  // the page header survives; the backend mirrors this with
  // requireTier("template_studio") on every templateStudio endpoint.
  if (gate.locked("my_brand_templates")) {
    return (
      <SparkPageShell
        title="Design Studio"
        subtitle="Create social posts, flyers, infographics, logos, and icons — already in your brand"
      >
        <MyBrandUpgradeGate
          featureName="Design Studio"
          needs={gate.needs("my_brand_templates")}
        />
      </SparkPageShell>
    );
  }

  return (
    <SparkPageShell
      title="Design Studio"
      subtitle="Create social posts, flyers, infographics, logos, and icons — already in your brand"
      help="Click + New design and pick what you are making — the studio opens with that template already in your colours, your fonts and your logo. Change the words, then download it or send it straight to a post."
      actions={
        <button
          type="button"
          onClick={() => setStudio({ designId: null, templateId: null, startOnGallery: true })}
          title="Start something new — the studio opens with templates already in your brand"
          className="inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
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
                title={`Show ${s.label.toLowerCase()}`}
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
            title="Search your designs and templates by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
      }
      loading={galleryLoading}
      error={galleryError}
    >
      {cards.length === 0 && !galleryLoading ? (
        <EmptyState onNew={() => setStudio({ designId: null, templateId: null, startOnGallery: true })} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setStudio({ designId: card.designId, templateId: card.templateId })}
              title={card.kind === "template"
                ? `${card.name} — opens as a new design, already in your brand`
                : `${card.name} — carry on editing`}
              className="group relative rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    card.kind === "template" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {card.kind === "template" ? <LayoutTemplate className="h-3 w-3" /> : <PenTool className="h-3 w-3" />}
                  {card.kind}
                </div>
                {card.isSystem && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">Starter</span>
                )}
                {card.kind === "design" && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(card); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setConfirmDelete(card); } }}
                    title="Delete this design"
                    className="invisible rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 group-hover:visible"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="mb-0.5 truncate font-semibold text-slate-900">{card.name}</div>
              {/* No `capitalize`: the label is already written properly, and
                  CSS capitalisation is what turned "ig_post" into "Ig_post". */}
              <div className="mb-2 truncate text-xs text-slate-600">{card.secondary}</div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span>{card.kind === "template" ? "Opens as a new design" : "Continue editing"}</span>
                <ArrowRight className="ml-auto h-3 w-3 text-[#EF6C33] opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </button>
          ))}
        </div>
      )}

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
                title="Leave the design where it is"
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Keep design
              </button>
              <button
                type="button"
                onClick={() => void performDelete()}
                disabled={deleteBusy}
                title="Remove this design permanently"
                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete design"}
              </button>
            </>
          }
        >
          <div className="p-5 text-sm text-slate-700">
            “{confirmDelete.name}” will be removed permanently. Anything you already exported stays in your Media Library.
            {deleteError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{deleteError}</div>
            )}
          </div>
        </IadmModal>
      )}

      {studio && (
        <StudioBuilder
          open
          designId={studio.designId}
          templateId={studio.templateId}
          startOnGallery={studio.startOnGallery}
          onClose={() => setStudio(null)}
          onChanged={() => { void loadGallery({ silent: true }); }}
        />
      )}
    </SparkPageShell>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <LayoutTemplate className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">Nothing here yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Start a new design and pick what you are making — the studio opens with a template already in your
        colours, your fonts and your logo.
      </p>
      <button
        type="button"
        onClick={onNew}
        title="Start something new"
        className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
      >
        <Plus className="h-3.5 w-3.5" /> New design
      </button>
    </div>
  );
}

export default TemplateStudioPage;
