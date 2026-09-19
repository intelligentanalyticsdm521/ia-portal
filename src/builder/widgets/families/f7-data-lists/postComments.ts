/**
 * families/f7-data-lists/postComments.ts — **Post Comments**, Elementor
 * `post-comments`.
 *
 * One content section called "Comments". The machine file lists four keys in
 * it, and two of them are not fields a person fills in: `_skin` is hidden and
 * `skin_temp` is a select whose only option is the empty one. So the panel here
 * is the two that are real — where the comments come from, and which story when
 * it is not this one — and nothing is invented to fill the space.
 *
 * The widget has NO style section in Elementor either: the comment thread is
 * drawn by WordPress and the theme, which is why there is nothing on the Style
 * tab here.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, str } from "./shared";

export const POST_COMMENTS_DEF: FamilyWidgetDef = {
  kind: "post_comments",
  label: "Post Comments",
  description: "The comments people have left, and the box for leaving another.",
  icon: "MessageSquare",
  picture: pictureFrom(box(6, 8, 34, 16) + bar(11, 13, 22, 4) + box(24, 20, 34, 14) + bar(29, 25, 22, 4)),
  category: "General",
  builders: ["website"],
  tier: "pro",
  defaults: { source_type: "current_post", source_custom: "" },
  controls: [
    { key: "source_type", label: "Source", type: "select", tab: "content", section: "Comments", options: [
      { value: "current_post", label: "Current Post" }, { value: "custom", label: "Custom" }] },
    {
      key: "source_custom", label: "Search & Select", type: "number", tab: "content", section: "Comments",
      help: "Only when the comments come from a different story.",
    },
  ],
};

export const renderPostComments: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const row = (name: string, line: string) => `<div class="bx-f7-comment" style="display:flex;gap:10px;margin-bottom:10px">
    <span style="width:30px;height:30px;border-radius:999px;background:#E2E8F0;flex:0 0 auto"></span>
    <span style="flex:1 1 auto;min-width:0"><strong style="display:block;font-size:12px">${esc(name)}</strong>
    <span class="bx-p" style="font-size:12px;color:#5A7A8A">${esc(line)}</span></span></div>`;
  return `<div class="bx-f7-comments">`
    + `<div class="bx-h bx-h3" style="margin:0 0 10px">Comments</div>`
    + row("The first reader", "What somebody wrote about this story shows here.")
    + row("The next one", "And the reply under it.")
    + `<div style="border:1px solid #CBD5E1;border-radius:6px;height:56px;margin-top:10px"></div>`
    + `<span class="bx-button" style="background:${esc(ctx.accent)};margin-top:8px;display:inline-block">Post Comment</span>`
    + `</div>`
    + fromTheSite(ctx.mode, str(p.source_type) === "custom"
      ? "The comments come from the story you name above."
      : "The comments of whichever story is being read show here.");
};
