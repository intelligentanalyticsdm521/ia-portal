/**
 * builder/widgets/html.ts — PASTE YOUR OWN HTML.
 *
 * Catalogue point 9, and D.2 behind it: of the 64 page bodies on the estate,
 * **58 are one `html` widget and nothing else**. It is the most-used content
 * widget there is, it is FREE on every website plan, and the website emitter
 * has published it since stream D (`arion-api lib/websiteBuilder/
 * elementorWidgets.js`) — but nobody could ADD one, because there was no such
 * kind in this registry. A widget the server can publish and a person cannot
 * reach is half a widget.
 *
 * ── WHERE IT IS OFFERED, AND WHERE IT IS NOT ──────────────────────────────
 * The website and the landing page, and those two only. Both are HTML pages
 * where a pasted embed is exactly what the author means. A proposal is a
 * document that becomes a PDF and an email is drawn with tables a mailbox will
 * accept — arbitrary markup on either is markup that prints as nothing, or as
 * something a customer signs without either side having seen it.
 *
 * ── IT IS CODE, AND IT SAYS SO WHERE THAT MATTERS ─────────────────────────
 * The control is a `code` box — the catalogue's own control type — and the
 * Inspector draws it with a LIVE PREVIEW underneath and the plain sentence
 * that this goes on the page exactly as typed. That is the confirmation, at
 * the moment the author is looking at the thing: a modal on insert would be a
 * second interception at the insert seam, which is the mechanism the
 * integration spent its day deleting (`buildAll`, `onPlaceSection`).
 *
 * An empty box draws the placeholder on the canvas and NOTHING on a published
 * page, so a widget dropped and not filled leaves no gap for a visitor.
 */
import type { Widget } from "../model";
import { esc } from "../esc";
import { type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom } from "../pictures";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The markup on this widget, exactly as the author typed it. */
export function htmlOf(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  // `html` is the catalogue's own key for the free HTML widget's one control.
  // `code` is read too: that is what a box of this shape is called in half the
  // editors on earth, and a paste into the wrong key is not the author's fault.
  return str(p.html || p.code);
}

/**
 * The widget's markup, for ANY surface.
 *
 * Takes the mode rather than a whole context, because the landing renderer
 * carries its own context type and a cast between the two would be a place for
 * a lie to live. One function, one answer, both callers.
 */
export function htmlBody(props: Record<string, unknown> | undefined | null, editing: boolean): string {
  const code = htmlOf(props);
  if (!code.trim()) {
    return editing
      ? `<div class="bx-html bx-html-empty" data-html-empty="1">Paste your own HTML — it goes on the page exactly as you type it.</div>`
      : "";
  }
  // The author's markup, on the page, unchanged. That is the whole widget: a
  // sanitiser here would be a silent second opinion about what they meant, and
  // the thing they pasted would stop working with nothing on screen saying why.
  // On the CANVAS it is wrapped so the outline, the handle and the drop lines
  // have something of their own to hang on.
  return editing ? `<div class="bx-html" data-html-preview="1">${code}</div>` : code;
}

export function renderHtml(w: Widget, ctx: RenderContext): string {
  return htmlBody(w.props, ctx.mode === "edit");
}

export const HTML_DEF: WidgetDef = {
  kind: "html",
  label: "HTML",
  description: "Paste your own HTML. It goes on the page exactly as you type it.",
  icon: "Code",
  picture: pictureFrom(box(5, 6, 54, 29)
    + `<path d="M18 15l-5 5 5 5M46 15l5 5-5 5" stroke="#94A3B8"/>`
    + bar(25, 19, 14, 3)),
  category: "General",
  adapters: ["website", "landing"],
  // Free on every plan: it is part of the free page engine, so a Lite site
  // publishes and draws it exactly as a Business one does.
  tier: "free",
  defaults: { html: "" },
  controls: [
    {
      key: "html", label: "HTML Code", type: "code", tab: "content", section: "HTML",
      help: "This is code. It is put on your page exactly as you type it, so check it before you publish.",
    },
  ],
};
