/**
 * Spacer — Elementor `spacer`, group Basic.
 *
 * ── THE SHORTEST WIDGET IN ELEMENTOR, AND THAT IS THE POINT ───────────────
 * Elementor's Spacer has exactly ONE control: `space`, a slider labelled
 * "Space", in section "Spacer" on the Content tab, marked responsive, default
 * 50px. There is no Style tab. Deepening this widget does not mean adding
 * controls to it — it means matching Elementor exactly, which is Elementor's
 * key, Elementor's label, Elementor's section, Elementor's default, and the
 * per-screen setting our version did not have.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `registry.ts`'s `spacer`: one control keyed `height`, labelled "How much
 * space", with no tab, no section, no responsive twin and a default of 24.
 *
 * SAME KIND (`spacer`), and `height` is still read — every document that holds
 * a spacer holds that key, and a page whose gaps all collapsed to 50px on the
 * day we deepened the widget would be a worse page than it was yesterday.
 *
 * ── WHY A PAGE-BUILDER SPACER IS NOT AN EMAIL SPACER ──────────────────────
 * Offered on four of the five builders. Not My Brand: the studio is an
 * absolute-pixel canvas where every object already carries its own y, so a
 * widget whose whole job is to push the next thing down has nothing to push.
 * The offer file's `mybrand` list agrees — Spacer is not on it.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { RESPONSIVE, num } from "./deep";

export function renderSpacer(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  /* Elementor's key first, ours behind it. `50` is Elementor's own default and
     `24` was ours, so a widget that has NEITHER key — which is what a brand new
     one has before the defaults are applied — falls to Elementor's. */
  const height = num(p.space ?? p.height, 50, 0, 2000);

  /* WHILE EDITING, A GAP HAS TO BE VISIBLE OR IT CANNOT BE SELECTED. Zero
     height is zero pixels to click, and an author who set the space to nothing
     could never get the widget back. A hairline of the canvas's own grey is
     drawn in edit mode only; a customer never sees it. */
  const show = ctx.mode === "edit" && height < 6;
  return `<div class="bx-spacer" aria-hidden="true" style="height:${height}px;${
    show ? "min-height:6px;outline:1px dashed #CBD5E1;outline-offset:-1px" : ""}"></div>`;
}

export const SPACER_DEF: FamilyWidgetDef = {
  kind: "spacer",
  label: "Spacer",
  description: {
    proposal: "Empty space, when two things are sitting too close together.",
    website: "Empty space, when two things on the page are sitting too close together.",
    email: "Empty space, when two things in the email are sitting too close together.",
    landing: "Empty space, when two things on the page are sitting too close together.",
  },
  icon: "MoveVertical",
  picture: pictureFrom(bar(8, 8, 48) + `<path d="M32 16v10" stroke="#CBD5E1"/>` + bar(8, 30, 48)),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal"],
  defaults: { space: 50 },
  controls: [
    { key: "space", label: "Space", type: "number", tab: "content", section: "Spacer", responsive: RESPONSIVE, units: ["px"], max: 500 },
  ],
};

export default SPACER_DEF;
