/**
 * builder/prose.ts — MERGE-FILL, ESCAPE, CHIPS AND PARAGRAPHS, in a leaf module.
 *
 * ── WHY IT LEFT render.ts (B-168, landing) ─────────────────────────
 * `render.ts` imports `widgets/families/index.ts`, and that index reads every
 * family at module top level. So ANY value a family folder imports from
 * `render.ts` closes a cycle, and entering a family first — which is what a
 * family test does — dies on
 *
 *     ReferenceError: Cannot access 'F1_WORDS' before initialization
 *
 * `esc` moved out for that reason (`esc.ts`) and the walk after it (`walk.ts`).
 * These four are the third and last: `widgets/text.ts` is the text pipeline
 * every widget draws with, F1's Blockquote imports it, and it reached back into
 * `render.ts` for `t` and `paras`.
 *
 * NOT a second text mechanism: `render.ts` re-exports all of these, so every
 * caller that already says `import { paras } from "./render"` is unchanged.
 * There is one filler, one escaper, one chip and one paragraph rule.
 */
import { esc } from "./esc";
import { fill } from "./merge";
import type { RenderContext } from "./render";

/** Merge-fill, then escape. Never the other way round. */
export function t(text: unknown, ctx: RenderContext): string {
  return tokenChips(esc(fill(String(text ?? ""), ctx.merge, ctx.mode)), ctx);
}

/**
 * AN UNFILLED MERGE FIELD IS A SLOT, NOT A WORD (D-03, §11.10).
 *
 * §9 of the 2026-09-16 walk: "The only way through is to work out for yourself
 * that you must click the sentence on the page, select the whole paragraph, and
 * retype it with your numbers in place of the braces. I did that four times."
 * Four merge fields destroyed, because {{contract.start_date}} looked exactly
 * like the words around it.
 *
 * EDIT MODE ONLY, and AFTER escaping — `esc` does not touch braces, so the
 * pattern is still there to find and nothing already escaped can be undone. A
 * customer's copy, a PDF and every stored golden are byte-identical to before,
 * which is why this is safe to put in the one renderer.
 *
 * The chip is a <span> inside a contentEditable run, so `innerText` reads back
 * {{contract.start_date}} exactly as it was: the model cannot tell the
 * difference, and the author can.
 */
function tokenChips(escaped: string, ctx: RenderContext): string {
  if (ctx.mode !== "edit" || escaped.indexOf("{{") < 0) return escaped;
  return escaped.replace(/\{\{\s*([a-zA-Z0-9_. ]+?)\s*\}\}/g, (whole, token) =>
    `<span class="bx-tok" data-token="${esc(String(token))}" title="Filled in for you when the document is sent. Click to say what goes here.">${whole}</span>`);
}

/**
 * `**LABEL**` → **LABEL** (D-165).
 *
 * The shared vocabulary says a key fact becomes *"Text Editor (label bold +
 * value)"*, and this is the whole of what makes that true. Two asterisks is the
 * one piece of mark-up the Text Editor understands, because a short answer —
 * "**Service term** 1 November – 30 April" — is a label and a value on one
 * line, and it reads as one line on every surface: a page, a mailbox and a
 * printed PDF.
 *
 * ── AFTER ESCAPING, ALWAYS ────────────────────────────────────────────────
 * `esc` has already turned `<` into `&lt;`, so the only thing left that can
 * match is a pair of asterisks the author typed. The rule can therefore emit
 * `<strong>` without any chance of an author's text becoming markup — the same
 * discipline `tokenChips` runs on, for the same reason.
 *
 * An unpaired `**` is left exactly as typed. Somebody writing "2 ** 3" gets
 * "2 ** 3", because guessing at half a pair is how a document grows a word
 * nobody wrote.
 */
export function boldRuns(escaped: string): string {
  return escaped.indexOf("**") < 0
    ? escaped
    : escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/** Plain text with blank lines between paragraphs → <p> runs. */
export function paras(text: unknown, ctx: RenderContext, editPath?: string): string {
  const filled = fill(String(text ?? ""), ctx.merge, ctx.mode);
  const attr = editPath ? ` data-edit="${esc(editPath)}"` : "";
  if (!filled.trim()) {
    return ctx.mode === "edit"
      ? `<p class="bx-p bx-empty"${attr} data-placeholder="Type here…"></p>`
      : "";
  }
  const blocks = filled.split(/\n{2,}/).map((p) => boldRuns(tokenChips(esc(p.trim()), ctx)).replace(/\n/g, "<br/>"));
  // In edit mode the whole run is ONE editable element — splitting it into
  // several <p data-edit> would make the author's second paragraph overwrite
  // the first when it is read back.
  if (ctx.mode === "edit") return `<div class="bx-prose"${attr}>${blocks.map((b) => `<p class="bx-p">${b}</p>`).join("")}</div>`;
  return blocks.map((b) => `<p class="bx-p">${b}</p>`).join("");
}
