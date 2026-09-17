/**
 * builder/adapters/email/emailDoc.ts — everything that was an email before
 * this builder existed, read back into the one model.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §1 ("the SPARK email template builder
 * (server side) … the seed of the email adapter") and the instruction it grew
 * into: "the server-side lumen.message_template.blocks_json builder becomes
 * the same model (migrate its `columns` blocks into the new model additively;
 * OLD ROWS STILL RENDER)."
 *
 * Three shapes reach the builder and one leaves it:
 *
 *   ┌ lumen.message_template.blocks_json  { blocks:[…], settings:{…} }  ─┐
 *   ├ lumen.newsletter_issue.content_html  HTML written in the old       ├→ BuilderDocument
 *   │                                      form-and-TipTap editor        │
 *   └ lumen.campaign.content_html          the composer's prose + CTA    ─┘
 *
 * NOTHING IS REWRITTEN IN PLACE. An old row keeps its own columns and keeps
 * rendering exactly as it does today (LUMEN's emailBuilder still draws a
 * legacy block tree; the send path still mails content_html). The upgrade
 * happens when somebody OPENS the row in the builder, and only what they then
 * save is written back — which is migration 166's rule, kept.
 *
 * PURE: no React, no DOM, no fetch. The HTML reader is a small tag scanner
 * rather than DOMParser precisely so `node --test` can drive it.
 */
import {
  deserialise, emptyDocument, makeSection, makeWidget,
  type BuilderDocument, type Section, type Widget,
} from "../../model";
import { renderEmailDocument, renderEmailText, type EmailBusiness, type EmailRenderContext } from "./emailRender";
import { ensureFooter, headerSection } from "./emailTemplates";
import { freezeOnSend, resolveCatalogCard } from "../../widgets";

const oneCol = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({
    ...extra,
    columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }],
    layout: 1,
  });

/* ══════════════════════════════════════════════════════════════════════════
   1. The server-side block tree
   ══════════════════════════════════════════════════════════════════════════ */

/** True for `{ blocks: [...] }` — the shape emailBuilder.js has always taken. */
export function isLegacyBlockTree(value: unknown): boolean {
  const v = typeof value === "string" ? safeParse(value) : value;
  return !!v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as any).blocks);
}

/** True for a v2 builder document. */
export function isBuilderDocument(value: unknown): boolean {
  const v = typeof value === "string" ? safeParse(value) : value;
  return !!v && typeof v === "object" && !Array.isArray(v)
    && Number((v as any).v) === 2 && Array.isArray((v as any).sections);
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * A legacy block tree, as sections.
 *
 * The one interesting case is `columns`, the only layout the old builder had:
 * `{ type:"columns", columns:[{blocks:[…]},{blocks:[…]}] }`. It becomes a
 * SECTION with that many columns — which is why this is a migration and not a
 * translation. Everything else is one widget in a one-column section, in the
 * order it was written.
 *
 * An `html` block has no home in the restricted email set, so its markup is
 * read the same way an old newsletter body is read (see §2 below) rather than
 * being dropped on the floor.
 */
export function upgradeEmailBlocks(tree: unknown): BuilderDocument {
  const v: any = (typeof tree === "string" ? safeParse(tree) : tree) || {};
  const settings = v.settings && typeof v.settings === "object" ? v.settings : {};
  const doc = emptyDocument({
    style: "newsletter",
    ...(settings.accent ? { accent: String(settings.accent) } : {}),
    ...(settings.fontFamily ? { bodyFont: String(settings.fontFamily).split(",")[0].trim() } : {}),
  });
  doc.sections = blocksToSections(Array.isArray(v.blocks) ? v.blocks : []);
  return doc;
}

function blocksToSections(blocks: any[]): Section[] {
  const out: Section[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "columns") {
      const cols: any[] = Array.isArray(b.columns) ? b.columns.slice(0, 3) : [];
      if (!cols.length) continue;
      const layout = Math.max(1, Math.min(3, cols.length)) as 1 | 2 | 3;
      out.push(makeSection({
        label: "Columns",
        layout,
        columns: cols.map((c) => ({
          id: `c_${Math.random().toString(36).slice(2, 8)}`,
          widgets: (Array.isArray(c?.blocks) ? c.blocks : []).flatMap(blockToWidgets),
        })),
      }));
      continue;
    }
    const widgets = blockToWidgets(b);
    if (widgets.length) out.push(oneCol(widgets));
  }
  return out;
}

function blockToWidgets(b: any): Widget[] {
  if (!b || typeof b !== "object") return [];
  switch (b.type) {
    case "heading":
      return [makeWidget("heading", {
        text: String(b.text ?? ""),
        level: Number(b.level) === 1 ? "Page title" : Number(b.level) >= 3 ? "Sub-section" : "Section",
        align: cap(b.align),
        ...(b.color ? { colour: String(b.color) } : {}),
      })];
    case "paragraph":
      // `html` was the richer of the two fields and the one the old editor
      // actually wrote; `text` was its fallback. Read the richer one.
      return [makeWidget("paragraph", { text: b.html ? htmlToText(String(b.html)) : String(b.text ?? ""), align: cap(b.align) })];
    case "image":
      return [makeWidget("image", {
        src: String(b.src ?? ""), alt: String(b.alt ?? ""),
        width: Number(b.width) || undefined, align: cap(b.align, "Centre"), url: b.url ? String(b.url) : "",
      })];
    case "button":
      return [makeWidget("button", {
        label: String(b.text ?? ""), url: String(b.url ?? ""),
        style: "Solid", align: cap(b.align, "Centre"),
        ...(b.background ? { colour: String(b.background) } : {}),
        ...(Number.isFinite(Number(b.border_radius)) ? { radius: Number(b.border_radius) } : {}),
        ...(b.width === "full" ? { width: "full" } : {}),
      })];
    case "divider":
      return [makeWidget("divider", { style: "Line", ...(b.color ? { colour: String(b.color) } : {}) })];
    case "spacer":
      return [makeWidget("spacer", { height: Number(b.height) || 24 })];
    case "html":
      return htmlToWidgets(String(b.html ?? ""));
    default:
      return [];
  }
}

function cap(v: unknown, dflt = "Left"): string {
  const s = String(v ?? "").toLowerCase();
  if (s === "center" || s === "centre") return "Centre";
  if (s === "right") return "Right";
  if (s === "left") return "Left";
  return dflt;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. An email body that is only HTML
   ══════════════════════════════════════════════════════════════════════════ */

const BLOCK_RE = /<(h[1-6]|p|ul|ol|blockquote|hr|figure|div)\b[^>]*>([\s\S]*?)<\/\1>|<(hr|img)\b([^>]*)\/?>/gi;

/**
 * Read an HTML body back into widgets.
 *
 * A deliberately SMALL scanner over the tags the old editors could produce —
 * TipTap writes h1–h3, p, ul/ol, blockquote, img and hr, and nothing else. It
 * is not a parser and does not try to be: anything it does not recognise
 * becomes a paragraph of the words inside it, which is the failure mode that
 * loses the least.
 *
 * INLINE LINKS AND BOLD SURVIVE. The renderer's `inlineSafe` allowlist lets
 * `<a href>`, `<strong>`, `<em>` and `<br>` back out the other side, so an
 * issue written last year opens with its links still links. That is the whole
 * reason the allowlist exists.
 */
export function htmlToWidgets(html: string): Widget[] {
  const src = String(html || "");
  const widgets: Widget[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  let matchedAnything = false;

  while ((m = BLOCK_RE.exec(src))) {
    matchedAnything = true;
    const tag = (m[1] || m[3] || "").toLowerCase();
    const inner = m[2] ?? "";
    const attrs = m[4] ?? "";

    if (tag === "hr") { widgets.push(makeWidget("divider", { style: "Line" })); continue; }
    if (tag === "img") {
      const src2 = attr(attrs, "src");
      if (src2) widgets.push(makeWidget("image", { src: src2, alt: attr(attrs, "alt"), align: "Centre" }));
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      widgets.push(makeWidget("heading", {
        text: inlineToText(inner),
        level: level === 1 ? "Page title" : level >= 3 ? "Sub-section" : "Section",
      }));
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => inlineToText(x[1]));
      if (items.length) widgets.push(makeWidget("list", { items }));
      continue;
    }
    if (tag === "blockquote") {
      const text = inlineToText(inner);
      if (text.trim()) widgets.push(makeWidget("testimonial", { quote: text, attribution: "", rating: 0 }));
      continue;
    }
    // p, figure, div
    const img = /<img\b([^>]*)>/i.exec(inner);
    if (img && attr(img[1], "src")) {
      widgets.push(makeWidget("image", {
        src: attr(img[1], "src"), alt: attr(img[1], "alt"),
        caption: inlineToText(inner.replace(/<img\b[^>]*>/i, "")), align: "Centre",
      }));
      continue;
    }
    const text = inlineToText(inner);
    if (text.trim()) widgets.push(makeWidget("paragraph", { text }));
  }

  // No tags at all — somebody pasted plain words. Keep them.
  if (!matchedAnything && src.trim()) {
    widgets.push(makeWidget("paragraph", { text: inlineToText(src) }));
  }
  return widgets;
}

function attr(attrs: string, name: string): string {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs || "")
    || new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i").exec(attrs || "");
  return m ? m[1] : "";
}

/**
 * The words inside one block, with the six inline tags kept as written.
 *
 * `<a href>` keeps its URL; everything else is flattened to its own text, so
 * a `<span style="color:red">` becomes the word and loses the colour — which
 * is correct, because the colour belonged to a stylesheet the mailbox strips.
 */
export function inlineToText(inner: string): string {
  return String(inner || "")
    .replace(/<a\b[^>]*href\s*=\s*["']((?:https?:\/\/|mailto:)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href, label) => `<a href="${href}">${stripTags(label)}</a>`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner2) => `<strong>${stripTags(inner2)}</strong>`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner2) => `<em>${stripTags(inner2)}</em>`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(?!\/?(?:a|strong|em)\b)[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function stripTags(s: string): string {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

/** Every tag out, for the plain-text half and for a legacy paragraph. */
export function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Opening a row, whatever shape it is in
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailRowLike {
  document_json?: unknown;
  blocks_json?: unknown;
  content_html?: string | null;
  title?: string | null;
  subject?: string | null;
}

export interface OpenedEmail {
  doc: BuilderDocument;
  /**
   * How it got here, said in one sentence the builder puts on the page. Null
   * when the row was already a builder document and nothing was interpreted.
   */
  note: string | null;
}

/**
 * Open whatever is on the row.
 *
 * Order matters and is the honest one: a builder document is read as itself; a
 * block tree is migrated; an HTML body is INTERPRETED, and says so, because a
 * scanner that guessed wrong and stayed quiet would be found at send time.
 */
export function openEmailDocument(
  row: EmailRowLike | null | undefined,
  business: EmailBusiness,
  accent?: string,
): OpenedEmail {
  if (!row) return { doc: ensureFooter(oneColDoc(business, accent), business), note: null };

  if (row.document_json && isBuilderDocument(row.document_json)) {
    return { doc: ensureFooter(deserialise(row.document_json), business), note: null };
  }
  if (row.blocks_json && isBuilderDocument(row.blocks_json)) {
    return { doc: ensureFooter(deserialise(row.blocks_json), business), note: null };
  }
  if (row.blocks_json && isLegacyBlockTree(row.blocks_json)) {
    const doc = upgradeEmailBlocks(row.blocks_json);
    return {
      doc: ensureFooter(withHeader(doc, business, accent), business),
      note: "Brought over from the old block editor. Everything is editable — check it over before you send.",
    };
  }
  const html = String(row.content_html ?? "").trim();
  if (html) {
    const doc = emptyDocument({ style: "newsletter", ...(accent ? { accent } : {}) });
    const widgets = htmlToWidgets(html);
    doc.sections = [headerSection(business, accent || "#0F172A"), ...widgets.map((w) => oneCol([w]))];
    return {
      doc: ensureFooter(doc, business),
      note: "Read back from the old editor. The words, pictures and links are here — check the layout before you send.",
    };
  }
  return { doc: ensureFooter(oneColDoc(business, accent), business), note: null };
}

function oneColDoc(business: EmailBusiness, accent?: string): BuilderDocument {
  const doc = emptyDocument({ style: "newsletter", ...(accent ? { accent } : {}) });
  doc.sections = [headerSection(business, accent || "#0F172A")];
  return doc;
}

/** A migrated block tree has no masthead; give it the business's. */
function withHeader(doc: BuilderDocument, business: EmailBusiness, accent?: string): BuilderDocument {
  const hasLogo = doc.sections.some((s) => s.columns.some((c) => c.widgets.some((w) =>
    w.kind === "image" && String((w.props as any).src || "") === String(business.logoUrl || " "))));
  if (hasLogo) return doc;
  return { ...doc, sections: [headerSection(business, accent || "#0F172A"), ...doc.sections] };
}

/* ══════════════════════════════════════════════════════════════════════════
   4. What goes back to the API
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailWire {
  document_json: BuilderDocument;
  content_html: string;
  content_text: string;
}

/**
 * The three things every save writes.
 *
 * The MODEL so it can be opened again, and the rendered HTML and text because
 * that is what the send path mails. They are produced together, from one
 * render, so a row can never hold a body and a model that disagree — which is
 * the defect the proposal inventory found three times over ("three pictures of
 * one document, and the document itself was whichever one you were looking
 * at").
 */
export function toEmailWire(
  doc: BuilderDocument,
  ctx: EmailRenderContext,
  opts: { subject?: string; preheader?: string } = {},
): EmailWire {
  // "send", NOT "view". The tokens stay as written so the SERVER resolves them
  // per recipient at send time, exactly as it does for every other body. Stored
  // in "view" mode this body would greet the whole list by the preview
  // contact's name — which is what the 2026-09-16 walk found in the inbox.
  const send: EmailRenderContext = { ...ctx, mode: "send" };
  /* AND THE DATA WIDGETS JOIN THOSE THREE MODES (catalogue F.2). The same
     `mode: "send"` that leaves the merge tokens for the server to resolve
     freezes every catalogue-bound widget: `_ia_snapshot` is written and
     `refresh` becomes `snapshot_send`, so a price a subscriber was shown does
     not move the next time somebody edits the catalogue. ONE trigger, the
     mode; one function, `freezeOnSend`; and a document with nothing bound in it
     comes back by identity, which is why all 34 email goldens are unchanged. */
  const frozen = freezeOnSend(doc, "send", (w) => {
    if (w.kind !== "catalog_card") return null;
    const r = resolveCatalogCard(w.props, ctx.catalogue);
    return r.source === "live"
      ? {
        title: r.title, price: r.price, per: r.per, description: r.description,
        bullets: r.bullets, amount: r.amount, cadence: r.cadence, basis: r.basis,
      }
      : null;
  });
  return {
    document_json: frozen,
    content_html: renderEmailDocument(frozen, send, opts),
    content_text: renderEmailText(frozen, send),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   5. The website, as a widget source
   ══════════════════════════════════════════════════════════════════════════ */

export interface WebsitePost {
  post_id: number;
  title: string;
  excerpt?: string;
  post_url: string;
  published_at?: string;
  image?: string | null;
}

/**
 * Posts from the business's own website, as article cards.
 *
 * "Import from ARION" already existed and already fetched exactly this — a
 * title, an excerpt, a link and a date. It used to create a whole newsletter
 * ISSUE per post; here it fills the widget that was designed for it, which is
 * §7's "import from the website keeps working as a widget source".
 */
export function articlesFromPosts(posts: WebsitePost[]): Array<Record<string, unknown>> {
  return (posts || []).map((p) => ({
    title: String(p.title || ""),
    excerpt: String(p.excerpt || "").replace(/<[^>]*>/g, "").trim(),
    image: p.image || "",
    alt: p.image ? String(p.title || "Article picture") : "",
    url: String(p.post_url || ""),
    linkLabel: "Read it",
  }));
}
