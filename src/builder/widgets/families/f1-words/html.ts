/**
 * f1-words/html.ts — Elementor's **HTML**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` → `html`: title "HTML",
 * group `general`, ONE control in ONE section:
 *
 *   html  (code)  "HTML Code"   section "HTML Code"
 *
 * So this widget is at full parity with Elementor's — one of one — and the
 * deepening it needed was not a control at all. It was a MAILBOX.
 *
 * ── WHAT THIS REPLACES, AND THE GAP IT CLOSES ─────────────────────────────
 * `src/builder/widgets/html.ts` declared the same kind for `website` and
 * `landing` only. `BUILDER_OFFERS_2026-09-19.json` gives HTML to the
 * NEWSLETTER as well, and F1's first wave wrote the gap down (§6.4): the tile
 * would be on the newsletter panel and the canvas would draw *"this part needs
 * a newer version of the builder"*. Same kind, so `mergeWidgetDefs` drops the
 * old definition; the third builder and the mailbox renderer are the new part,
 * and LUMEN gains the row that actually SENDS it.
 *
 * ── WHY THE MARKUP IS NOT SANITISED ───────────────────────────────────────
 * It is the author's own, on their own page, and a sanitiser here would be a
 * silent second opinion about what they meant — the thing they pasted would
 * stop working with nothing on screen saying why. The panel's `code` control
 * draws a LIVE PREVIEW under the box with the sentence that this goes on the
 * page exactly as typed, which is the confirmation, at the moment they are
 * looking at it. Elementor does exactly the same.
 *
 * An empty box draws a placeholder on the canvas and NOTHING on a published
 * page, so a widget dropped and not filled leaves no gap for a visitor.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { EmailRenderContext, FamilyWidgetDef } from "../types";
import { str } from "./words";

/** The markup on this widget, exactly as the author typed it. */
export function htmlOf(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  /* `html` is Elementor's own key for the one control. `code` is read too:
     that is what a box of this shape is called in half the editors on earth,
     and a paste into the wrong key is not the author's fault. */
  return str(p.html || p.code);
}

/**
 * The widget's markup, for ANY surface.
 *
 * Takes the mode rather than a whole context, because the mailbox and the
 * landing page carry their own context types and a cast between them would be
 * a place for a lie to live. One function, one answer, every caller.
 */
export function htmlBody(props: Record<string, unknown> | undefined | null, editing: boolean): string {
  const code = htmlOf(props);
  if (!code.trim()) {
    return editing
      ? `<div class="bx-html bx-html-empty" data-html-empty="1">Paste your own HTML — it goes on the page exactly as you type it.</div>`
      : "";
  }
  return editing ? `<div class="bx-html" data-html-preview="1">${code}</div>` : code;
}

export function renderHtml(w: Widget, ctx: RenderContext): string {
  return htmlBody(w.props, ctx.mode === "edit");
}

/**
 * THE MAILBOX HALF — the gap F1's first wave found and could not close.
 *
 * A mailbox is built out of tables, so the author's markup goes in a cell
 * rather than loose in the body: Outlook drops a bare `<div>` run that is not
 * inside a table on some templates, and a newsletter that silently loses a
 * block is worse than one that never offered it. Nothing here touches the
 * markup itself.
 */
export function emailHtml(w: Widget, ctx: EmailRenderContext): string {
  const editing = ctx.mode === "edit";
  const code = htmlOf(w.props);
  if (!code.trim()) {
    return editing
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"`
        + ` style="margin:0 0 16px 0;"><tr><td style="padding:0;font-size:12px;color:#64748B;">`
        + `Paste your own HTML — it goes in the email exactly as you type it.</td></tr></table>`
      : "";
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"`
    + ` style="margin:0 0 16px 0;"><tr><td style="padding:0;">${code}</td></tr></table>`;
}

export const HTML_DEF: FamilyWidgetDef = {
  kind: "html",
  label: "HTML",
  description: {
    website: "Paste your own HTML. It goes on the page exactly as you type it.",
    landing: "Paste your own HTML. It goes on the page exactly as you type it.",
    email: "Paste your own HTML. It goes in the email exactly as you type it.",
  },
  icon: "Code",
  picture: pictureFrom(box(5, 6, 54, 29)
    + `<path d="M18 15l-5 5 5 5M46 15l5 5-5 5" stroke="#94A3B8"/>`
    + bar(25, 19, 14, 3)),
  category: "General",
  /* The offer file: `website.elementor_free`, `landing.elementor_free`,
     `newsletter.elementor`. NOT the proposal — that becomes a PDF, and
     arbitrary markup on paper prints as nothing or as something a customer
     signs without either side having seen it. The offer file agrees: `html` is
     under the proposal's `not_offered_because_paper_cannot_do_them`. */
  builders: ["website", "landing", "newsletter"],
  /* Free on every plan: it is part of the free page engine, so a Lite site
     publishes and draws it exactly as a Business one does. */
  tier: "free",
  defaults: { html: "" },
  controls: [
    {
      key: "html", label: "HTML Code", type: "code", tab: "content", section: "HTML Code",
      help: "This is code. It is put on your page exactly as you type it, so check it before you publish.",
    },
  ],
};
