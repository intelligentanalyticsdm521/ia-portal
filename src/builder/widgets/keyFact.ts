/**
 * builder/widgets/keyFact.ts — ONE SHORT ANSWER.
 *
 * D-156: `key_facts` was a widget holding two to ten rows behind a "How many
 * facts?" control. Four facts across the top of an agreement is four of these
 * in a row container — each one selectable, draggable and deletable, which is
 * what "Agreement at a glance" always looked like to the person reading it.
 *
 * The VALUE takes merge tags, which is the whole point of the widget: "Service
 * term" / "{{contract.start_date}} – {{contract.end_date}}" fills itself in,
 * and while the author is editing, an unfilled tag shows as a chip rather than
 * as words nobody typed (render.ts `tokenChips`, reached through text.ts).
 */
import type { Widget } from "../model";
import type { RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { editRun } from "./text";

export function renderKeyFact(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const label = String(p.label ?? "");
  const value = String(p.value ?? "");
  if (ctx.mode !== "edit" && !label.trim() && !value.trim()) return "";
  return `<div class="bx-fact" style="display:flex;gap:10px;align-items:baseline;padding:3px 0">
    ${editRun("label", label, "bx-fact-k", "What is it?", ctx, "span")}
    ${editRun("value", value, "bx-fact-v", "The answer — or pick a merge tag", ctx, "span")}
  </div>`;
}

export const KEY_FACT_DEF: WidgetDef = {
  kind: "key_fact",
  label: "Key fact",
  description: "One short answer — the term, the trigger, who to call. Put four in a row across the top.",
  task: "Customer & property",
  icon: "Rows2",
  picture: pictureFrom(bar(8, 16, 18) + bar(32, 16, 24)),
  category: "Document",
  // WHERE IT MAY BE USED (catalogue F.1). D-156 slice one shipped these as
  // PROPOSAL-only; the panes that can actually DRAW them now offer them too.
  //
  // NOT `website`: the website publish path (arion `ELEMENTOR_WIDGETS`) has no
  // emitter for this kind, and an unknown kind makes the whole page publish
  // REFUSE by name. Offering it there would be a widget an author can place
  // and never publish, which is the defect this pass exists to close. The
  // catalogue asks for it on a website; it needs the emitter first, and the
  // handoff carries the ask.
  adapters: ["proposal", "email", "landing"],
  defaults: { label: "", value: "" },
  controls: [
    { key: "label", label: "What is it?", type: "text" },
    { key: "value", label: "The answer", type: "merge", help: "Type it, or use a merge tag so it fills itself in." },
  ],
};
