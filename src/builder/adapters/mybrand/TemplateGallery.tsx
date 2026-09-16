/**
 * builder/adapters/mybrand/TemplateGallery.tsx — the studio never opens blank.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, the template principle: "open with
 * pre-made sections and pre-made templates, never a blank page … templates are
 * guidelines: open one, adjust it, save as a new template."
 *
 * The same job builder/SectionGallery.tsx does for a document, done for a
 * square: pick what you are making, see it ALREADY in your brand, open it,
 * change the words. The preview is drawn from the real scene the template
 * builds, so the card is not a promise — it is the thing.
 */
import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { IadmModal } from "../../../components/IadmModal";
import {
  ICON_PATHS, resolveBrandTokens,
  type CanvasDoc, type ImageLayer, type ShapeLayer, type TextLayer,
} from "./scene";
import { PREMADE_GROUPS, premadeFor, type PremadeDesign } from "./templates";
import type { StudioBrand } from "./insert";

/** A template the business saved themselves, as LUMEN returns it. */
export interface SavedTemplate {
  template_id: string;
  name: string;
  kind: string;
  is_system: boolean;
  canvas: CanvasDoc | null;
}

export interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  brand: StudioBrand;
  /** The tenant's own saved templates plus the seeded system ones. */
  saved: SavedTemplate[];
  onPickPremade: (key: string, count?: number) => void;
  onPickSaved: (t: SavedTemplate) => void;
  /** Shown only when there is already something on the canvas to go back to. */
  onKeepEditing?: () => void;
}

export function TemplateGallery(p: TemplateGalleryProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<PremadeDesign["group"] | "all">("all");
  const [asking, setAsking] = useState<{ key: string; value: number } | null>(null);

  const premade = useMemo(() => premadeFor(query, group), [query, group]);
  const mine = useMemo(() => {
    const q = query.trim().toLowerCase();
    return p.saved.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [p.saved, query]);

  return (
    <IadmModal
      open={p.open}
      onClose={p.onClose}
      product="spark"
      eyebrow="MY BRAND · DESIGN STUDIO"
      title="What are you making?"
      subtitle="Every one of these opens already in your colours, your fonts and your logo. Change the words and it is yours."
      size="report"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["all", ...PREMADE_GROUPS] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                title={g === "all" ? "Show everything" : `Show only ${g.toLowerCase()}`}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  group === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {g === "all" ? "All" : g}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — try “story” or “card”"
              aria-label="Search templates"
              title="Search by name, by what it is for, or by size"
              className="w-56 rounded border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-slate-400 focus:outline-none"
            />
          </div>
          {p.onKeepEditing && (
            <button
              type="button"
              onClick={p.onKeepEditing}
              title="Go back to the design you already have open"
              className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Keep editing what I have
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mine.length > 0 && (
            <>
              <GroupHeading>Your templates</GroupHeading>
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {mine.map((t) => (
                  <button
                    key={t.template_id}
                    type="button"
                    onClick={() => p.onPickSaved(t)}
                    title={`${t.name} — opens as a new design, already in your brand`}
                    data-saved-template={t.template_id}
                    className="group rounded-lg border border-slate-200 bg-white p-2 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                  >
                    <ScenePreview scene={t.canvas} brand={p.brand} />
                    <div className="mt-2 truncate text-xs font-semibold text-slate-900">{t.name}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {t.is_system ? "Starter template" : "Saved by you"}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <GroupHeading>Start from one of these</GroupHeading>
          {premade.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
              Nothing matches “{query}”. Clear the search to see everything.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {premade.map((d) => (
                <div key={d.key}>
                  <button
                    type="button"
                    onClick={() => (d.count ? setAsking({ key: d.key, value: d.count.default }) : p.onPickPremade(d.key))}
                    title={`${d.label} — ${d.blurb} (${d.w}×${d.h})`}
                    data-premade={d.key}
                    className="group w-full rounded-lg border border-slate-200 bg-white p-2 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                  >
                    <ScenePreview scene={d.build(p.brand, d.count?.default)} brand={p.brand} />
                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-900">
                      {d.label}
                      {d.count && <Sparkles className="h-3 w-3 text-[#EF6C33]" />}
                    </div>
                    <div className="line-clamp-2 text-[10px] leading-snug text-slate-500">{d.blurb}</div>
                    <div className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                      {d.w}×{d.h}{d.transparent ? " · see-through" : ""}
                    </div>
                  </button>

                  {asking?.key === d.key && d.count && (
                    <div className="mt-1 rounded border border-slate-300 bg-slate-50 p-2">
                      <div className="text-[11px] font-medium text-slate-700">{d.count.label}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <input
                          type="number"
                          min={d.count.min}
                          max={d.count.max}
                          value={asking.value}
                          aria-label={d.count.label}
                          title={d.count.label}
                          onChange={(e) =>
                            setAsking({
                              key: d.key,
                              value: Math.max(d.count!.min, Math.min(d.count!.max, Number(e.target.value) || d.count!.min)),
                            })
                          }
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                        <span className="text-[10px] text-slate-500">{d.count.min}–{d.count.max}</span>
                        <button
                          type="button"
                          onClick={() => { p.onPickPremade(d.key, asking.value); setAsking(null); }}
                          title={`Open this with ${asking.value}`}
                          className="ml-auto rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => setAsking(null)}
                          title="Cancel"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

/**
 * A card-sized picture of a scene.
 *
 * Deliberately NOT a Fabric canvas: forty of those on one screen is forty
 * canvases. It is the same geometry drawn as flat SVG — good enough to
 * recognise the layout, which is all a card has to do.
 */
export function ScenePreview({ scene: raw, brand }: { scene: CanvasDoc | null; brand: StudioBrand }) {
  // A stored template row keeps "{{brand.primary}}" where a colour goes — LUMEN
  // only resolves those when it serves ONE template by id, never in the list
  // these cards are drawn from. Without this every starter template painted
  // itself black on the 2026-09-16 walk: a token is not a colour, and SVG
  // falls back to black rather than complaining.
  const scene = resolveBrandTokens(raw, brand.colours as unknown as Record<string, string>);
  if (!scene || !scene.width || !scene.height) {
    return <div className="aspect-[4/3] w-full rounded bg-slate-100" />;
  }
  const transparent = scene.background_color == null || String(scene.background_color).toLowerCase() === "transparent";
  return (
    <svg
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      className="w-full rounded border border-slate-100"
      style={{ aspectRatio: `${scene.width} / ${scene.height}`, background: transparent ? "#F8FAFC" : (scene.background_color || "#FFFFFF") }}
      aria-hidden="true"
    >
      {scene.layers.map((l) => {
        if (l.visible === false) return null;
        const t = `rotate(${l.rotation || 0} ${l.x + l.w / 2} ${l.y + l.h / 2})`;
        if (l.kind === "shape") {
          const s = l as ShapeLayer;
          const fill = s.gradient ? s.gradient.from : (s.fill && s.fill !== "none" ? s.fill : "none");
          if (s.shape === "icon") {
            const d = ICON_PATHS[s.icon || "star"];
            return (
              <g key={l.id} transform={`${t} translate(${l.x} ${l.y}) scale(${l.w / 100} ${l.h / 100})`} opacity={l.opacity ?? 1}>
                <path d={d} fillRule="evenodd" fill={fill === "none" ? brand.colours.primary : fill} />
              </g>
            );
          }
          if (s.shape === "ellipse") {
            return <ellipse key={l.id} cx={l.x + l.w / 2} cy={l.y + l.h / 2} rx={l.w / 2} ry={l.h / 2} fill={fill} opacity={l.opacity ?? 1} transform={t} />;
          }
          if (s.shape === "line") {
            return <line key={l.id} x1={l.x} y1={l.y} x2={l.x + l.w} y2={l.y + l.h} stroke={s.stroke || brand.colours.text} strokeWidth={s.strokeWidth || 2} transform={t} />;
          }
          return <rect key={l.id} x={l.x} y={l.y} width={l.w} height={l.h} rx={s.radius || 0} fill={fill} opacity={l.opacity ?? 1} transform={t} />;
        }
        if (l.kind === "text") {
          const tl = l as TextLayer;
          const size = tl.size || 24;
          const anchor = tl.align === "center" ? "middle" : tl.align === "right" ? "end" : "start";
          const tx = tl.align === "center" ? l.x + l.w / 2 : tl.align === "right" ? l.x + l.w : l.x;
          return (
            <text
              key={l.id} x={tx} y={l.y + size} textAnchor={anchor} transform={t}
              fontSize={size} fontFamily={tl.font || brand.fonts.body} fontWeight={tl.weight || "400"}
              fill={tl.color || brand.colours.text} opacity={l.opacity ?? 1}
            >
              {String(tl.content || "").split("\n")[0].slice(0, 42)}
            </text>
          );
        }
        // A picture slot: show the frame, not a network fetch per card.
        const il = l as ImageLayer;
        return (
          <rect
            key={l.id} x={l.x} y={l.y} width={l.w} height={l.h} transform={t}
            fill={il.src ? brand.colours.secondary : "#E2E8F0"} opacity={il.src ? 0.5 : 1}
            stroke="#CBD5E1" strokeDasharray={il.src ? undefined : "8 6"}
          />
        );
      })}
    </svg>
  );
}

export default TemplateGallery;
