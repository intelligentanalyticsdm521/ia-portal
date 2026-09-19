/**
 * builder/widgets/pageOnly.ts — the standard widgets a WEB PAGE has and a
 * document or an email does not.
 *
 * §11.13.3, website row: *"Elementor's whole free panel: the set above + Video,
 * Google Maps, Counter, Progress Bar, Tabs, Accordion, Toggle, Image Carousel,
 * Basic Gallery, HTML, Shortcode, Menu Anchor"*; landing row: *"website's list
 * without the menus"*. So every widget in this file is offered to `website` and
 * `landing`, and to nobody else — a proposal becomes a PDF and an email is drawn
 * with tables a mailbox accepts, and neither can play a video or open a tab.
 *
 * Names, groups and control sections from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, confirmed against the live
 * Playground editor on 2026-09-19. `html` already had its own file and stays
 * there.
 *
 * ── WHAT THE CANVAS DRAWS ─────────────────────────────────────────────────
 * These render as the STATIC shape Elementor's own default looks like: the
 * carousel draws its first picture with the others beside it, the accordion
 * draws every panel open. The canvas is a picture of the page, not a copy of
 * the page's JavaScript, and a widget that needed a script to be visible in the
 * editor is a widget the author cannot edit in place.
 */
import type { Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom, solid } from "../pictures";
import { editRun, proseRun } from "./text";
import { PAGES } from "./audience";

const str = (v: unknown): string => (v == null ? "" : String(v));
const rows = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/* ══════════════════════════════════════════════════════════════════════════
   Video — Elementor `video`, group Basic
   ══════════════════════════════════════════════════════════════════════════ */

/** The embed address for a YouTube or Vimeo link, or "" when we cannot tell. */
export function videoEmbed(url: string): string {
  const u = str(url).trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vi = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return "";
}

export function renderVideo(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  /* `url` is what `video` has stored since the first registry; Elementor's own
     two keys are read beside it so a page opened back out of a live site draws.
     An existing kind keeps its props — see the shared vocabulary. */
  const src = videoEmbed(str(p.url || p.youtube_url || p.vimeo_url));
  if (!src) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Paste the address of a YouTube or Vimeo video in the panel on the right.</div>`
      : "";
  }
  return `<div class="bx-video" style="position:relative;padding-top:56.25%">
    <iframe src="${esc(src)}" title="Video" loading="lazy" allowfullscreen
      style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px"></iframe>
  </div>`;
}

export const VIDEO_DEF: WidgetDef = {
  kind: "video",
  label: "Video",
  description: "A video from YouTube or Vimeo, playing on the page.",
  icon: "Play",
  picture: pictureFrom(box(8, 8, 48, 24) + `<path d="M28 15l10 5-10 5z" fill="#94A3B8" stroke="none"/>`),
  category: "Basic",
  adapters: PAGES,
  defaults: { url: "", autoplay: false, mute: false, controls: true },
  controls: [
    { key: "url", label: "Link", type: "link", tab: "content", section: "Video", help: "Paste the address from YouTube or Vimeo." },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Video" },
    { key: "mute", label: "Mute", type: "toggle", tab: "content", section: "Video" },
    { key: "controls", label: "Player Controls", type: "toggle", tab: "content", section: "Video" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Google Maps — Elementor `google_maps`, group Basic
   ══════════════════════════════════════════════════════════════════════════ */

export function renderGoogleMaps(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const address = str(p.address);
  if (!address.trim()) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Type an address or an area in the panel on the right.</div>`
      : "";
  }
  const height = Math.max(120, Number(p.height) || 300);
  const zoom = Math.max(1, Math.min(20, Number(p.zoom) || 10));
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=${zoom}&output=embed`;
  return `<iframe class="bx-map" src="${esc(src)}" title="${esc(address)}" loading="lazy"
    style="width:100%;height:${height}px;border:0;border-radius:8px"></iframe>`;
}

export const GOOGLE_MAPS_DEF: WidgetDef = {
  kind: "google_maps",
  label: "Google Maps",
  description: "A map showing where you are, or the area you cover.",
  icon: "MapPin",
  picture: pictureFrom(box(8, 8, 48, 24) + `<path d="M32 14a5 5 0 0 1 5 5c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`),
  category: "Basic",
  adapters: PAGES,
  defaults: { address: "", zoom: 10, height: 300 },
  controls: [
    { key: "address", label: "Location", type: "text", tab: "content", section: "Map" },
    { key: "zoom", label: "Zoom", type: "number", tab: "content", section: "Map" },
    { key: "height", label: "Height", type: "number", tab: "content", section: "Map" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Counter — Elementor `counter`, group General
   ══════════════════════════════════════════════════════════════════════════ */

export function renderCounter(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const end = Number(p.ending_number);
  const number = Number.isFinite(end) ? end : 0;
  const sep = p.thousand_separator === false ? "" : ",";
  const shown = sep ? number.toLocaleString("en-US") : String(number);
  return `<div class="bx-counter" style="text-align:center">
    <div class="bx-counter-n" style="font-size:36px;font-weight:700;color:${esc(ctx.accent)};line-height:1.1">${
    esc(str(p.prefix))}${esc(shown)}${esc(str(p.suffix))}</div>
    ${editRun("title", p.title, "bx-counter-t", "What is being counted?", ctx)}
  </div>`;
}

export const COUNTER_DEF: WidgetDef = {
  kind: "counter",
  label: "Counter",
  description: "One big number with a label — years in business, jobs done.",
  icon: "Hash",
  picture: pictureFrom(bar(20, 10, 24, 12) + bar(16, 28, 32)),
  category: "General",
  adapters: PAGES,
  defaults: { starting_number: 0, ending_number: 100, prefix: "", suffix: "", title: "", thousand_separator: true },
  controls: [
    { key: "starting_number", label: "Starting Number", type: "number", tab: "content", section: "Counter" },
    { key: "ending_number", label: "Ending Number", type: "number", tab: "content", section: "Counter" },
    { key: "prefix", label: "Number Prefix", type: "text", tab: "content", section: "Counter" },
    { key: "suffix", label: "Number Suffix", type: "text", tab: "content", section: "Counter" },
    { key: "thousand_separator", label: "Thousand Separator", type: "toggle", tab: "content", section: "Counter" },
    { key: "title", label: "Title", type: "text", tab: "content", section: "Counter" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Progress Bar — Elementor `progress`, group General
   ══════════════════════════════════════════════════════════════════════════ */

export function renderProgressBar(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
  const show = p.display_percentage !== false;
  return `<div class="bx-progress">
    ${editRun("title", p.title, "bx-progress-t", "What is this measuring?", ctx)}
    <div class="bx-progress-track" style="background:#E2E8F0;border-radius:999px;height:20px;overflow:hidden">
      <div class="bx-progress-fill" style="width:${pct}%;background:${esc(ctx.accent)};height:100%;color:#FFFFFF;font-size:11px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;box-sizing:border-box">${
    show ? `${pct}%` : esc(str(p.inner_text))}</div>
    </div>
  </div>`;
}

export const PROGRESS_BAR_DEF: WidgetDef = {
  kind: "progress_bar",
  label: "Progress Bar",
  description: "A bar filled to a percentage — how far along something is.",
  icon: "BarChart3",
  picture: pictureFrom(`<rect x="6" y="16" width="52" height="10" rx="5" fill="#E2E8F0" stroke="none"/>`
    + `<rect x="6" y="16" width="34" height="10" rx="5" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  adapters: PAGES,
  defaults: { title: "", percent: 50, display_percentage: true, inner_text: "" },
  controls: [
    { key: "title", label: "Title", type: "text", tab: "content", section: "Progress Bar" },
    { key: "percent", label: "Percentage", type: "number", tab: "content", section: "Progress Bar" },
    { key: "display_percentage", label: "Display Percentage", type: "toggle", tab: "content", section: "Progress Bar" },
    { key: "inner_text", label: "Inner Text", type: "text", tab: "content", section: "Progress Bar" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Tabs / Accordion / Toggle — Elementor `tabs`, `accordion`, `toggle`
   ══════════════════════════════════════════════════════════════════════════

   ONE RENDERER for the three, because they are one shape with three skins: a
   list of `{ tab_title, tab_content }` pairs. Elementor stores all three on the
   same repeater key, `tabs`, which is the give-away — and three near-identical
   renderers is how one of them quietly stops honouring an edit marker. */

function panelRows(w: Widget, ctx: RenderContext, skin: "tabs" | "accordion"): string {
  const p: any = w.props || {};
  const items = rows(p.tabs);
  if (!items.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Add your first question or tab in the panel on the right.</div>`
      : "";
  }
  if (skin === "tabs") {
    const heads = items.map((it, i) =>
      `<span class="bx-tab-h${i === 0 ? " bx-tab-on" : ""}" style="padding:8px 12px;border:1px solid #E2E8F0;border-bottom:${i === 0 ? "2px solid " + esc(ctx.accent) : "1px solid #E2E8F0"};${i === 0 ? "font-weight:700" : ""}" data-edit="tabs.${i}.tab_title">${
        esc(str(it?.tab_title))}</span>`).join("");
    const bodies = items.map((it, i) =>
      `<div class="bx-tab-b" style="${i === 0 ? "" : "display:none"};padding:12px;border:1px solid #E2E8F0;border-top:none">${
        proseRun(`tabs.${i}.tab_content`, it?.tab_content, "bx-tab-body", "What this tab says", ctx)}</div>`).join("");
    return `<div class="bx-tabs"><div class="bx-tab-heads" style="display:flex;flex-wrap:wrap">${heads}</div>${bodies}</div>`;
  }
  // An accordion and a toggle draw the same way on a canvas and on paper: every
  // panel open, because a panel the author cannot see is a panel they cannot
  // edit in place, and a printed page has nothing to click.
  return `<div class="bx-accordion">${items.map((it, i) => `
    <div class="bx-acc-item" style="border:1px solid #E2E8F0;border-radius:6px;margin-bottom:6px">
      <div class="bx-acc-h" style="padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;gap:8px" data-edit="tabs.${i}.tab_title"><span>${
    esc(str(it?.tab_title))}</span><span aria-hidden="true">–</span></div>
      <div class="bx-acc-b" style="padding:0 12px 10px">${
    proseRun(`tabs.${i}.tab_content`, it?.tab_content, "bx-acc-body", "The answer", ctx)}</div>
    </div>`).join("")}</div>`;
}

export function renderTabs(w: Widget, ctx: RenderContext): string { return panelRows(w, ctx, "tabs"); }
export function renderAccordion(w: Widget, ctx: RenderContext): string { return panelRows(w, ctx, "accordion"); }
export function renderToggle(w: Widget, ctx: RenderContext): string { return panelRows(w, ctx, "accordion"); }

const PANEL_CONTROLS = (section: string) => ([
  { key: "tabs", label: "Items", type: "list" as const, tab: "content" as const, section,
    help: "One title and its words per row." },
  { key: "title_html_tag", label: "Title HTML Tag", type: "select" as const, tab: "content" as const, section,
    options: [{ value: "h3", label: "H3" }, { value: "h4", label: "H4" }, { value: "div", label: "div" }] },
]);

export const TABS_DEF: WidgetDef = {
  kind: "tabs",
  label: "Tabs",
  description: "Several panels behind a row of titles — the visitor clicks one at a time.",
  icon: "PanelTop",
  picture: pictureFrom(box(6, 12, 52, 22) + `<path d="M6 12h16v-6h-16z" fill="#94A3B8" stroke="none"/>`
    + bar(26, 7, 12, 4) + bar(42, 7, 12, 4) + bar(12, 20, 34)),
  category: "General",
  adapters: PAGES,
  defaults: { tabs: [], title_html_tag: "h3" },
  controls: PANEL_CONTROLS("Tabs"),
};

export const ACCORDION_DEF: WidgetDef = {
  kind: "accordion",
  label: "Accordion",
  description: "Questions that open one at a time when the visitor clicks them.",
  icon: "ChevronsUpDown",
  picture: pictureFrom(box(6, 5, 52, 9) + box(6, 17, 52, 9) + box(6, 29, 52, 7) + bar(10, 8, 26, 3) + bar(10, 20, 22, 3)),
  category: "General",
  adapters: PAGES,
  defaults: { tabs: [], title_html_tag: "h3" },
  controls: PANEL_CONTROLS("Accordion"),
};

export const TOGGLE_DEF: WidgetDef = {
  kind: "toggle",
  label: "Toggle",
  description: "Questions that open independently — as many at once as the visitor wants.",
  icon: "ListCollapse",
  picture: pictureFrom(box(6, 5, 52, 9) + box(6, 17, 52, 15) + bar(10, 8, 26, 3) + bar(10, 21, 30, 3) + bar(10, 27, 22, 3)),
  category: "General",
  adapters: PAGES,
  defaults: { tabs: [], title_html_tag: "h3" },
  controls: PANEL_CONTROLS("Toggle"),
};

/* ══════════════════════════════════════════════════════════════════════════
   Image Carousel / Basic Gallery — Elementor `image-carousel`, `image-gallery`
   ══════════════════════════════════════════════════════════════════════════ */

function pictures(v: unknown): string[] {
  return rows(v).map((it) => (typeof it === "string" ? it : str(it?.url || it?.src))).filter(Boolean);
}

export function renderImageCarousel(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const pics = pictures(p.carousel);
  if (!pics.length) {
    return ctx.mode === "edit" ? `<div class="bx-imgdrop">Choose the pictures for this carousel.</div>` : "";
  }
  const show = Math.max(1, Math.min(6, Number(p.slides_to_show) || 3));
  return `<div class="bx-carousel" style="display:flex;gap:10px;overflow:hidden">${
    pics.slice(0, show).map((src) =>
      `<img src="${esc(src)}" alt="" style="flex:1 1 0;min-width:0;border-radius:8px;object-fit:cover;aspect-ratio:4/3"/>`).join("")}</div>`;
}

export const IMAGE_CAROUSEL_DEF: WidgetDef = {
  kind: "image_carousel",
  label: "Image Carousel",
  description: "Pictures side by side that the visitor can slide through.",
  icon: "GalleryHorizontal",
  picture: pictureFrom(solid(14, 8, 36, 24) + `<path d="M8 20h4M52 20h4" stroke="#94A3B8"/>`),
  category: "General",
  adapters: PAGES,
  defaults: { carousel: [], slides_to_show: 3, autoplay: true, navigation: "both" },
  controls: [
    { key: "carousel", label: "Add Images", type: "list", tab: "content", section: "Image Carousel" },
    { key: "slides_to_show", label: "Slides to Show", type: "number", tab: "content", section: "Image Carousel" },
    { key: "navigation", label: "Navigation", type: "select", tab: "content", section: "Image Carousel", options: [
      { value: "both", label: "Arrows and Dots" }, { value: "arrows", label: "Arrows" },
      { value: "dots", label: "Dots" }, { value: "none", label: "None" }] },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Additional Options" },
  ],
};

export function renderBasicGallery(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const pics = pictures(p.wp_gallery);
  if (!pics.length) {
    return ctx.mode === "edit" ? `<div class="bx-imgdrop">Choose the pictures for this gallery.</div>` : "";
  }
  const cols = Math.max(1, Math.min(6, Number(p.gallery_columns) || 4));
  return `<div class="bx-gallery" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:8px">${
    pics.map((src) => `<img src="${esc(src)}" alt="" style="width:100%;border-radius:6px;object-fit:cover;aspect-ratio:1/1"/>`).join("")}</div>`;
}

export const BASIC_GALLERY_DEF: WidgetDef = {
  kind: "basic_gallery",
  label: "Basic Gallery",
  description: "A grid of photographs of your work.",
  icon: "Images",
  picture: pictureFrom(solid(8, 8, 14, 12) + solid(25, 8, 14, 12) + solid(42, 8, 14, 12)
    + solid(8, 23, 14, 10) + solid(25, 23, 14, 10) + solid(42, 23, 14, 10)),
  category: "General",
  adapters: PAGES,
  defaults: { wp_gallery: [], gallery_columns: 4 },
  controls: [
    { key: "wp_gallery", label: "Add Images", type: "list", tab: "content", section: "Image Gallery" },
    { key: "gallery_columns", label: "Columns", type: "number", tab: "content", section: "Image Gallery" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Shortcode / Menu Anchor — Elementor `shortcode`, `menu-anchor`
   ══════════════════════════════════════════════════════════════════════════ */

export function renderShortcode(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const code = str(p.shortcode).trim();
  if (!code) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Paste a shortcode — it runs on the published page.</div>` : "";
  }
  // The canvas shows the shortcode ITSELF, because only the published site can
  // run it and drawing a guess at its output would be a lie the author cannot
  // check. The published page gets the code, untouched.
  return ctx.mode === "edit"
    ? `<div class="bx-shortcode" style="font-family:ui-monospace,monospace;font-size:11px;background:#F1F5F9;border-radius:6px;padding:8px 10px;color:#475569">${esc(code)}<div class="bx-card-note">This runs on your published page, not here.</div></div>`
    : code;
}

export const SHORTCODE_DEF: WidgetDef = {
  kind: "shortcode",
  label: "Shortcode",
  description: "Paste a shortcode from another plugin. It runs on your published page.",
  icon: "Braces",
  picture: pictureFrom(box(6, 10, 52, 20) + `<path d="M20 16l-5 4 5 4M44 16l5 4-5 4" stroke="#94A3B8"/>`),
  category: "General",
  adapters: PAGES,
  defaults: { shortcode: "" },
  controls: [
    { key: "shortcode", label: "Enter your shortcode", type: "textarea", tab: "content", section: "Shortcode" },
  ],
};

export function renderMenuAnchor(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const anchor = str(p.anchor).trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (!anchor) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Give this spot a one-word name so a menu link can jump to it.</div>` : "";
  }
  return ctx.mode === "edit"
    ? `<div class="bx-anchor" style="border:1px dashed #CBD5E1;border-radius:6px;padding:6px 10px;color:#64748B;font-size:11px">Menu anchor: #${esc(anchor)}</div>`
    : `<span id="${esc(anchor)}" class="bx-anchor"></span>`;
}

export const MENU_ANCHOR_DEF: WidgetDef = {
  kind: "menu_anchor",
  label: "Menu Anchor",
  description: "An invisible marker a menu link can jump straight to.",
  icon: "Anchor",
  picture: pictureFrom(`<path d="M32 10v20M24 24a8 8 0 0 0 16 0" stroke="#94A3B8"/><circle cx="32" cy="9" r="3" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  adapters: PAGES,
  defaults: { anchor: "" },
  controls: [
    { key: "anchor", label: "The ID of Menu Anchor", type: "text", tab: "content", section: "Anchor",
      help: "One word, no spaces. A menu link to #that word jumps here." },
  ],
};
