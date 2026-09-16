/**
 * builder/adapters/email/emailRender.ts — THE email renderer.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.4 ("Email (newsletter, campaign) →
 * table-based HTML with the email widget subset") and §7.
 *
 * ── ONE RENDERER, THREE PLACES IT IS SEEN ─────────────────────────────────
 * The same function draws:
 *   · the CANVAS, so what the author edits is the email, not a picture of one
 *     (`renderEmailSection`, with `mode: "edit"`, marks the runs of text the
 *     author may type into with `data-edit`, exactly as the document renderer
 *     does — the canvas machinery is shared);
 *   · the TEST SEND and the REAL SEND, which both mail the string this
 *     produces in `mode: "view"`. Nothing re-projects it on the way out: the
 *     newsletter row stores this HTML, the campaign copies that row, and
 *     LUMEN's send path mails what it was given.
 *   · the server's own copy for `lumen.message_template.blocks_json`
 *     (LUMEN-API `src/lib/builderEmailRender.js`), pinned against this module
 *     byte for byte by `test/fixtures/email-render-cases.json` in both repos —
 *     the SEAM-6-A discipline that keeps the three renderTemplate.js copies
 *     honest.
 *
 * ── WHAT A MAILBOX ALLOWS, AS CODE ────────────────────────────────────────
 * Not a style guide; four rules the test suite enforces on every fixture:
 *
 *   1. TABLES, NEVER flex OR grid. Outlook on Windows renders through Word,
 *      which has no flexbox and no grid. `assertEmailSafe()` refuses the
 *      strings, and the mutation test emits one on purpose to prove it.
 *   2. EVERY STYLE INLINE. Gmail strips <style> from the body; a class is a
 *      class with nothing behind it. There is no stylesheet in the output at
 *      all — the canvas's own chrome CSS lives in the canvas, not the email.
 *   3. 600px, NEVER WIDER. The width every client has agreed on since 2005.
 *   4. ALT TEXT ON EVERY PICTURE. Images are blocked by default in Outlook and
 *      often in Gmail; an email whose meaning is in the pictures is an email
 *      most people receive blank.
 *
 * ── THE FOOTER IS NOT THE AUTHOR'S TO DELETE ──────────────────────────────
 * CAN-SPAM wants an unsubscribe route and the sender's physical address on
 * every marketing send. Two guards, because they promise different things:
 *   · `model.removeWidget` / `removeSection` refuse a `locked` widget, so the
 *     button cannot take it off the page;
 *   · `renderEmailDocument` puts the block back if a document reaches it
 *     without one, so an email cannot leave without it even if a row was
 *     hand-edited, imported, or written by an older build.
 * Each is mutation-tested on its own.
 *
 * PURE: strings in, string out. No React, no DOM, no fetch.
 */
import type { BuilderDocument, Section, Widget } from "../../model";
import { fill, type MergeContext } from "../../merge";

/* ══════════════════════════════════════════════════════════════════════════
   The four rules, as constants
   ══════════════════════════════════════════════════════════════════════════ */

/** The width every mail client has agreed on. Never exceeded. */
export const EMAIL_WIDTH = 600;

/** The font stack, in the order a mail client will find one. */
const FALLBACK_STACK = "Helvetica, Arial, sans-serif";

/** Layout properties no mail client can be trusted with. */
export const FORBIDDEN_CSS = ["display:flex", "display:grid", "flex-direction", "grid-template", "position:absolute", "position:fixed"];

/* ── One escaper. Same rules as the document renderer's. ─────────────────── */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A colour we are about to put in a style attribute, or nothing. */
function colour(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(s) ? s : fallback;
}

/* ══════════════════════════════════════════════════════════════════════════
   The context
   ══════════════════════════════════════════════════════════════════════════ */

/** One thing the business sells, as the card shows it. */
export interface EmailBusiness {
  name: string;
  address?: string;
  logoUrl?: string | null;
  website?: string | null;
  social?: Array<{ label: string; url: string }>;
}

export interface EmailRenderContext {
  mode: "view" | "edit";
  merge: MergeContext;
  /** Any colour and any font, per Q4; the brand kit only pre-filled these. */
  accent: string;
  ink: string;
  paper: string;
  page: string;
  headingFont: string;
  bodyFont: string;
  business: EmailBusiness;
  /**
   * Where "Unsubscribe" points.
   *
   * In the builder and in a test send this is a placeholder, because the real
   * one is per-recipient and LUMEN mints it at send time
   * (`notificationPreferences.getOrIssueToken`). It is never blank: a footer
   * with a dead unsubscribe link is the same failure as no footer.
   */
  unsubscribeUrl: string;
  preferencesUrl?: string;
}

export function makeEmailContext(
  doc: BuilderDocument,
  partial: Partial<EmailRenderContext> = {},
): EmailRenderContext {
  return {
    mode: partial.mode ?? "view",
    merge: partial.merge ?? {},
    accent: colour(partial.accent ?? doc.settings.accent, "#0F172A"),
    ink: colour(partial.ink, "#111827"),
    paper: colour(partial.paper, "#FFFFFF"),
    page: colour(partial.page, "#F1F5F9"),
    headingFont: partial.headingFont || doc.settings.headingFont || "Helvetica",
    bodyFont: partial.bodyFont || doc.settings.bodyFont || "Helvetica",
    business: partial.business ?? { name: "" },
    unsubscribeUrl: partial.unsubscribeUrl || "{{unsubscribe_url}}",
    preferencesUrl: partial.preferencesUrl,
  };
}

/** The chosen face, then the ones every client has. Never the same name twice. */
function stack(face: string): string {
  const first = String(face || "").trim();
  const rest = FALLBACK_STACK.split(",").map((s) => s.trim())
    .filter((s) => s.toLowerCase() !== first.toLowerCase());
  return [first, ...rest].filter(Boolean).join(", ");
}
const headStack = (c: EmailRenderContext) => stack(c.headingFont);
const bodyStack = (c: EmailRenderContext) => stack(c.bodyFont);

/**
 * Escape everything, then hand back a very short list of inline tags.
 *
 * ── WHY THERE IS AN ALLOWLIST AT ALL ──────────────────────────────────────
 * A newsletter written in the old editor is a TipTap document: paragraphs with
 * bold runs and LINKS inside them. Escaping the lot would open every past
 * issue with its links turned into visible angle brackets, and retyping them
 * by hand is not a migration. So six tags survive, each with its attributes
 * checked rather than trusted:
 *
 *   <a href="…">  http, https and mailto only — never javascript:
 *   <strong> <b> <em> <i> <br>
 *
 * Everything else — every script, every style, every event handler, every
 * attribute not named above — is already escaped by the time this function
 * runs and stays that way. This is STRICTER than what the platform does
 * today, where a campaign's content_html is stored and mailed verbatim.
 */
export function inlineSafe(escaped: string): string {
  return String(escaped)
    .replace(/&lt;(\/?)(strong|b|em|i)&gt;/gi, (_m, slash, tag) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(/&lt;a href=&quot;((?:https?:\/\/|mailto:)[^"&<>\s]*)&quot;&gt;/gi,
      (_m, href) => `<a href="${href}" style="color:inherit;text-decoration:underline;">`)
    .replace(/&lt;\/a&gt;/gi, "</a>");
}

/** Merge-fill, escape, then re-permit the six inline tags. */
function t(text: unknown, c: EmailRenderContext): string {
  return inlineSafe(esc(fill(String(text ?? ""), c.merge, c.mode)));
}

/** `data-edit="path"`, only while editing — a sent email carries no markers. */
function edit(path: string, c: EmailRenderContext, placeholder?: string): string {
  if (c.mode !== "edit") return "";
  return ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`;
}

/** Paragraph runs from plain text with blank lines between them. */
function paras(text: unknown, c: EmailRenderContext, path: string, style: string): string {
  const filled = fill(String(text ?? ""), c.merge, c.mode);
  if (!filled.trim()) {
    return c.mode === "edit"
      ? `<div style="${style}"${edit(path, c, "Type here…")}></div>`
      : "";
  }
  const blocks = filled.split(/\n{2,}/).map((p) => inlineSafe(esc(p.trim())).replace(/\n/g, "<br />"));
  if (c.mode === "edit") {
    return `<div style="${style}"${edit(path, c)}>${blocks.map((b) => `<p style="margin:0 0 12px 0;">${b}</p>`).join("")}</div>`;
  }
  return blocks.map((b) => `<p style="${style}margin:0 0 12px 0;">${b}</p>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════════
   Widgets
   ══════════════════════════════════════════════════════════════════════════ */

/** Every kind this renderer draws. The parity test reads this list. */
export const EMAIL_RENDERED_KINDS = [
  "heading", "paragraph", "personal_note", "list", "image", "button",
  "divider", "spacer", "article_card", "product_card", "social_links",
  "email_footer", "countdown", "testimonial",
] as const;

/** Deliberately not drawn: `columns` is the SECTION's column count. */
export const EMAIL_UNRENDERED_KINDS = ["columns"] as const;

const ALIGN = (v: unknown, dflt = "left"): string => {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("cent")) return "center";
  if (s.startsWith("right")) return "right";
  if (s.startsWith("left")) return "left";
  return dflt;
};

export function renderEmailWidget(w: Widget, c: EmailRenderContext): string {
  const p: any = w.props || {};
  const body = (() => {
    switch (w.kind) {
      case "heading": return emHeading(p, c);
      case "paragraph": return paras(p.text, c, "text", `font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};text-align:${ALIGN(p.align)};`);
      case "personal_note": return emPersonalNote(p, c);
      case "list": return emList(p, c);
      case "image": return emImage(p, c);
      case "button": return emButton(p, c);
      case "divider": return emDivider(p, c);
      case "spacer": return `<div style="height:${Math.max(1, Number(p.height) || 24)}px;line-height:${Math.max(1, Number(p.height) || 24)}px;font-size:1px;">&nbsp;</div>`;
      case "article_card": return emArticles(p, c);
      case "product_card": return emProducts(p, c);
      case "social_links": return emSocial(p, c, ALIGN(p.align, "center"));
      case "email_footer": return emFooter(p, c);
      case "countdown": return emCountdown(p, c);
      case "testimonial": return emTestimonial(p, c);
      default:
        // Forward compatible, like migration 166's envelope: a widget from a
        // newer editor is INERT in the mailbox and explained on the canvas.
        return c.mode === "edit"
          ? `<div style="border:1px dashed #CBD5E1;border-radius:6px;padding:10px;color:#94A3B8;font-size:11px;font-family:${bodyStack(c)};">This part (“${esc(w.kind)}”) needs a newer version of the builder to show.</div>`
          : "";
    }
  })();
  if (!body && c.mode === "view") return "";
  if (c.mode !== "edit") return body;
  return `<div data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}"${w.locked ? ` data-locked="1"` : ""}>${body}</div>`;
}

function emHeading(p: any, c: EmailRenderContext): string {
  const level = p.level === "Page title" || p.level === 1 ? 1 : p.level === "Sub-section" || p.level === 3 ? 3 : 2;
  const size = level === 1 ? 26 : level === 2 ? 20 : 16;
  const tag = `h${level}`;
  const col = colour(p.colour, c.ink);
  return `<${tag} style="margin:0 0 12px 0;font-family:${headStack(c)};font-size:${size}px;line-height:1.25;font-weight:700;color:${col};text-align:${ALIGN(p.align)};"${edit("text", c, "Your heading")}>${t(p.text, c)}</${tag}>`;
}

/**
 * The personal note.
 *
 * It exists because a newsletter that opens "Dear Customer" is a newsletter
 * nobody reads. The greeting is a merge tag by default, so the thing the
 * author has to remember is nothing.
 */
function emPersonalNote(p: any, c: EmailRenderContext): string {
  const align = ALIGN(p.align);
  const base = `font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};text-align:${align};`;
  const greeting = p.greeting || c.mode === "edit"
    ? `<p style="${base}margin:0 0 10px 0;font-weight:600;"${edit("greeting", c, "Hi {{first name}},")}>${t(p.greeting, c)}</p>` : "";
  const sign = p.signoff || c.mode === "edit"
    ? `<p style="${base}margin:12px 0 0 0;"${edit("signoff", c, "— your name")}>${t(p.signoff, c)}</p>` : "";
  return greeting + paras(p.text, c, "text", base) + sign;
}

function emList(p: any, c: EmailRenderContext): string {
  const items: string[] = Array.isArray(p.items) ? p.items : [];
  const shown = c.mode === "edit" ? [...items, ""] : items.filter((x) => String(x ?? "").trim());
  if (!shown.length) return "";
  const li = shown.map((it, i) =>
    `<li style="margin:0 0 6px 0;"${edit(`items.${i}`, c, "add a point…")}>${t(it, c)}</li>`).join("");
  return `<ul style="margin:0 0 12px 0;padding-left:20px;font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};">${li}</ul>`;
}

/**
 * A picture.
 *
 * `alt` is not optional and not silently defaulted to "": a missing
 * description becomes the caption, or the file's own name, so that a reader
 * with images off still learns something. The test refuses `alt=""`.
 */
function emImage(p: any, c: EmailRenderContext): string {
  if (!p.src) {
    return c.mode === "edit"
      ? `<div style="border:1px dashed #CBD5E1;border-radius:6px;padding:20px;text-align:center;color:#94A3B8;font-size:12px;font-family:${bodyStack(c)};">Choose a picture in the panel on the right.</div>`
      : "";
  }
  const align = ALIGN(p.align, "center");
  const width = Math.min(EMAIL_WIDTH - 48, Math.max(40, Number(p.width) || EMAIL_WIDTH - 48));
  const alt = esc(altTextFor(p));
  const img = `<img src="${esc(p.src)}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;${align === "center" ? "margin:0 auto;" : ""}" />`;
  const wrapped = p.url ? `<a href="${esc(p.url)}" style="text-decoration:none;">${img}</a>` : img;
  const cap = p.caption || c.mode === "edit"
    ? `<div style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;margin-top:6px;text-align:${align};"${edit("caption", c, "Caption (optional)")}>${t(p.caption, c)}</div>` : "";
  return `<div style="text-align:${align};margin:0 0 16px 0;">${wrapped}${cap}</div>`;
}

/**
 * What a reader with pictures switched off will be told this picture is.
 *
 * Exported because the "every image has alt text" rule has to be checkable on
 * the MODEL as well as on the string — the builder warns before the send, and
 * the renderer never emits an empty alt.
 */
export function altTextFor(p: any): string {
  const explicit = String(p?.alt ?? "").trim();
  if (explicit) return explicit;
  const caption = String(p?.caption ?? "").trim();
  if (caption) return caption;
  const name = String(p?.src ?? "").split("?")[0].split("/").pop() || "";
  const pretty = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  return pretty || "Picture";
}

/**
 * The button.
 *
 * A bulletproof one: the colour is on a <td>, not on the <a>, because Outlook
 * drops background on an inline element and the reader gets blue underlined
 * text where the author put a button.
 */
function emButton(p: any, c: EmailRenderContext): string {
  const align = ALIGN(p.align, "center");
  const style = String(p.style || "solid").toLowerCase();
  const bg = colour(p.colour, c.accent);
  const radius = Number.isFinite(Number(p.radius)) ? Math.max(0, Number(p.radius)) : 6;
  const url = esc(p.url || "#");
  const label = t(p.label, c) || (c.mode === "edit" ? "" : "");
  const inner = `<span${edit("label", c, "Button text")}>${label}</span>`;
  if (style.startsWith("plain")) {
    return `<div style="text-align:${align};margin:0 0 20px 0;font-family:${bodyStack(c)};font-size:15px;"><a href="${url}" style="color:${bg};font-weight:600;text-decoration:underline;">${inner}</a></div>`;
  }
  const cell = style.startsWith("outline")
    ? `border:2px solid ${bg};border-radius:${radius}px;background:${c.paper};`
    : `border-radius:${radius}px;background:${bg};`;
  const ink = style.startsWith("outline") ? bg : contrastInk(bg);
  const full = String(p.width || "").toLowerCase() === "full";
  return `<table role="presentation" ${full ? 'width="100%" ' : ""}cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:0 auto 20px auto;${full ? "width:100%;" : ""}">`
    + `<tr><td align="center" style="${cell}${full ? "width:100%;" : ""}">`
    + `<a href="${url}" style="${full ? "display:block;width:100%;box-sizing:border-box;" : "display:inline-block;"}padding:13px 26px;font-family:${bodyStack(c)};font-size:15px;font-weight:600;color:${ink};text-decoration:none;border-radius:${radius}px;">${inner}</a>`
    + `</td></tr></table>`;
}

/**
 * Black or white on this background, whichever a person can read.
 *
 * The same relative-luminance rule CTAEditorBlock's autoContrastColor uses, so
 * a button built in the composer and the same button built here do not
 * disagree about whether the label is legible.
 */
export function contrastInk(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return "#FFFFFF";
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.42 ? "#111827" : "#FFFFFF";
}

function emDivider(p: any, c: EmailRenderContext): string {
  const style = String(p.style || "line").toLowerCase();
  if (style.startsWith("space")) return `<div style="height:20px;line-height:20px;font-size:1px;">&nbsp;</div>`;
  const kind = style.startsWith("dot") ? "dotted" : "solid";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;"><tr><td style="border-top:1px ${kind} ${colour(p.colour, "#E5E7EB")};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/** Articles — the shape a newsletter is mostly made of. */
function emArticles(p: any, c: EmailRenderContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const stacked = String(p.layout || "").toLowerCase().includes("above");
  const shown = c.mode === "edit" ? items : items.filter((a) => String(a?.title ?? "").trim() || String(a?.excerpt ?? "").trim());
  if (!shown.length) return "";
  return shown.map((a, i) => {
    const title = `<div style="font-family:${headStack(c)};font-size:17px;font-weight:700;line-height:1.3;color:${c.ink};margin:0 0 6px 0;"${edit(`items.${i}.title`, c, "Headline")}>${t(a?.title, c)}</div>`;
    const excerpt = `<div style="font-family:${bodyStack(c)};font-size:14px;line-height:1.6;color:#374151;margin:0 0 8px 0;"${edit(`items.${i}.excerpt`, c, "A line or two about it…")}>${t(a?.excerpt, c)}</div>`;
    const link = a?.url
      ? `<a href="${esc(a.url)}" style="font-family:${bodyStack(c)};font-size:14px;font-weight:600;color:${c.accent};text-decoration:none;">${t(a?.linkLabel || "Read it", c)} &rarr;</a>`
      : "";
    const pic = a?.image
      ? `<img src="${esc(a.image)}" alt="${esc(altTextFor({ alt: a?.alt, caption: a?.title, src: a?.image }))}" width="${stacked ? EMAIL_WIDTH - 48 : 180}" style="display:block;width:100%;max-width:${stacked ? EMAIL_WIDTH - 48 : 180}px;height:auto;border:0;border-radius:6px;" />`
      : "";
    const words = `${title}${excerpt}${link}`;
    const inner = !pic || stacked
      ? `<tr><td style="padding:0 0 10px 0;">${pic}</td></tr><tr><td>${words}</td></tr>`
      : `<tr><td width="180" valign="top" style="padding:0 16px 0 0;width:180px;">${pic}</td><td valign="top">${words}</td></tr>`;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">${inner}</table>`;
  }).join("");
}

/**
 * Products and prices, from Products & Services.
 *
 * The CADENCE comes with the price and is printed beside it — "$185 per push",
 * "$1,200 seasonal" — because a number with no basis is the thing a customer
 * reads wrong. It is the catalogue's own word, never one invented here.
 */
function emProducts(p: any, c: EmailRenderContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const shown = c.mode === "edit" ? items : items.filter((x) => String(x?.name ?? "").trim());
  if (!shown.length) return "";
  const sideBySide = !String(p.layout || "").toLowerCase().includes("under") && shown.length > 1;
  const cell = (x: any, i: number, width: string) => {
    const pic = x?.image
      ? `<img src="${esc(x.image)}" alt="${esc(altTextFor({ alt: x?.alt, caption: x?.name, src: x?.image }))}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;border-radius:6px;margin:0 0 10px 0;" />`
      : "";
    const price = x?.price || c.mode === "edit"
      ? `<div style="font-family:${headStack(c)};font-size:19px;font-weight:700;color:${c.ink};margin:0 0 2px 0;"${edit(`items.${i}.price`, c, "$0.00")}>${t(x?.price, c)}</div>` : "";
    const cad = x?.cadence || c.mode === "edit"
      ? `<div style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;margin:0 0 8px 0;"${edit(`items.${i}.cadence`, c, "how it is billed")}>${t(x?.cadence, c)}</div>` : "";
    const cta = x?.url
      ? `<a href="${esc(x.url)}" style="display:inline-block;font-family:${bodyStack(c)};font-size:13px;font-weight:600;color:${c.accent};text-decoration:none;">${t(x?.ctaLabel || "See it", c)} &rarr;</a>`
      : "";
    return `<td valign="top" style="width:${width};padding:14px;border:1px solid #E5E7EB;border-radius:8px;background:${c.paper};">`
      + pic
      + `<div style="font-family:${headStack(c)};font-size:15px;font-weight:700;color:${c.ink};margin:0 0 4px 0;"${edit(`items.${i}.name`, c, "What it is")}>${t(x?.name, c)}</div>`
      + `<div style="font-family:${bodyStack(c)};font-size:13px;line-height:1.55;color:#374151;margin:0 0 8px 0;"${edit(`items.${i}.blurb`, c, "Why it is worth having")}>${t(x?.blurb, c)}</div>`
      + price + cad + cta
      + `</td>`;
  };
  if (!sideBySide) {
    return shown.map((x, i) =>
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px 0;"><tr>${cell(x, i, "100%")}</tr></table>`).join("");
  }
  const width = `${Math.floor(100 / shown.length)}%`;
  const cells = shown.map((x, i) => cell(x, i, width)).join(`<td style="width:14px;font-size:0;line-height:0;">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr>${cells}</tr></table>`;
}

function emSocial(p: any, c: EmailRenderContext, align: string): string {
  const declared: any[] = Array.isArray(p?.links) ? p.links.filter((l: any) => l?.url) : [];
  const links = declared.length ? declared : (c.business.social || []);
  if (!links.length) {
    return c.mode === "edit"
      ? `<div style="text-align:${align};font-family:${bodyStack(c)};font-size:12px;color:#94A3B8;">Your social accounts appear here once they are connected in My Brand.</div>`
      : "";
  }
  const cells = links.slice(0, 8).map((l: any) =>
    `<td style="padding:0 8px;"><a href="${esc(l.url)}" style="font-family:${bodyStack(c)};font-size:13px;font-weight:600;color:${c.accent};text-decoration:none;">${esc(l.label || "Follow")}</a></td>`).join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:0 auto;"><tr>${cells}</tr></table>`;
}

/**
 * A countdown, told as a DATE.
 *
 * No animation and no third-party image service (there is a standing decision
 * against putting another product's surface in front of a client). The widget's
 * own help line already promised this: "email clients that cannot show a timer
 * see the date instead" — every client is one of those, so every client sees
 * the date, and it is always right.
 */
function emCountdown(p: any, c: EmailRenderContext): string {
  const raw = String(p.ends_at ?? "").trim();
  if (!raw) return c.mode === "edit"
    ? `<div style="text-align:center;font-family:${bodyStack(c)};font-size:12px;color:#94A3B8;">Set the date this counts down to, in the panel on the right.</div>` : "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 16px auto;"><tr>`
    + `<td style="padding:10px 18px;border:1px solid ${c.accent};border-radius:8px;font-family:${headStack(c)};font-size:15px;font-weight:700;color:${c.accent};text-align:center;">${esc(raw)}</td>`
    + `</tr></table>`;
}

function emTestimonial(p: any, c: EmailRenderContext): string {
  if (!String(p.quote ?? "").trim() && c.mode !== "edit") return "";
  const stars = Math.max(0, Math.min(5, Number(p.rating) || 0));
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr>`
    + `<td style="padding:14px 16px;background:#F8FAFC;border-left:3px solid ${c.accent};">`
    + `<div style="font-family:${bodyStack(c)};font-size:15px;line-height:1.6;color:${c.ink};font-style:italic;"${edit("quote", c, "What they said")}>${t(p.quote, c)}</div>`
    + (stars ? `<div style="font-family:${bodyStack(c)};font-size:13px;letter-spacing:2px;color:${c.accent};margin-top:6px;">${"&#9733;".repeat(stars)}</div>` : "")
    + `<div style="font-family:${bodyStack(c)};font-size:12px;color:#6B7280;margin-top:6px;"${edit("attribution", c, "Who said it")}>${t(p.attribution, c)}</div>`
    + `</td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The footer that has to be there
   ══════════════════════════════════════════════════════════════════════════ */

/** The widget the templates place, locked, at the bottom of every email. */
export function makeFooterProps(business: EmailBusiness): Record<string, unknown> {
  return {
    businessName: business.name || "",
    address: business.address || "",
    note: "",
    unsubscribeLabel: "Unsubscribe",
    preferencesLabel: "Update your preferences",
    showSocial: true,
  };
}

/**
 * What a business must say about itself on a marketing email.
 *
 * Shown, not hidden behind a flag: an author who cannot see the address on
 * the page cannot notice that it is last year's.
 */
function emFooter(p: any, c: EmailRenderContext): string {
  const name = String(p.businessName || c.business.name || "").trim();
  const address = String(p.address || c.business.address || "").trim();
  const small = `font-family:${bodyStack(c)};font-size:12px;line-height:1.6;color:#6B7280;text-align:center;`;
  const social = p.showSocial === false ? "" : emSocial({ links: [] }, c, "center");
  const note = p.note || c.mode === "edit"
    ? `<div style="${small}margin:0 0 6px 0;"${edit("note", c, "Anything else you want to say here")}>${t(p.note, c)}</div>` : "";
  // The address line reads as a gap the author can fill, never as a silent
  // omission: an empty one says so, on the page, in the colour of a warning.
  const addressLine = address
    ? `<div style="${small}margin:0 0 6px 0;"${edit("address", c, "Your postal address")}>${esc(name ? `${name} · ${address}` : address)}</div>`
    : c.mode === "edit"
      ? `<div style="${small}margin:0 0 6px 0;color:#B45309;"${edit("address", c, "Add your postal address — the law asks for it on every marketing email")}></div>`
      : `<div style="${small}margin:0 0 6px 0;">${esc(name)}</div>`;
  const unsub = `<a href="${esc(c.unsubscribeUrl)}" style="color:#6B7280;text-decoration:underline;">${esc(p.unsubscribeLabel || "Unsubscribe")}</a>`;
  const prefs = c.preferencesUrl
    ? ` &nbsp;·&nbsp; <a href="${esc(c.preferencesUrl)}" style="color:#6B7280;text-decoration:underline;">${esc(p.preferencesLabel || "Update your preferences")}</a>` : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" data-email-footer="1" style="margin:8px 0 0 0;border-top:1px solid #E5E7EB;">`
    + `<tr><td style="padding:16px 0 0 0;">`
    + (social ? `<div style="margin:0 0 10px 0;">${social}</div>` : "")
    + note + addressLine
    + `<div style="${small}">${unsub}${prefs}</div>`
    + `</td></tr></table>`;
}

/** Is there a footer widget anywhere in this document? */
export function hasFooter(doc: BuilderDocument): boolean {
  return doc.sections.some((s) => s.columns.some((c) => c.widgets.some((w) => w.kind === "email_footer")));
}

/* ══════════════════════════════════════════════════════════════════════════
   Sections
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * One section, as the row of a table.
 *
 * A section's COLUMNS become <td>s of one <tr>. Under about 480px most clients
 * keep them side by side, which is why two is the practical maximum for real
 * content and three is reserved for short things (a logo, a price, a date) —
 * the templates use it that way and the pane says so.
 */
export function renderEmailSection(s: Section, c: EmailRenderContext): string {
  if (s.visibility !== "customer" && c.mode === "view") return "";

  const pad = Math.max(0, Number(s.padding) || 0);
  const bg = s.background ? colour(s.background, "") : "";
  const ink = s.theme === "dark" ? "#FFFFFF" : c.ink;
  const inner: EmailRenderContext = { ...c, ink };

  const contentWidth = s.width === "narrow" ? 420 : s.width === "full" ? EMAIL_WIDTH : EMAIL_WIDTH - 48;
  const cols = s.columns;
  const gutter = cols.length > 1 ? 16 : 0;
  const each = cols.length > 1
    ? `${Math.floor((100 - (cols.length - 1) * 3) / cols.length)}%`
    : "100%";

  // Editor markers, and only in the editor: a sent email carries no hooks for
  // a canvas that is not there.
  const mark = c.mode === "edit";
  const cells = cols.map((col, i) =>
    `<td valign="top"${mark ? ` data-col="${i}"` : ""} style="width:${each};">${col.widgets.map((w) => renderEmailWidget(w, inner)).join("")}</td>`)
    .join(gutter ? `<td style="width:3%;font-size:0;line-height:0;">&nbsp;</td>` : "");

  const label = s.numbered && s.label
    ? `<div style="font-family:${bodyStack(c)};font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:${c.accent};margin:0 0 8px 0;">${esc(s.label)}</div>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"`
    + (mark ? ` data-section="${esc(s.id)}"` : "")
    + ` style="${bg ? `background:${bg};` : ""}"><tr><td align="center" style="padding:${pad}px 24px;">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${contentWidth}px;">`
    + (label ? `<tr><td>${label}</td></tr>` : "")
    + `<tr>${cells}</tr>`
    + `</table></td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The whole email
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailDocOptions {
  /** The <title>, and the preview line some clients show beside the subject. */
  subject?: string;
  preheader?: string;
}

/**
 * The email, start to finish.
 *
 * THE SECOND GUARD: if the document arrives with no footer widget — a row
 * hand-edited, imported from somewhere, or written before the footer existed —
 * one is appended here. The author cannot delete it (the model refuses) and a
 * document that never had it cannot get past this function without it.
 */
export function renderEmailDocument(
  doc: BuilderDocument,
  c: EmailRenderContext,
  opts: EmailDocOptions = {},
): string {
  const sections = doc.sections.map((s) => renderEmailSection(s, c)).join("");
  const fallbackFooter = hasFooter(doc)
    ? ""
    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:8px 24px 24px 24px;">`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${EMAIL_WIDTH - 48}px;">`
      + `<tr><td>${emFooter(makeFooterProps(c.business), { ...c, mode: "view" })}</td></tr></table></td></tr></table>`;

  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${c.page};">${esc(fill(opts.preheader, c.merge, "view"))}</div>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(opts.subject || "")}</title>
</head>
<body style="margin:0;padding:0;background:${c.page};font-family:${bodyStack(c)};">
${pre}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${c.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="${EMAIL_WIDTH}" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;background:${c.paper};border-radius:8px;">
<tr><td>${sections}${fallbackFooter}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The plain-text half
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The text/plain part.
 *
 * Not an afterthought: a send with no text part reads as bulk shape to the
 * classifiers, which is the deliverability lesson this platform already paid
 * for once (ACS quota needs under 2% failure; ours was 22.6%).
 */
export function renderEmailText(doc: BuilderDocument, c: EmailRenderContext): string {
  const out: string[] = [];
  const line = (s: unknown) => {
    const v = fill(String(s ?? ""), c.merge, "view").trim();
    if (v) out.push(v);
  };
  for (const s of doc.sections) {
    if (s.visibility !== "customer") continue;
    for (const col of s.columns) {
      for (const w of col.widgets) {
        const p: any = w.props || {};
        switch (w.kind) {
          case "heading": line(String(p.text ?? "").toUpperCase()); out.push(""); break;
          case "paragraph": line(p.text); out.push(""); break;
          case "personal_note": line(p.greeting); line(p.text); line(p.signoff); out.push(""); break;
          case "list": for (const it of (Array.isArray(p.items) ? p.items : [])) line(`· ${it}`); out.push(""); break;
          case "image": if (altTextFor(p) && p.src) line(`[${altTextFor(p)}]`); break;
          case "button": if (p.label || p.url) line(`${String(p.label || "Open").trim()}: ${p.url || ""}`); out.push(""); break;
          case "divider": out.push("—————————————"); break;
          case "article_card":
            for (const a of (Array.isArray(p.items) ? p.items : [])) {
              line(a?.title); line(a?.excerpt); if (a?.url) line(a.url); out.push("");
            }
            break;
          case "product_card":
            for (const x of (Array.isArray(p.items) ? p.items : [])) {
              line([x?.name, [x?.price, x?.cadence].filter(Boolean).join(" ")].filter(Boolean).join(" — "));
              line(x?.blurb); if (x?.url) line(x.url); out.push("");
            }
            break;
          case "testimonial": line(`"${String(p.quote ?? "")}"`); line(p.attribution); out.push(""); break;
          case "countdown": line(p.ends_at); break;
          case "social_links":
            for (const l of (Array.isArray(p.links) && p.links.length ? p.links : c.business.social || [])) line(`${l.label}: ${l.url}`);
            break;
          case "email_footer": {
            out.push("");
            out.push("—————————————");
            line(p.note);
            line([p.businessName || c.business.name, p.address || c.business.address].filter(Boolean).join(" · "));
            line(`${p.unsubscribeLabel || "Unsubscribe"}: ${c.unsubscribeUrl}`);
            break;
          }
          default: break;
        }
      }
    }
  }
  if (!hasFooter(doc)) {
    out.push("", "—————————————");
    line([c.business.name, c.business.address].filter(Boolean).join(" · "));
    line(`Unsubscribe: ${c.unsubscribeUrl}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ══════════════════════════════════════════════════════════════════════════
   The sanity check a mailbox would apply
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailSafetyProblem { rule: string; detail: string }

/**
 * Everything a mail client would object to, as a list of sentences.
 *
 * Used by the test suite on every golden fixture AND by the builder before a
 * send, so the author is told the same thing the test would say. A checker
 * only the tests run is a checker that stops being true.
 */
export function checkEmailSafe(html: string): EmailSafetyProblem[] {
  const problems: EmailSafetyProblem[] = [];
  const flat = String(html || "").replace(/\s+/g, "");

  for (const bad of FORBIDDEN_CSS) {
    if (flat.includes(bad.replace(/\s+/g, ""))) {
      problems.push({ rule: "tables only", detail: `the page uses ${bad}, which Outlook renders through Word and cannot lay out` });
    }
  }
  if (/<style[\s>]/i.test(html)) {
    problems.push({ rule: "styles inline", detail: "there is a stylesheet in the page; Gmail strips it and leaves the email unstyled" });
  }
  if (/\sclass=/.test(html)) {
    problems.push({ rule: "styles inline", detail: "there is a class attribute with no stylesheet behind it" });
  }
  for (const m of String(html).matchAll(/max-width:\s*(\d+)px/g)) {
    if (Number(m[1]) > EMAIL_WIDTH) {
      problems.push({ rule: "600px", detail: `something is ${m[1]}px wide; ${EMAIL_WIDTH}px is the widest an email may be` });
    }
  }
  for (const m of String(html).matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt="[^"]+"/i.test(m[0])) {
      problems.push({ rule: "alt text", detail: "a picture has no description, so a reader with images off sees nothing" });
    }
  }
  return problems;
}

/** Throw on anything a mailbox would object to. Used by the tests. */
export function assertEmailSafe(html: string): void {
  const problems = checkEmailSafe(html);
  if (problems.length) {
    throw new Error(`email is not safe to send:\n  ${problems.map((p) => `${p.rule}: ${p.detail}`).join("\n  ")}`);
  }
}
