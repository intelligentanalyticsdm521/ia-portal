/**
 * families/f6-money/run.ts — ONE editable run, safe in a browser AND a mailbox.
 *
 * ── WHY THIS IS NOT `widgets/text.ts`'s `editRun` ─────────────────────────
 * `editRun` is the engine's editable run and every atomic widget uses it. It
 * always writes a `class` attribute, because on the canvas `.bx-slot:empty`
 * is what paints a placeholder (render.ts's own stylesheet).
 *
 * Three of this family's four widgets are ALSO offered in the newsletter, and
 * the email adapter's own guard — `checkEmailSafe`, and the suite that runs it
 * over every golden case — refuses a `class` attribute outright: *"there is a
 * class attribute with no stylesheet behind it"*. It is right. Gmail strips the
 * stylesheet and the class then styles nothing.
 *
 * So a family whose widgets reach both surfaces needs a run that carries the
 * class ONLY while the author is editing — which is the only time the canvas
 * stylesheet exists to answer it. A customer's copy, and the copy that goes in
 * an envelope, carry inline styles and nothing else.
 *
 * That is the whole of this module. Everything else — merge filling, escaping,
 * the `{{token}}` chips — is `render.ts`'s `t`, called through `fillText`, so
 * there is still exactly one place that decides what a word on a page is.
 */
import { esc } from "../../../esc";
import { type RenderContext } from "../../../render";
import { fillText } from "../../text";

/**
 * One editable run.
 *
 * @param path        the prop path the canvas writes back to (`data-edit`)
 * @param value       what is stored there
 * @param placeholder the grey hint, shown only while editing
 * @param style       inline CSS — the ONLY styling, so a mailbox keeps it
 * @param tag         the element; a heading passes `h3`, a price a `span`
 *
 * Empty and being read by a customer → nothing at all, so a field nobody
 * filled in leaves no gap on the page they sign. Empty and being edited → an
 * empty element with a placeholder, so there is something to click (D-01).
 */
export function run(
  path: string,
  value: unknown,
  placeholder: string,
  style: string,
  ctx: RenderContext,
  tag = "div",
): string {
  const text = String(value ?? "");
  const editing = ctx.mode === "edit";
  if (!text.trim() && !editing) return "";
  const cls = editing && !text.trim() ? ` class="bx-slot"` : "";
  return `<${tag}${cls} style="${style}" data-edit="${esc(path)}" `
    + `data-placeholder="${esc(placeholder)}">${fillText(text, ctx)}</${tag}>`;
}

/** A run of words that is NOT editable — a computed price, a struck-out was. */
export function say(value: unknown, style: string, ctx: RenderContext, tag = "div"): string {
  const text = String(value ?? "");
  if (!text.trim()) return "";
  return `<${tag} style="${style}">${fillText(text, ctx)}</${tag}>`;
}
