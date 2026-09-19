/**
 * families/container/controls.ts — THE CONTAINER'S PANEL, written down once.
 *
 * B-168, family F0. Every control the reference editor draws on a Container,
 * with the reference's OWN settings key, its own label, its own panel section,
 * its own tab and its own `responsive` flag — and, beside each, the field on
 * our `StyleLayer` that holds it.
 *
 * ── WHY THIS TABLE EXISTS AND WHY IT IS DATA ──────────────────────────────
 * Three things have to agree about a container control, and before this they
 * agreed by nobody checking: the PANEL (what the author sees), the RENDERER
 * (what the canvas draws) and the EMITTER (what a published page carries).
 * The panel is drawn from this table, the renderer reads the same `StyleLayer`
 * field this table names, and `test/families-container.test.mjs` asserts every
 * `settings` key below is a real control of the reference's container element
 * in `test/fixtures/WIDGET_SETTINGS_KEYS.json`. A key we invented fails the
 * build rather than being silently dropped on publish — which is the defect
 * `scripts/dev/extract-widget-controls.mjs` was written to catch on the
 * website side, said once more on this one.
 *
 * ── WHERE EVERY FACT CAME FROM ────────────────────────────────────────────
 *   · `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, `elements.container`
 *     — Elementor 4.2.4 free, the literal registry: sections, labels, tabs,
 *     types, defaults, options and the `responsive` flag.
 *   · the same catalogue's `.pro.json` twin for `custom_css` and `sticky`,
 *     which are Pro and therefore absent from the free file.
 *   · a LIVE Elementor 4.2.4 editor (WordPress Playground, no login), driven
 *     on 2026-09-19: one container inserted, each of its three tabs clicked
 *     and read out. It confirmed the tab names **Layout / Style / Advanced**,
 *     the Layout tab's Container ▸ Items split, and the Style tab's four
 *     sections — Background, Background Overlay, Border, Shape Divider.
 *
 * ── WHAT IS DELIBERATELY NOT IN THE TABLE, and why ────────────────────────
 * Motion Effects and Transform (both Pro, both a scroll-and-mouse animation
 * engine we do not have), `link` (a whole box that is a link — a decision, not
 * a control), the hover twin of every colour, and Elementor's per-side border
 * width and radius, which we keep as one number each because that is what
 * `BorderSpec` has held since §11.8 and a second spelling of a border is a
 * second answer to "what is the edge of this box". Each is named in the
 * handoff rather than half-built.
 */
import type { PreviewKey } from "../../../responsive";
import type { StyleLayer } from "../../../style";

/** Which of the three tabs a control sits on. The reference's own word. */
export type ContainerTab = "layout" | "style" | "advanced";

export interface ContainerControl {
  /** The reference editor's own settings key. Pinned against the machine file. */
  settings: string;
  /** The reference editor's own label, verbatim. */
  label: string;
  /** Its panel section, by the reference's own heading. */
  section: string;
  tab: ContainerTab;
  /** Straight off the machine file's `responsive` flag. Never guessed. */
  responsive: boolean;
  /**
   * The `StyleLayer` field that holds it, or an `ElementStyle` field for the
   * four that are not per device. A dotted path means "inside that spec".
   */
  field: string;
  /** For a `select` / `choose`: the reference's own option values. */
  options?: readonly string[];
}

/**
 * Elementor's own device suffixes, for a key that IS per device.
 *
 * `phone` is spelled `_mobile` because that is what the machine file, the page
 * engine and every stored Elementor document call it. The same translation
 * `definitionControls.deviceKey` does for a widget, said here for the box.
 */
export function containerSettingsKey(control: ContainerControl, device: PreviewKey): string {
  if (!control.responsive || device === "desktop") return control.settings;
  return device === "tablet" ? `${control.settings}_tablet` : `${control.settings}_mobile`;
}

const L = (
  settings: string, label: string, section: string, tab: ContainerTab,
  responsive: boolean, field: string, options?: readonly string[],
): ContainerControl => ({ settings, label, section, tab, responsive, field, options });

/* ══════════════════════════════════════════════════════════════════════════
   LAYOUT — the reference's first tab, and it is called Layout, not Content
   ══════════════════════════════════════════════════════════════════════════ */

export const CONTAINER_LAYOUT_CONTROLS: readonly ContainerControl[] = [
  L("container_type", "Container Layout", "Container", "layout", false, "direction", ["flex", "grid"]),
  L("content_width", "Content Width", "Container", "layout", false, "contentWidth", ["boxed", "full"]),
  L("boxed_width", "Width", "Container", "layout", true, "width"),
  L("min_height", "Min Height", "Container", "layout", true, "minHeight"),
  L("flex_direction", "Direction", "Items", "layout", true, "direction",
    ["row", "column", "row-reverse", "column-reverse"]),
  L("flex_justify_content", "Justify Content", "Items", "layout", true, "justify",
    ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"]),
  L("flex_align_items", "Align Items", "Items", "layout", true, "alignItems",
    ["flex-start", "center", "flex-end", "stretch"]),
  L("flex_gap", "Gaps", "Items", "layout", true, "gap"),
  L("flex_wrap", "Wrap", "Items", "layout", true, "wrap", ["nowrap", "wrap"]),
  L("grid_columns_grid", "Columns", "Items", "layout", true, "columns"),
  L("grid_rows_grid", "Rows", "Items", "layout", true, "rows"),
  L("grid_gaps", "Gaps", "Items", "layout", true, "rowGap"),
  L("grid_auto_flow", "Auto Flow", "Items", "layout", true, "autoFlow", ["row", "column"]),
  L("html_tag", "HTML Tag", "Additional Options", "layout", false, "props.html_tag",
    ["", "div", "header", "footer", "main", "article", "section", "aside"]),
  L("overflow", "Overflow", "Additional Options", "layout", false, "overflow", ["", "hidden", "auto"]),
];

/* ══════════════════════════════════════════════════════════════════════════
   STYLE — Background · Background Overlay · Border · Shape Divider
   ══════════════════════════════════════════════════════════════════════════ */

export const CONTAINER_STYLE_CONTROLS: readonly ContainerControl[] = [
  L("background_background", "Background Type", "Background", "style", false, "background.type",
    ["classic", "gradient", "video", "slideshow"]),
  L("background_color", "Color", "Background", "style", false, "background.color"),
  L("background_image", "Image", "Background", "style", true, "background.image"),
  L("background_position", "Position", "Background", "style", true, "background.position"),
  L("background_repeat", "Repeat", "Background", "style", true, "background.repeat"),
  L("background_size", "Size", "Background", "style", true, "background.size"),
  L("background_color_b", "Second Color", "Background", "style", false, "background.colorB"),
  L("background_gradient_type", "Type", "Background", "style", false, "background.gradient", ["linear", "radial"]),
  L("background_gradient_angle", "Angle", "Background", "style", true, "background.angle"),
  L("background_video_link", "Video Link", "Background", "style", false, "background.videoUrl"),
  L("background_slideshow_gallery", "Images", "Background", "style", false, "background.images"),
  L("background_overlay_background", "Background Type", "Background Overlay", "style", false, "overlay.type",
    ["classic", "gradient"]),
  L("background_overlay_color", "Color", "Background Overlay", "style", false, "overlay.color"),
  L("background_overlay_image", "Image", "Background Overlay", "style", true, "overlay.image"),
  L("background_overlay_color_b", "Second Color", "Background Overlay", "style", false, "overlay.colorB"),
  L("background_overlay_gradient_type", "Type", "Background Overlay", "style", false, "overlay.gradient",
    ["linear", "radial"]),
  L("background_overlay_gradient_angle", "Angle", "Background Overlay", "style", true, "overlay.angle"),
  L("background_overlay_opacity", "Opacity", "Background Overlay", "style", true, "overlay.opacity"),
  L("overlay_blend_mode", "Blend Mode", "Background Overlay", "style", false, "overlay.blend",
    ["", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "saturation", "color", "luminosity"]),
  L("border_border", "Border Type", "Border", "style", false, "border.style",
    ["", "none", "solid", "double", "dotted", "dashed", "groove"]),
  L("border_width", "Border Width", "Border", "style", true, "border.width"),
  L("border_color", "Border Color", "Border", "style", false, "border.color"),
  L("border_radius", "Border Radius", "Border", "style", true, "radius"),
  L("box_shadow_box_shadow", "Box Shadow", "Border", "style", false, "shadow"),
  L("shape_divider_top", "Type", "Shape Divider", "style", false, "shapeTop.shape"),
  L("shape_divider_top_color", "Color", "Shape Divider", "style", false, "shapeTop.color"),
  L("shape_divider_top_height", "Height", "Shape Divider", "style", true, "shapeTop.height"),
  L("shape_divider_top_width", "Width", "Shape Divider", "style", true, "shapeTop.width"),
  L("shape_divider_top_flip", "Flip", "Shape Divider", "style", false, "shapeTop.flip"),
  L("shape_divider_top_negative", "Invert", "Shape Divider", "style", false, "shapeTop.invert"),
  L("shape_divider_top_above_content", "Bring to Front", "Shape Divider", "style", false, "shapeTop.aboveContent"),
  L("shape_divider_bottom", "Type", "Shape Divider", "style", false, "shapeBottom.shape"),
  L("shape_divider_bottom_color", "Color", "Shape Divider", "style", false, "shapeBottom.color"),
  L("shape_divider_bottom_height", "Height", "Shape Divider", "style", true, "shapeBottom.height"),
  L("shape_divider_bottom_width", "Width", "Shape Divider", "style", true, "shapeBottom.width"),
  L("shape_divider_bottom_flip", "Flip", "Shape Divider", "style", false, "shapeBottom.flip"),
  L("shape_divider_bottom_negative", "Invert", "Shape Divider", "style", false, "shapeBottom.invert"),
  L("shape_divider_bottom_above_content", "Bring to Front", "Shape Divider", "style", false,
    "shapeBottom.aboveContent"),
];

/* ══════════════════════════════════════════════════════════════════════════
   ADVANCED — Layout · Motion Effects (Sticky) · Responsive · Custom CSS
   ══════════════════════════════════════════════════════════════════════════ */

export const CONTAINER_ADVANCED_CONTROLS: readonly ContainerControl[] = [
  L("margin", "Margin", "Layout", "advanced", true, "margin"),
  L("padding", "Padding", "Layout", "advanced", true, "padding"),
  L("width", "Width", "Layout", "advanced", true, "selfWidth"),
  L("_flex_align_self", "Align Self", "Layout", "advanced", true, "alignSelf",
    ["flex-start", "center", "flex-end", "stretch"]),
  L("_flex_order_custom", "Order", "Layout", "advanced", true, "order"),
  L("position", "Position", "Layout", "advanced", false, "position", ["", "absolute", "fixed"]),
  L("z_index", "Z-Index", "Layout", "advanced", true, "zIndex"),
  L("_element_id", "CSS ID", "Layout", "advanced", false, "cssId"),
  L("css_classes", "CSS Classes", "Layout", "advanced", false, "cssClasses"),
  L("sticky", "Sticky", "Motion Effects", "advanced", false, "sticky", ["", "top", "bottom"]),
  L("sticky_offset", "Sticky Offset", "Motion Effects", "advanced", true, "stickyOffset"),
  L("hide_desktop", "Hide On Desktop", "Responsive", "advanced", false, "hidden"),
  L("hide_tablet", "Hide On Tablet Portrait", "Responsive", "advanced", false, "tablet.hidden"),
  L("hide_mobile", "Hide On Mobile Portrait", "Responsive", "advanced", false, "phone.hidden"),
  L("custom_css", "Add your own custom CSS", "Custom CSS", "advanced", false, "customCss"),
];

/** Every container control, in the order the three tabs are read. */
export const CONTAINER_CONTROLS: readonly ContainerControl[] = [
  ...CONTAINER_LAYOUT_CONTROLS,
  ...CONTAINER_STYLE_CONTROLS,
  ...CONTAINER_ADVANCED_CONTROLS,
];

/** The controls on one tab, in the reference's order. */
export function containerControlsFor(tab: ContainerTab): ContainerControl[] {
  return CONTAINER_CONTROLS.filter((c) => c.tab === tab);
}

/** The section headings of one tab, in the reference's order, without repeats. */
export function containerSectionsFor(tab: ContainerTab): string[] {
  const out: string[] = [];
  for (const c of containerControlsFor(tab)) if (!out.includes(c.section)) out.push(c.section);
  return out;
}

/**
 * THE KEYS THAT ARE PER DEVICE, as a set the panel and the tests both read.
 *
 * `StyleLayer` fields only: an `ElementStyle` field (`cssId`, `customCss`,
 * `sticky`) is one value for every screen by construction, so it cannot be in
 * here even by accident.
 */
export const RESPONSIVE_FIELDS: ReadonlySet<keyof StyleLayer> = new Set(
  CONTAINER_CONTROLS
    .filter((c) => c.responsive && !c.field.includes("."))
    .map((c) => c.field as keyof StyleLayer),
);

export default CONTAINER_CONTROLS;
