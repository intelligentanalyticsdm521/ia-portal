/**
 * builder/widgets/text.ts — the text pipeline every atomic widget draws with.
 *
 * NOT a second renderer. `fillText` and `proseRun` are thin names over
 * render.ts's own `t` and `paras`, which are the functions that fill merge
 * tags, escape the result and turn an unfilled `{{token}}` into a chip the
 * author can see. A widget module that escaped its own strings would be the
 * second text mechanism this rebuild exists to delete — and the first one to
 * forget the chips, or the escaping.
 *
 * `editRun` is the one pattern every atomic widget needs and the engine did
 * not export: a run of text that is ALWAYS on the page while editing, with a
 * placeholder, so an empty field can be clicked into. An empty run that is
 * only drawn once it has words is unreachable (D-01, the worst moment of the
 * 2026-09-16 walk), and each new widget would have re-invented the fix.
 */
import { esc, paras as enginePara, t as engineFill, type RenderContext } from "../render";

/** Merge-fill, then escape. Never the other way round. */
export function fillText(value: unknown, ctx: RenderContext): string {
  return engineFill(value, ctx);
}

/** Blank-line-separated text as paragraphs; one editable run while editing. */
export function proseRun(
  path: string,
  value: unknown,
  cls: string,
  _placeholder: string,
  ctx: RenderContext,
): string {
  const html = enginePara(value, ctx, path);
  if (!html) return "";
  return `<div class="${esc(cls)}">${html}</div>`;
}

/**
 * One editable line.
 *
 * Empty and being edited → an empty element with a placeholder, so there is
 * something to click. Empty and being read by a customer → nothing at all, so
 * a field nobody filled in leaves no gap on the page they sign.
 */
export function editRun(
  path: string,
  value: unknown,
  cls: string,
  placeholder: string,
  ctx: RenderContext,
  tag = "div",
): string {
  const text = String(value ?? "");
  if (!text.trim() && ctx.mode !== "edit") return "";
  const empty = text.trim() ? "" : " bx-slot";
  return `<${tag} class="${esc(cls)}${empty}" data-edit="${esc(path)}" data-placeholder="${esc(placeholder)}">${fillText(text, ctx)}</${tag}>`;
}
