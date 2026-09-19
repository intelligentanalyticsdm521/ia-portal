/**
 * families/f7-data-lists/template.ts — **Template**, Elementor `template`.
 *
 * One content section called "Template" holding one control, `template_id`.
 * That is the whole widget in the machine file, and it is the whole widget
 * here.
 *
 * ── WHAT IS HONEST ABOUT THIS ONE, AND WHAT IS NOT YET ────────────────────
 * Elementor draws `template_id` as a SEARCHABLE PICKER of the saved templates
 * on that site. We have saved templates too (`templateLibraryModel.ts`), but
 * wiring their picker into a widget panel is work in the shell, and the shell
 * is not this family's to open. So the control is the id itself, with a plain
 * sentence saying where to find it, and the missing picker is written in the
 * handoff rather than papered over with a select that has nothing in it.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, str } from "./shared";

export const TEMPLATE_DEF: FamilyWidgetDef = {
  kind: "template",
  label: "Template",
  description: "Drop in a piece you saved earlier, so one change updates it everywhere it is used.",
  icon: "Files",
  picture: pictureFrom(box(8, 6, 40, 28) + bar(13, 12, 26, 4) + bar(13, 21, 20, 4) + box(16, 12, 40, 22)),
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: { template_id: 0 },
  controls: [
    {
      key: "template_id", label: "Choose Template", type: "number", tab: "content", section: "Template",
      help: "The number shown beside the piece in your saved templates.",
    },
  ],
};

export const renderTemplate: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const id = Number(p.template_id) || 0;
  if (!id && ctx.mode !== "edit") return "";
  return `<div class="bx-f7-template" style="border:1px dashed #CBD5E1;border-radius:8px;padding:14px;text-align:center">`
    + `<span class="bx-p" style="color:#5A7A8A;font-size:12px">${
      id ? `Saved piece ${esc(String(id))} goes here` : "No saved piece chosen yet"}</span></div>`
    + fromTheSite(ctx.mode, "Whatever you saved shows in its place on the published page.");
};
