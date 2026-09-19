/**
 * builder/textRuns.ts — THE TEXT PIPELINE, in a module that imports no value
 * from `render.ts`.
 *
 * ── WHY IT MOVED (B-168, f4-moving wave 2, 2026-09-19) ────────────────────
 * `builder/esc.ts` exists because a family folder that imported `esc` from
 * `render.ts` pulled `widgets/families/index.ts` into its own module graph and
 * read that index's top-level tables while the family was still evaluating:
 *
 *     ReferenceError: Cannot access 'F4_MOVING' before initialization
 *
 * `esc` was not the whole of it. A widget that draws WORDS needs `editRun` and
 * `proseRun` from `widgets/text.ts`, and that module imported `t` and `paras`
 * out of `render.ts` — so the same cycle closed again the first time a family
 * declared a widget with a title. Found by RUNNING `families-f4-moving.test.mjs`,
 * not by reading it, on the first deepened Counter.
 *
 * So the four functions that turn an author's string into safe markup —
 * `t`, `paras`, `boldRuns`, `tokenChips` — live here, next to `esc`. They need
 * exactly two things and both are leaves: `esc` (imports nothing) and `fill`
 * (`builder/merge.ts`, a pure token filler). `RenderContext` is imported as a
 * TYPE, which is erased, so no value crosses.
 *
 * `render.ts` re-exports all of them, so every existing caller is unchanged and
 * there is still exactly ONE of each on the platform. Replace means delete: the
 * copies in `render.ts` are gone, not commented out.
 *
 * **A family folder imports these from HERE, never from `builder/render`.**
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
export function tokenChips(escaped: string, ctx: RenderContext): string {
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
