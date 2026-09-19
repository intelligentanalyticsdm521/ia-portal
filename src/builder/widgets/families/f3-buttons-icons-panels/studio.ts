/**
 * families/f3-buttons-icons-panels/studio.ts — THE MY BRAND HALF of the three
 * widgets the offer file gives that canvas.
 *
 * `BUILDER_OFFERS_2026-09-19.json`'s `mybrand` list is ten Elementor widgets.
 * Three of them are this family's: **Button**, **Icon** and **Divider**. The
 * other five everyday widgets are not on that list and have nothing here — a
 * tile that is not offered needs no insert.
 *
 * ── WHAT A STUDIO INSERT IS, AND WHY IT TAKES NO PROPS ────────────────────
 * The studio is an ABSOLUTE-PIXEL canvas: every object carries its own x, y, w
 * and h. A widget does not "render" there, it becomes LAYERS, and the insert is
 * the moment the author presses the tile — before there are any props to read.
 * So this is "place a fresh Button", not "draw this Button", which is why the
 * signature is `(doc, brand, opts)` and not `(widget, ctx)`.
 *
 * ── FOR THE LANDER: DELETE THE THREE SHADOWED CASES ───────────────────────
 * `adapters/mybrand/insert.ts` asks the families in its `default` branch only,
 * so its own `case "button"`, `case "icon"` and `case "divider"` still answer
 * first on the merged tree. These three produce the SAME layers, so nothing
 * changes at run time whichever wins — which is exactly how you know the delete
 * is safe. Replace means delete:
 *
 *   src/builder/adapters/mybrand/insert.ts  case "icon"     (~line 152)
 *   src/builder/adapters/mybrand/insert.ts  case "divider"  (~line 177)
 *   src/builder/adapters/mybrand/insert.ts  case "button"   (~line 210)
 *
 * This family does not delete them itself: that file is one no family opens,
 * and ten families each editing it is the ten conflicts §C.1 exists to stop.
 * Written here rather than only in the handoff, so the next person to open this
 * folder finds it.
 */
import type {
  FamilyStudioInsert, StudioBrandLite, StudioCanvasDoc, StudioInsertResult,
} from "../types";

/**
 * A layer id. The adapter's own `uid` lives in `adapters/mybrand/scene`, and a
 * family folder must not import an adapter — so this makes one of the same
 * shape. Uniqueness is what the canvas needs, not provenance.
 */
let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/** The brand kit, read defensively: a family gets it as an opaque object. */
function colours(brand: StudioBrandLite): Record<string, string> {
  const c = (brand as { colours?: Record<string, string> }).colours || {};
  return {
    primary: c.primary || "#0F7FA8",
    secondary: c.secondary || "#CFE3EC",
    accent: c.accent || "#0F7FA8",
    background: c.background || "#FFFFFF",
    text: c.text || "#0B1C24",
  };
}

function headingFont(brand: StudioBrandLite): string {
  const f = (brand as { fonts?: Record<string, string> }).fonts || {};
  return f.heading || "Inter";
}

/** Presets are drawn for a 1080 square, so a button is a button on a card too. */
function scaleOf(doc: StudioCanvasDoc): number {
  return Math.max(0.3, Math.min(doc.width, doc.height) / 1080);
}

const one = (layer: Record<string, unknown>): StudioInsertResult =>
  ({ layers: [layer], behind: false, selectId: String(layer.id) });

/**
 * BUTTON — a rounded block with a label centred on it, both in the business's
 * colours. The one compound in the pane everybody recognises.
 */
export const studioButton: FamilyStudioInsert = (doc, brand) => {
  const c = colours(brand);
  const s = scaleOf(doc);
  const w = Math.round(Math.min(doc.width * 0.62, 460 * s));
  const h = Math.round(110 * s);
  const x = Math.round(doc.width / 2 - w / 2);
  const y = Math.round(doc.height / 2 - h / 2);
  const size = Math.round(38 * s);
  const layers = [
    {
      id: uid("rect"), kind: "shape", shape: "rect",
      x, y, w, h, radius: Math.round(h / 2),
      fill: c.accent, stroke: "none", strokeWidth: 0, visible: true,
    },
    {
      id: uid("text"), kind: "text",
      x, y: Math.round(y + h / 2 - size * 0.7), w, h: Math.round(size * 1.4),
      content: "BOOK TODAY", size, weight: "700",
      color: c.background, align: "center",
      letterSpacing: Math.round(3 * s), font: headingFont(brand), visible: true,
    },
  ];
  return { layers, behind: false, selectId: String(layers[layers.length - 1].id) };
};

/** ICON — one symbol from the curated pack, in the primary colour. */
export const studioIcon: FamilyStudioInsert = (doc, brand, opts) => {
  const c = colours(brand);
  const side = Math.round(Math.min(doc.width, doc.height) * 0.18);
  /* `opts.option` is the key the icon picker handed back. The studio's pack has
     its own short names ("star", "check"), not Font Awesome's, so an unknown
     one falls back to the star rather than placing a blank square. */
  const chosen = String((opts as { option?: unknown })?.option ?? "").trim();
  return one({
    id: uid("icon"), kind: "shape", shape: "icon",
    icon: /^[a-z][a-z0-9-]{0,30}$/.test(chosen) ? chosen : "star",
    x: Math.round(doc.width / 2 - side / 2), y: Math.round(doc.height / 2 - side / 2),
    w: side, h: side,
    fill: c.primary, stroke: "none", strokeWidth: 0, rotation: 0, visible: true,
  });
};

/** DIVIDER — a straight rule across the middle, in the accent colour. */
export const studioDivider: FamilyStudioInsert = (doc, brand) => {
  const c = colours(brand);
  const s = scaleOf(doc);
  const w = Math.round(doc.width * 0.5);
  return one({
    id: uid("line"), kind: "shape", shape: "line",
    x: Math.round(doc.width / 2 - w / 2), y: Math.round(doc.height / 2), w, h: 0,
    fill: "none", stroke: c.accent, strokeWidth: Math.max(2, Math.round(5 * s)),
    rotation: 0, visible: true,
  });
};

/** Every studio insert this family declares, by the kind it places. */
export const STUDIO_INSERTS: Record<string, FamilyStudioInsert> = {
  button: studioButton,
  icon: studioIcon,
  divider: studioDivider,
};
