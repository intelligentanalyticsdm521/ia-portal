/**
 * builder/editedText.ts — reading back a run the author has just edited.
 *
 * ── THE DEFECT (found by a click-through, 2026-09-18) ─────────────────────
 * The canvas committed an edit with `el.innerText`, and **innerText is what
 * the screen SHOWS, not what the document SAYS**: it applies `text-transform`.
 * Every editable run that is styled uppercase therefore wrote its CAPITALISED
 * rendering back into the document the moment the caret left it.
 *
 * Clicking the property-plan row label in section 10 of the commercial snow &
 * ice agreement and clicking away stored `AREAS WE PLOW` where the template
 * ships `Areas we plow` — and the signed PDF printed that one row in capitals
 * while its neighbours stayed in sentence case. The same path covers a pricing
 * table's column headings (`.bx-table th`) and anything else that carries
 * `data-edit` under a transform.
 *
 * ── THE FIX, AT THE ONE PLACE THAT READS ──────────────────────────────────
 * Neutralise the transform for the length of the read and put back exactly the
 * inline value that was there. Every commit site in the builder reads through
 * this function; there is no second way to read an edited run.
 *
 * ── WHY NOT `textContent` ─────────────────────────────────────────────────
 * `textContent` is not transformed either, and it would have been one line —
 * but it also flattens a multi-line paragraph into one run of text: it does not
 * see the `<div>`/`<br>` a contentEditable paragraph is made of, so pressing
 * Return in a paragraph and clicking away would silently join the lines. The
 * line breaks are the reason `innerText` is the right read; the transform is
 * the only thing wrong with it, so the transform is the only thing changed.
 *
 * ── AND WHY THERE IS NO REPAIR-ON-OPEN ────────────────────────────────────
 * A document already saved with `AREAS WE PLOW` in it is left alone. We cannot
 * tell the capitals this defect wrote from the capitals an author typed on
 * purpose — a business whose brand voice is a shouted heading is not a bug —
 * and a migration that lower-cased both would be a second defect with a wider
 * blast radius than the first. The author retypes the one row; the builder
 * never writes it back again.
 *
 * Pure DOM, no React, no fetch — so all of it is `node --test`.
 */

/**
 * What this needs of an element: the text as laid out, and its inline style.
 *
 * Structural, not `HTMLElement`, for two reasons — a test can hand it a fake
 * whose `innerText` upper-cases the way a browser's does, and an element that
 * has no `style` at all (a detached node in a bare DOM) is a case the canvas
 * must survive rather than throw on.
 */
export interface EditableRun {
  innerText?: string;
  style?: { textTransform?: string };
}

/**
 * The text of an edited run, in the case the AUTHOR typed it.
 *
 * `text-transform` is switched off for the read and the inline value that was
 * found is put back — `""` when there was none, which is how a style
 * declaration spells "nothing inline here", so the element is left as it was.
 * The restore is in a `finally`, so a throw mid-read cannot leave the page
 * wearing an override the stylesheet never asked for.
 *
 * The transform is neutralised on the run ITSELF, which is enough: the property
 * says nothing about descendants of its own, so an inline `none` beats the
 * class rule that inherited down to this element's text. No editable run in the
 * builder has a transformed element nested inside it.
 */
export function readEditedText(el: EditableRun | null | undefined): string {
  const style = el?.style;
  if (!style || typeof style !== "object") return String(el?.innerText ?? "");
  const had = style.textTransform;
  try {
    style.textTransform = "none";
    return String(el?.innerText ?? "");
  } finally {
    style.textTransform = typeof had === "string" ? had : "";
  }
}

export default { readEditedText };
