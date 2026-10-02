/**
 * builder/runs.ts — THE TEXT PIPELINE, in a module that imports no renderer.
 *
 * ── WHY IT LEFT render.ts (B-168 wave 2, found by EXECUTING a family test) ─
 * D-168 item 5 moved `esc` out of `render.ts` into `builder/esc.ts` because a
 * family folder that imported it closed a real cycle. The same paragraph is
 * true of the rest of the text pipeline and nobody had run into it yet, because
 * on the override branch every family folder was still empty.
 *
 * The cycle, exactly:
 *
 *     families/index.ts → f3/button.ts → widgets/text.ts → render.ts
 *         → widgets/families/index.ts   ← already evaluating, so PARTIAL
 *     …and render.ts's body then reads `...FAMILY_RENDERED_KINDS`, a `const`
 *     from that half-built module:
 *
 *         ReferenceError: Cannot access 'FAMILY_RENDERED_KINDS' before
 *         initialization        (render.ts:260)
 *
 * `render.ts` says of its own `render → widgets → render` cycle that it
 * "crosses only hoisted function declarations, never a const read while a
 * module is still evaluating". D-168 item 5a then added exactly such a const
 * read, and the override handoff is honest that `render.ts` there was "asserted
 * by POSITION, not by execution". Running a family test is what found it.
 *
 * ── THE FIX, AND WHY IT IS THIS ONE ───────────────────────────────────────
 * The same one the seam already chose for `esc`: the pieces a widget needs move
 * into a module that imports nothing but `esc` and `merge`, and `render.ts`
 * re-exports them, so **every existing caller is unchanged and there is still
 * exactly one of each function**. This is not a second text mechanism; it is
 * the same one, in a module that cannot be half-built.
 *
 *   A family folder — and `widgets/text.ts`, which every widget file uses —
 *   imports `fill`, `t`, `paras`, `boldRuns` and `esc` from HERE or from
 *   `builder/esc`, and never from `builder/render`.
 *
 * FOR THE LANDER: `render.ts` now re-exports these four instead of declaring
 * them, and `widgets/text.ts` imports them from here. Nothing else changed, no
 * caller moved, and `test/families-f3-buttons-icons-panels.test.mjs` is what
 * goes red if the import is put back.
 */
import { esc } from "./esc";
import { fill, type MergeContext } from "./merge";

/**
 * What these functions need off a render context, and nothing more.
 *
 * Structural on purpose: `RenderContext` is declared in `render.ts` and
 * importing the type alone would be harmless, but importing the MODULE is what
 * this file exists to avoid, and a type import that someone later widens into a
 * value import is how the cycle comes back.
 */
export interface TextContext {
  mode: "view" | "edit";
  merge: MergeContext;
}

/**
 * AN UNFILLED `{{token}}` BECOMES A CHIP THE AUTHOR CAN SEE AND PRESS (D-03).
 *
 * Only while editing: a customer's copy must never carry our own scaffolding.
 */
export function tokenChips(escaped: string, ctx: TextContext): string {
  if (ctx.mode !== "edit" || escaped.indexOf("{{") < 0) return escaped;
  return escaped.replace(/\{\{\s*([a-zA-Z0-9_. ]+?)\s*\}\}/g, (whole, token) =>
    `<span class="bx-tok" data-token="${esc(String(token))}" title="Filled in for you when the document is sent. Click to say what goes here.">${whole}</span>`);
}

/** `**bold**` → `<strong>`. The one piece of mark-up a Text Editor understands. */
export function boldRuns(escaped: string): string {
  return escaped.indexOf("**") < 0
    ? escaped
    : escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/** Merge-fill, then escape, then chip. Never in another order. */
export function t(text: unknown, ctx: TextContext): string {
  return tokenChips(esc(fill(String(text ?? ""), ctx.merge, ctx.mode)), ctx);
}

/** Blank-line-separated text as paragraphs; one editable run while editing. */
export function paras(text: unknown, ctx: TextContext, editPath?: string): string {
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
