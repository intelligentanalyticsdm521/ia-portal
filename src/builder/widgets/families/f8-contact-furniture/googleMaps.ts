/**
 * f8-contact-furniture/googleMaps.ts — Elementor's **Google Maps**, deepened.
 *
 * ── WHAT THIS REPLACES, AND WHY THE KIND DOES NOT CHANGE ──────────────────
 * `google_maps` has been on the website and landing panels since D-165,
 * declared in `src/builder/widgets/pageOnly.ts` with THREE controls — Location,
 * Zoom, Height — and no Style tab at all. Elementor's own panel has those three
 * on Content and thirteen more on Style. This file is the same `kind`, so every
 * page saved before today opens and draws; `mergeWidgetDefs` (b168/override)
 * drops the old declaration out of the list the panel, the renderer and every
 * stored document read, and `shadowedLegacyKinds()` prints it for the lander to
 * delete. Not `google_maps_v2`.
 *
 * ── WHERE EVERY NAME, KEY, DEFAULT AND RANGE BELOW COMES FROM ─────────────
 * TWO sources, and they agree:
 *
 *   1. `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget
 *      `google_maps`: title "Google Maps", category `basic`, sections
 *      `section_map` (Content, labelled "Google Maps") and `section_map_style`
 *      (Style, labelled "Google Maps").
 *   2. **The live editor**, driven on 2026-09-19 in the WordPress Playground on
 *      the installed Chrome — `elementor-reference/scripts/g8-read-f8-panels.js`
 *      and `g8-maps-style-tab.js`, results in
 *      `elementor-reference/widgets/_g8_f8_panels.json`,
 *      `_g8_maps_tabs.json` and `_g8_control_facts.json`, screenshots in
 *      `b168-screens/screen/g8b-google_maps.*.png`. Google Maps is a FREE
 *      widget, so unlike the rest of F8 it is one we can actually look at.
 *      Content reads **Location · Zoom · Height**; Style reads **CSS Filters ·
 *      Blur · Brightness · Contrast · Saturation · Hue** and then the same six
 *      again under Hover, and **Transition Duration (s)**.
 *
 * The live read settled the one fact a scrape does not carry: the two popover
 * toggles store the string **`custom`** (`return_value: "custom"`), not `yes`.
 * Publishing `yes` there would leave every filter the author set doing nothing.
 *
 * ── THE ONE PLACE OUR PANEL DIFFERS, AND IT IS WRITTEN DOWN ───────────────
 * Elementor draws the Style section's six filters twice, under a **Normal** and
 * a **Hover** tab INSIDE the section. Our panel has sections and no tabs inside
 * a section, so Elementor's own word for the second set moves onto the control:
 * "Blur" and "Hover Blur". The KEYS are Elementor's exactly, which is what the
 * page engine reads, and the section heading is Elementor's exactly, which is
 * what a person reads.
 *
 * ── WHAT IS DELIBERATELY NOT A CONTROL ────────────────────────────────────
 * Nothing. All sixteen of Google Maps' own controls are here.
 *
 * ── HOW THE LOCATION IS TYPED, AND THE SEAM GAP BEHIND IT ─────────────────
 * Elementor's Location is a TEXT BOX in the panel. Our panel draws seven kinds
 * of control — toggle, select, colour, number, image, link, code
 * (`PANEL_CONTROL_TYPES` in `definitionControls.tsx`) — and a `text` control is
 * NOT one of them, because the platform's one mechanism for words is typing
 * them on the canvas (`data-edit`). That works for a Heading. It cannot work
 * for a map, because the map is an `<iframe>` and there is nothing on it to
 * type into.
 *
 * So the canvas grows ONE strip, under the map, drawn ONLY while the page is
 * being edited (`ctx.mode === "edit"`), carrying `data-edit="address"`. A
 * visitor never sees it and the published page is unchanged; the author can
 * always reach the address. This is a workaround and it is written down as one:
 * the real fix is for the panel to draw a text control, which is one line in a
 * shared file that all ten families need and none of them owns.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { esc } from "../../../esc";
import { box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's popover toggle stores this string when it is open. Read off the
 *  live editor (`return_value`), never guessed. */
export const FILTER_ON = "custom";

/** Is a popover toggle open? `custom` is Elementor's word; a checkbox writes a
 *  boolean, and one reader has to understand both or half the panel is lost. */
function filtersOn(v: unknown): boolean {
  return v === true || v === FILTER_ON || v === "yes";
}

/**
 * A slider's number, with Elementor's own default when the author has not
 * touched it. Elementor stores `{ unit, size, sizes }`; we store the number,
 * and a stored document from before today holds the number too.
 */
function num(v: unknown, dflt: number): number {
  if (v && typeof v === "object" && "size" in (v as any)) {
    const s = Number((v as any).size);
    return Number.isFinite(s) ? s : dflt;
  }
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : dflt;
}

/** Elementor's own ranges, from the live read. A value outside one is a value
 *  the engine clamps, so the canvas clamps it too and the two agree. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** THE six filters, as one CSS `filter` value. Empty when the toggle is off. */
export function filterCss(p: Record<string, unknown>, hover: boolean): string {
  const k = (name: string) => (hover ? `css_filters_hover_${name}` : `css_filters_${name}`);
  if (!filtersOn(p[hover ? "css_filters_hover_css_filter" : "css_filters_css_filter"])) return "";
  const blur = clamp(num(p[k("blur")], 0), 0, 10);
  const brightness = clamp(num(p[k("brightness")], 100), 0, 200);
  const contrast = clamp(num(p[k("contrast")], 100), 0, 200);
  const saturate = clamp(num(p[k("saturate")], 100), 0, 200);
  const hue = clamp(num(p[k("hue")], 0), 0, 360);
  return `blur(${blur}px) brightness(${brightness}%) contrast(${contrast}%) `
    + `saturate(${saturate}%) hue-rotate(${hue}deg)`;
}

/**
 * WHAT THE CANVAS DRAWS.
 *
 * A real embedded map, at the author's height, with the author's filters on it
 * — and, when a hover filter is set, a scoped rule so moving the pointer over
 * the map on the canvas shows exactly what a visitor will see. Every control on
 * the panel changes something here; that is the rule this wave is measured on.
 */
export function renderGoogleMaps(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const address = str(p.address);
  if (!address.trim()) {
    /* Nothing to show a visitor, and something to type into while editing. */
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">${editRun("address", "", "bx-map-a", "Type an address or the area you cover", ctx)}</div>`
      : "";
  }
  const height = clamp(num(p.height, 300), 40, 1440);
  const zoom = clamp(num(p.zoom, 10), 1, 20);
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=${zoom}&output=embed`;

  const normal = filterCss(p, false);
  const hover = filterCss(p, true);
  const seconds = num(p.hover_transition, 0);
  /* One class per widget, so two maps on one page do not share a hover rule. */
  const cls = `bx-map-${String(w.id || "x").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const transition = seconds > 0 ? `transition:filter ${clamp(seconds, 0, 3)}s;` : "";

  const style = hover
    ? `<style>.${cls}:hover{filter:${hover}}</style>`
    : "";

  /* EDIT ONLY. See the header: a map has nothing on it to type into, so the
     address gets a strip of its own while the page is being built. A visitor
     never sees this, which is why it is inside the mode test and not styled to
     look like part of the page. */
  const strip = ctx.mode === "edit"
    ? `<div style="font-size:11px;color:#5A7A8A;margin-top:4px">${
      editRun("address", address, "bx-map-a", "Type an address or the area you cover", ctx, "span")}</div>`
    : "";

  return `<iframe class="bx-map ${cls}" src="${esc(src)}" title="${esc(address)}" loading="lazy"
    style="width:100%;height:${height}px;border:0;border-radius:8px;${
    normal ? `filter:${normal};` : ""}${transition}"></iframe>${style}${strip}`;
}

export const GOOGLE_MAPS_DEF: FamilyWidgetDef = {
  kind: "google_maps",
  label: "Google Maps",
  description: "A map showing where you are, or the area you cover.",
  icon: "MapPin",
  picture: pictureFrom(box(8, 8, 48, 24)
    + `<path d="M32 14a5 5 0 0 1 5 5c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`),
  category: "Basic",
  /* The offer file lists `google_maps` under `website.elementor_free` and
     `landing.elementor_free`, and under the newsletter's
     `not_offered_because_email_cannot_run_them`. Proposal and My Brand do not
     list it at all. */
  builders: ["website", "landing"],
  defaults: {
    address: "",
    zoom: 10,
    height: 300,
    css_filters_css_filter: "",
    css_filters_blur: 0,
    css_filters_brightness: 100,
    css_filters_contrast: 100,
    css_filters_saturate: 100,
    css_filters_hue: 0,
    css_filters_hover_css_filter: "",
    css_filters_hover_blur: 0,
    css_filters_hover_brightness: 100,
    css_filters_hover_contrast: 100,
    css_filters_hover_saturate: 100,
    css_filters_hover_hue: 0,
    hover_transition: 0,
  },
  controls: [
    /* ── Content · "Google Maps" (section_map) ────────────────────────── */
    { key: "address", label: "Location", type: "text", tab: "content", section: "Google Maps",
      help: "An address, a suburb, or the area you cover." },
    { key: "zoom", label: "Zoom", type: "number", tab: "content", section: "Google Maps",
      help: "1 is the whole world, 20 is one building." },
    /* Elementor marks Height responsive and stores `height_tablet` /
       `height_mobile`. Copied from the machine file and confirmed on screen —
       the panel draws the little device icon beside it. */
    { key: "height", label: "Height", type: "number", tab: "content", section: "Google Maps",
      responsive: true },

    /* ── Style · "Google Maps" (section_map_style), Normal ────────────── */
    { key: "css_filters_css_filter", label: "CSS Filters", type: "toggle", tab: "style",
      section: "Google Maps", help: "Recolour the map" },
    { key: "css_filters_blur", label: "Blur", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_brightness", label: "Brightness", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_contrast", label: "Contrast", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_saturate", label: "Saturation", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_hue", label: "Hue", type: "number", tab: "style", section: "Google Maps" },

    /* ── …and the same six under Elementor's Hover tab ────────────────── */
    { key: "css_filters_hover_css_filter", label: "CSS Filters (hover)", type: "toggle", tab: "style",
      section: "Google Maps", help: "Recolour it while the pointer is on it" },
    { key: "css_filters_hover_blur", label: "Hover Blur", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_hover_brightness", label: "Hover Brightness", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_hover_contrast", label: "Hover Contrast", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_hover_saturate", label: "Hover Saturation", type: "number", tab: "style", section: "Google Maps" },
    { key: "css_filters_hover_hue", label: "Hover Hue", type: "number", tab: "style", section: "Google Maps" },
    { key: "hover_transition", label: "Transition Duration (s)", type: "number", tab: "style",
      section: "Google Maps" },
  ],
};
