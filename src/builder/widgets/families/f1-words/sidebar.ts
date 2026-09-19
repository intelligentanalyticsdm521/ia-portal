/**
 * f1-words/sidebar.ts — Elementor's **Sidebar**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `sidebar`: title "Sidebar",
 * group `general`, icon `eicon-sidebar`, ONE panel section called "Sidebar"
 * holding ONE control, `sidebar`, labelled "Choose Sidebar".
 *
 * ── WHY IT IS HERE ────────────────────────────────────────────────────────
 * `BUILDER_FULL_WIDGET_PLAN_2026-09-19` §A row 70 marks it `n/a`.
 * `BUILDER_OFFERS_2026-09-19.json` lists `sidebar` under
 * `website.elementor_free`, and the offer file wins. Website only: a sidebar is
 * a band of the published site's own widgets, and there is no such thing in a
 * proposal, an email or a social graphic.
 *
 * ── ONE DEVIATION, WRITTEN DOWN RATHER THAN HIDDEN ────────────────────────
 * Elementor's control is a SELECT whose options are the sidebars registered on
 * that WordPress install — the machine file records the control with an empty
 * option list, because the scrape ran on a site with none. We have no route
 * that asks a client's site what sidebars it has, so a select here would be a
 * dropdown with nothing in it, which tells the author their site is broken. It
 * is a TEXT field with Elementor's own label and a sentence saying what to
 * type. The moment arion can list a site's sidebars this becomes a select with
 * the same key and the same label, and nothing stored changes.
 * (Handoff: "What I could NOT verify".)
 *
 * No JavaScript. The published page draws the sidebar server-side.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

export function sidebarId(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  return str(p.sidebar).trim();
}

export function renderSidebar(w: Widget, ctx: RenderContext): string {
  const id = sidebarId(w.props);
  if (ctx.mode !== "edit") {
    /* The published site puts the sidebar's own widgets here. A preview that
       guessed at them would show the author something nobody will see. */
    return "";
  }
  const said = id
    ? `Sidebar: ${id}`
    : "Pick a sidebar — type its id, for example sidebar-1.";
  return `<div class="bx-sidebar-slot" style="border:1px dashed #CBD5E1;border-radius:6px;padding:10px 12px;color:#64748B;font-size:11px">`
    + `<span data-edit="sidebar" data-placeholder="sidebar-1">${esc(said)}</span>`
    + `<div class="bx-card-note">The widgets in this sidebar show here on your published site.</div>`
    + `</div>`;
}

export const SIDEBAR_DEF: FamilyWidgetDef = {
  kind: "sidebar",
  label: "Sidebar",
  description: "Drops one of your published site's sidebars into this spot.",
  icon: "PanelRight",
  picture: pictureFrom(box(5, 7, 36, 26) + box(45, 7, 14, 26) + bar(9, 13, 26) + bar(9, 21, 20)),
  category: "General",
  builders: ["website"],
  tier: "free",
  defaults: { sidebar: "" },
  controls: [
    {
      key: "sidebar",
      label: "Choose Sidebar",
      type: "text",
      tab: "content",
      section: "Sidebar",
      help: "The sidebar's id on your published site, for example sidebar-1.",
    },
  ],
};
