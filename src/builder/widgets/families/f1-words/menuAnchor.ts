/**
 * f1-words/menuAnchor.ts — Elementor's **Menu Anchor**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` → `menu-anchor`: title
 * "Menu Anchor", group `general`, section "Menu Anchor", TWO controls:
 *
 *   anchor       (text)   "The ID of Menu Anchor."
 *   anchor_note  (alert)  a static note, not a value
 *
 * Elementor's `anchor_note` is a `Controls_Manager::RAW_HTML` alert — a
 * sentence the panel prints, with nothing stored behind it. Our panel has no
 * alert control, and inventing one to hold a sentence would be a control that
 * stores nothing; the sentence is the `help` line under the field instead,
 * which is where the panel already puts a widget's plain words.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * The definition in `widgets/pageOnly.ts`. Same kind, so `mergeWidgetDefs`
 * puts this one in its place; nothing is deleted out of a file four families
 * share.
 *
 * ── THE ONE THING THAT WAS ACTUALLY BROKEN ────────────────────────────────
 * F1's first wave wrote: *"`menu_anchor` — no arion emitter at all — it is on
 * the panel and cannot be published"*. It has one now
 * (`arion-api/lib/websiteBuilder/families/f1-words/emitters.js`), and the
 * family test publishes it and reads the key back.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { str } from "./words";

/**
 * The anchor, cleaned to what a URL fragment may hold.
 *
 * A space or a `#` typed into the box would produce an id no link can reach,
 * and the author would have no way of knowing: the marker is invisible on the
 * page by design. One cleaner, used by the canvas AND by the emitter's test.
 */
export function anchorId(props: Record<string, unknown> | undefined | null): string {
  return str((props as any)?.anchor).trim().replace(/[^A-Za-z0-9_-]/g, "");
}

export function renderMenuAnchor(w: Widget, ctx: RenderContext): string {
  const anchor = anchorId(w.props);
  if (!anchor) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Give this spot a one-word name so a menu link can jump to it.</div>` : "";
  }
  return ctx.mode === "edit"
    ? `<div class="bx-anchor" style="border:1px dashed #CBD5E1;border-radius:6px;padding:6px 10px;color:#64748B;font-size:11px">Menu anchor: #${esc(anchor)}</div>`
    : `<span id="${esc(anchor)}" class="bx-anchor"></span>`;
}

export const MENU_ANCHOR_DEF: FamilyWidgetDef = {
  kind: "menu_anchor",
  label: "Menu Anchor",
  description: "An invisible marker a menu link can jump straight to.",
  icon: "Anchor",
  picture: pictureFrom(`<path d="M32 10v20M24 24a8 8 0 0 0 16 0" stroke="#94A3B8"/><circle cx="32" cy="9" r="3" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  /* The offer file: `menu-anchor` under `website.elementor_free` and
     `landing.elementor_free`. */
  builders: ["website", "landing"],
  tier: "free",
  defaults: { anchor: "" },
  controls: [
    {
      key: "anchor", label: "The ID of Menu Anchor.", type: "text", tab: "content", section: "Menu Anchor",
      help: "One word, no spaces. A menu link to #that word jumps here.",
    },
  ],
};
