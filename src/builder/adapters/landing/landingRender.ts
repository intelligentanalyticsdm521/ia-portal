/**
 * builder/adapters/landing/landingRender.ts — THE hosted-page renderer.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, Brandon's answer for landing pages:
 *
 *   "With ARION: it is a website page, built in the website builder and
 *    published on their site. Without ARION: keep the hosted landing page (we
 *    already serve /api/v1/landing/:business/:slug with its own form →
 *    contact), but build it on the SAME CANVAS with the web widget set;
 *    publish to our hosted address, and offer 'copy embed code' for a
 *    non-ARION website."
 *
 * ── ONE RENDERER, TWO PROCESSES ───────────────────────────────────────────
 * The page is SERVER-rendered — a landing page has to be readable with no
 * JavaScript, by a search engine and by a person on a bad connection — so the
 * string this module produces also has to be produced by LUMEN. It is, in
 * `LUMEN-API/src/lib/landingRender.js`, and the two are pinned against each
 * other by `test/fixtures/landing-render-cases.json`, checked into BOTH repos
 * byte-identical. That is the same discipline the platform already uses for
 * the three copies of renderTemplate.js (seams audit §6, SEAM-6-A) — the copy
 * is allowed; the drift is not.
 *
 * ── IT REPLACES THE FIVE-KIND STACKED EDITOR ──────────────────────────────
 * `SparkLandingPageEditor` (hero / text / bullets / cta / form as cards with
 * up-and-down arrows) is DELETED in the same pass, and so is the copy of this
 * renderer that lived inside routes/landingPages.js. Replace means delete.
 *
 * ── OLD ROWS STILL RENDER ─────────────────────────────────────────────────
 * `blocks_json` used to hold a flat ARRAY of those five kinds. It now holds
 * either that array or a v2 document, and both draw. `upgradeLandingBlocks()`
 * is what turns the first into the second when somebody opens the page.
 *
 * PURE: strings in, string out.
 */
import {
  deserialise, emptyDocument, makeSection, makeWidget,
  type BuilderDocument, type Section, type Widget,
} from "../../model";
import { fill, type MergeContext } from "../../merge";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface LandingContext {
  mode: "view" | "edit";
  merge: MergeContext;
  accent: string;
  /** Where the form posts. The builder shows it; the hosted page uses it. */
  formAction: string;
  /** Hidden fields the page arrived with (a postcard's code, the UTMs). */
  hidden?: Record<string, string>;
  business: { name: string; address?: string; email?: string; phone?: string };
}

export function makeLandingContext(
  doc: BuilderDocument,
  partial: Partial<LandingContext> = {},
): LandingContext {
  return {
    mode: partial.mode ?? "view",
    merge: partial.merge ?? {},
    accent: partial.accent || doc.settings.accent || "#0F172A",
    formAction: partial.formAction ?? "#",
    hidden: partial.hidden ?? {},
    business: partial.business ?? { name: "" },
  };
}

function t(text: unknown, c: LandingContext): string {
  return esc(fill(String(text ?? ""), c.merge, c.mode));
}

function edit(path: string, c: LandingContext, placeholder?: string): string {
  if (c.mode !== "edit") return "";
  return ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`;
}

function paras(text: unknown, c: LandingContext, path: string): string {
  const filled = fill(String(text ?? ""), c.merge, c.mode);
  if (!filled.trim()) {
    return c.mode === "edit" ? `<div class="lp-prose lp-empty"${edit(path, c, "Type here…")}></div>` : "";
  }
  const blocks = filled.split(/\n{2,}/).map((p) => esc(p.trim()).replace(/\n/g, "<br>"));
  if (c.mode === "edit") return `<div class="lp-prose"${edit(path, c)}>${blocks.map((b) => `<p>${b}</p>`).join("")}</div>`;
  return blocks.map((b) => `<p>${b}</p>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════════
   The form — the reason a hosted landing page exists at all
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The fields a landing-page form may ask for.
 *
 * A FIXED set, keyed by the names `POST /landing/:business/:slug/submit`
 * already reads, because a field the server does not know about is a question
 * the visitor answers into nothing. That is not a limitation to route around:
 * it is the contract that makes "the form creates a contact" true.
 */
export const FORM_FIELDS = [
  { key: "name", label: "Your name", type: "text", always: true },
  { key: "email", label: "Your email", type: "email", always: true },
  { key: "phone", label: "Phone", type: "tel", always: false },
  { key: "company", label: "Company", type: "text", always: false },
  { key: "message", label: "How can we help?", type: "textarea", always: false },
] as const;

export function defaultFormFields(): string[] {
  return ["name", "email", "phone", "message"];
}

function landingForm(p: any, c: LandingContext): string {
  const chosen: string[] = Array.isArray(p.fields) && p.fields.length
    ? p.fields.map((f: any) => (typeof f === "string" ? f : String(f?.key || ""))).filter(Boolean)
    : defaultFormFields();
  const keys = FORM_FIELDS.filter((f) => f.always || chosen.includes(f.key));
  const hidden = Object.entries(c.hidden || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  const inputs = keys.map((f) => {
    const label = String(p[`label_${f.key}`] || f.label);
    return f.type === "textarea"
      ? `<textarea name="${f.key}" rows="4" placeholder="${esc(label)}"></textarea>`
      : `<input name="${f.key}" type="${f.type}" placeholder="${esc(label)}"${f.always ? " required" : ""}>`;
  }).join("");
  return `<form id="form" class="lp-form" method="post" action="${esc(c.formAction)}">
    <h2${edit("heading", c, "Get in touch")}>${t(p.heading || "Get in touch", c)}</h2>${hidden}
    ${inputs}
    <button type="submit" style="background:${esc(c.accent)}"${edit("submit_label", c, "Send")}>${t(p.submit_label || "Send", c)}</button>
  </form>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Widgets
   ══════════════════════════════════════════════════════════════════════════ */

export const LANDING_RENDERED_KINDS = [
  "hero", "heading", "paragraph", "list", "image", "gallery", "video",
  "button", "divider", "spacer", "form", "footer_note", "social_links",
  "testimonial",
] as const;

export const LANDING_UNRENDERED_KINDS = ["columns"] as const;

export function renderLandingWidget(w: Widget, c: LandingContext): string {
  const p: any = w.props || {};
  const body = (() => {
    switch (w.kind) {
      case "hero": return lpHero(p, c);
      case "heading": return lpHeading(p, c);
      case "paragraph": return paras(p.text, c, "text");
      case "list": return lpList(p, c);
      case "image": return lpImage(p, c);
      case "gallery": return lpGallery(p, c);
      case "video": return lpVideo(p, c);
      case "button": return lpButton(p, c);
      case "divider": return `<hr class="lp-hr">`;
      case "spacer": return `<div class="lp-spacer" style="height:${Math.max(1, Number(p.height) || 24)}px"></div>`;
      case "form": return landingForm(p, c);
      case "footer_note": return (p.text || c.mode === "edit")
        ? `<p class="lp-small"${edit("text", c, "Small print")}>${t(p.text, c)}</p>` : "";
      case "social_links": return lpSocial(p, c);
      case "testimonial": return lpQuote(p, c);
      default:
        return c.mode === "edit"
          ? `<div class="lp-unknown">This part (“${esc(w.kind)}”) needs a newer version of the builder to show.</div>`
          : "";
    }
  })();
  if (!body && c.mode === "view") return "";
  return c.mode === "edit"
    ? `<div class="lp-w" data-widget="${esc(w.id)}" data-kind="${esc(w.kind)}">${body}</div>`
    : body;
}

/** A picture on a landing page still needs a description. Same rule as email. */
function altOf(p: any, fallback = "Picture"): string {
  const a = String(p?.alt ?? "").trim();
  if (a) return a;
  const cap = String(p?.caption ?? p?.headline ?? "").trim();
  if (cap) return cap;
  const name = String(p?.image ?? p?.src ?? "").split("?")[0].split("/").pop() || "";
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || fallback;
}

function lpHero(p: any, c: LandingContext): string {
  const align = String(p.align || "").toLowerCase().startsWith("left") ? "left" : "center";
  const pic = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(altOf(p))}">`
    : c.mode === "edit" ? `<div class="lp-drop">Choose a picture in the panel on the right.</div>` : "";
  return `<header class="lp-hero" style="text-align:${align}">
    ${pic}
    <h1${edit("headline", c, "The one line that says what you do")}>${t(p.headline, c)}</h1>
    ${p.sub || c.mode === "edit" ? `<p class="lp-sub"${edit("sub", c, "A supporting line")}>${t(p.sub, c)}</p>` : ""}
  </header>`;
}

function lpHeading(p: any, c: LandingContext): string {
  const level = p.level === "Page title" || p.level === 1 ? 1 : p.level === "Sub-section" || p.level === 3 ? 3 : 2;
  return `<h${level} class="lp-h"${edit("text", c, "Your heading")}>${t(p.text, c)}</h${level}>`;
}

function lpList(p: any, c: LandingContext): string {
  const items: string[] = Array.isArray(p.items) ? p.items : [];
  const shown = c.mode === "edit" ? [...items, ""] : items.filter((x) => String(x ?? "").trim());
  if (!shown.length) return "";
  return `<ul class="lp-list">${shown.map((it, i) =>
    `<li${edit(`items.${i}`, c, "add a point…")}>${t(it, c)}</li>`).join("")}</ul>`;
}

function lpImage(p: any, c: LandingContext): string {
  if (!p.src) return c.mode === "edit" ? `<div class="lp-drop">Choose a picture in the panel on the right.</div>` : "";
  return `<figure class="lp-fig"><img src="${esc(p.src)}" alt="${esc(altOf(p))}">${
    p.caption || c.mode === "edit" ? `<figcaption${edit("caption", c, "Caption")}>${t(p.caption, c)}</figcaption>` : ""}</figure>`;
}

function lpGallery(p: any, c: LandingContext): string {
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const shown = items.filter((x) => (typeof x === "string" ? x : x?.src));
  if (!shown.length) return c.mode === "edit" ? `<div class="lp-drop">Add the photos in the panel on the right.</div>` : "";
  return `<div class="lp-gal">${shown.map((x) => {
    const src = typeof x === "string" ? x : x.src;
    return `<img src="${esc(src)}" alt="${esc(altOf(typeof x === "string" ? { src: x } : x))}">`;
  }).join("")}</div>`;
}

/**
 * A video, as a link with a picture.
 *
 * NOT an embedded player: an iframe from YouTube on a page we host puts a
 * third party's cookies on a visitor the business is responsible for, and the
 * standing decision is that another product's surface does not appear in front
 * of a client. The link opens it where it lives.
 */
function lpVideo(p: any, c: LandingContext): string {
  if (!p.url) return c.mode === "edit" ? `<div class="lp-drop">Paste the video's address in the panel on the right.</div>` : "";
  return `<p class="lp-video"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Watch the video</a></p>`;
}

function lpButton(p: any, c: LandingContext): string {
  const style = String(p.style || "solid").toLowerCase();
  const colour = /^#|^rgb|^hsl/.test(String(p.colour || "")) ? String(p.colour) : c.accent;
  const cls = style.startsWith("outline") ? "lp-btn lp-btn-out" : style.startsWith("plain") ? "lp-btn lp-btn-plain" : "lp-btn";
  const inline = style.startsWith("solid") ? ` style="background:${esc(colour)}"` : ` style="color:${esc(colour)};border-color:${esc(colour)}"`;
  return `<p class="lp-cta"><a class="${cls}" href="${esc(p.url || "#form")}"${inline}><span${edit("label", c, "Button text")}>${t(p.label, c)}</span></a></p>`;
}

function lpSocial(p: any, c: LandingContext): string {
  const links: any[] = Array.isArray(p.links) ? p.links.filter((l: any) => l?.url) : [];
  if (!links.length) return c.mode === "edit"
    ? `<p class="lp-small">Your social accounts appear here once they are connected in My Brand.</p>` : "";
  return `<p class="lp-social">${links.map((l) =>
    `<a href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.label || "Follow")}</a>`).join("")}</p>`;
}

function lpQuote(p: any, c: LandingContext): string {
  if (!String(p.quote ?? "").trim() && c.mode !== "edit") return "";
  return `<blockquote class="lp-quote" style="border-left-color:${esc(c.accent)}">
    <p${edit("quote", c, "What they said")}>${t(p.quote, c)}</p>
    <footer${edit("attribution", c, "Who said it")}>${t(p.attribution, c)}</footer>
  </blockquote>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sections and the page
   ══════════════════════════════════════════════════════════════════════════ */

export function renderLandingSection(s: Section, c: LandingContext): string {
  if (s.visibility !== "customer" && c.mode === "view") return "";
  const mark = c.mode === "edit";
  const style = [
    s.background ? `background:${esc(s.background)}` : "",
    `padding:${Math.max(0, Number(s.padding) || 0)}px 20px`,
    s.theme === "dark" ? "color:#fff" : "",
  ].filter(Boolean).join(";");
  const cols = s.columns.map((col, i) =>
    `<div class="lp-col"${mark ? ` data-col="${i}"` : ""}>${col.widgets.map((w) => renderLandingWidget(w, c)).join("")}</div>`).join("");
  return `<section class="lp-sec lp-w-${s.width} lp-cols-${s.layout}"${mark ? ` data-section="${esc(s.id)}"` : ""} style="${style}">`
    + `<div class="lp-grid">${cols}</div></section>`;
}

export interface LandingPageMeta {
  title: string;
  metaDescription?: string | null;
}

export function renderLandingPage(
  doc: BuilderDocument,
  c: LandingContext,
  meta: LandingPageMeta,
): string {
  const body = doc.sections.map((s) => renderLandingSection(s, c)).join("\n");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)}</title>
${meta.metaDescription ? `<meta name="description" content="${esc(meta.metaDescription)}">` : ""}
<style>${LANDING_CSS.replace(/__ACCENT__/g, esc(c.accent))}</style>
</head><body><main class="lp-page">
${body || `<h1>${esc(meta.title)}</h1><p>This page hasn't been built yet.</p>`}
</main>${EMBED_HEIGHT_SCRIPT}</body></html>`;
}

/**
 * The half of "copy embed code" that lives on the page itself.
 *
 * When the page is inside somebody else's site it says how tall it is, so the
 * frame grows instead of scrolling inside their layout. It does nothing at all
 * when the page is opened directly (`parent === window`), and it sends only a
 * number — never anything about the visitor.
 */
export const EMBED_HEIGHT_SCRIPT = `<script>
(function () {
  if (window.parent === window) return;
  var last = 0;
  function tell() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h === last) return;
    last = h;
    window.parent.postMessage({ type: "ia-landing-height", height: h }, "*");
  }
  window.addEventListener("load", tell);
  window.addEventListener("resize", tell);
  setInterval(tell, 1000);
})();
</script>`;

/**
 * The page's stylesheet.
 *
 * A string, travelling with the renderer, for the reason the document
 * renderer's does: a stylesheet a consumer has to remember to import is one a
 * consumer will forget, and the canvas and the hosted page would then be two
 * different pages.
 */
export const LANDING_CSS = `
:root{--accent:__ACCENT__}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;background:#fff}
.lp-page{max-width:760px;margin:0 auto}
.lp-sec{position:relative}
.lp-grid{display:grid;gap:24px;max-width:720px;margin:0 auto}
.lp-cols-2 .lp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.lp-cols-3 .lp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.lp-w-narrow .lp-grid{max-width:520px}
.lp-w-full .lp-grid{max-width:none}
.lp-hero{margin-bottom:1.5rem}
.lp-hero img{max-width:100%;border-radius:12px;margin-bottom:1.25rem}
.lp-hero h1{font-size:2rem;line-height:1.2;margin:0 0 .5rem}
.lp-sub{font-size:1.125rem;color:#475569;margin:0}
.lp-h{margin:0 0 .6rem;line-height:1.25}
h2.lp-h{font-size:1.4rem}h3.lp-h{font-size:1.1rem}
.lp-prose p,.lp-page p{margin:0 0 1rem}
.lp-list{padding-left:1.1rem;margin:0 0 1rem}.lp-list li{margin:.35rem 0}
.lp-fig{margin:0 0 1rem}.lp-fig img{max-width:100%;border-radius:10px;display:block}
.lp-fig figcaption{font-size:.85rem;color:#64748b;margin-top:.4rem}
.lp-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.6rem;margin:0 0 1rem}
.lp-gal img{width:100%;border-radius:8px;display:block}
.lp-hr{border:0;border-top:1px solid #e2e8f0;margin:1.5rem 0}
.lp-cta{text-align:center;margin:2rem 0}
.lp-btn{display:inline-block;color:#fff;text-decoration:none;padding:.85rem 1.75rem;border-radius:8px;font-weight:600;border:2px solid transparent}
.lp-btn-out{background:transparent;border-style:solid}
.lp-btn-plain{background:transparent;border-color:transparent;text-decoration:underline;padding:0}
.lp-quote{margin:0 0 1rem;padding:.9rem 1.1rem;border-left:3px solid var(--accent);background:#f8fafc}
.lp-quote p{margin:0 0 .4rem;font-style:italic}
.lp-quote footer{font-size:.85rem;color:#64748b}
.lp-social a{margin-right:1rem;color:var(--accent);font-weight:600;text-decoration:none}
.lp-video a{color:var(--accent);font-weight:600}
.lp-small{font-size:.8rem;color:#64748b}
.lp-form{margin-top:2rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
.lp-form h2{margin:0 0 1rem;font-size:1.25rem}
.lp-form input,.lp-form textarea{width:100%;padding:.65rem .75rem;margin-bottom:.75rem;border:1px solid #cbd5e1;border-radius:6px;font:inherit}
.lp-form button{color:#fff;border:0;padding:.75rem 1.5rem;border-radius:6px;font-weight:600;font-size:1rem;cursor:pointer}
.lp-drop{border:1px dashed #cbd5e1;border-radius:8px;padding:18px;text-align:center;color:#94a3b8}
.lp-unknown{border:1px dashed #cbd5e1;border-radius:6px;padding:10px;color:#94a3b8;font-size:.8rem}
.lp-empty:empty::before{content:attr(data-placeholder);color:#94a3b8}
[data-placeholder]:empty::before{content:attr(data-placeholder);color:#cbd5e1}
@media(max-width:640px){.lp-cols-2 .lp-grid,.lp-cols-3 .lp-grid{grid-template-columns:1fr}.lp-hero h1{font-size:1.5rem}.lp-page{padding:0}}
`;

/* ══════════════════════════════════════════════════════════════════════════
   The old five kinds
   ══════════════════════════════════════════════════════════════════════════ */

/** True for the flat array the stacked-card editor used to save. */
export function isLegacyLandingBlocks(v: unknown): boolean {
  const value = typeof v === "string" ? tryParse(v) : v;
  return Array.isArray(value);
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

const one = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({ ...extra, columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }], layout: 1 });

/**
 * hero / text / bullets / cta / form → sections.
 *
 * One section per old block, in the order they were in, because that is
 * exactly what the old editor drew: a stack of cards with up-and-down arrows.
 * Nothing is interpreted and nothing is lost.
 */
export function upgradeLandingBlocks(blocks: unknown, accent?: string): BuilderDocument {
  const list: any[] = Array.isArray(blocks) ? blocks : (Array.isArray(tryParse(String(blocks))) ? (tryParse(String(blocks)) as any[]) : []);
  const doc = emptyDocument({ style: "landing", ...(accent ? { accent } : {}) });
  doc.sections = list.map((b: any) => {
    switch (b?.type) {
      case "hero":
        return one([makeWidget("hero", {
          headline: String(b.headline ?? ""), sub: String(b.sub ?? ""),
          image: String(b.image ?? ""), alt: "", align: "Centre",
        })], { label: "Headline", padding: 32 });
      case "text":
        return one([makeWidget("paragraph", { text: String(b.body ?? "") })], { label: "Words", padding: 16 });
      case "bullets":
        return one([makeWidget("list", { items: Array.isArray(b.items) ? b.items.map(String) : [] })], { label: "Points", padding: 16 });
      case "cta":
        return one([makeWidget("button", {
          label: String(b.label ?? "Get in touch"), url: String(b.href ?? "#form"), style: "Solid", align: "Centre",
        })], { label: "Button", padding: 16 });
      case "form":
        return one([makeWidget("form", {
          heading: String(b.heading ?? "Get in touch"),
          submit_label: String(b.submitLabel ?? "Send"),
          fields: b.phone === false ? ["name", "email", "message"] : defaultFormFields(),
          ...(b.messagePlaceholder ? { label_message: String(b.messagePlaceholder) } : {}),
        })], { label: "Contact form", padding: 16 });
      default:
        return one([], { label: "Section", padding: 8 });
    }
  }).filter((s) => s.columns[0].widgets.length);
  return doc;
}

/** Read whatever `blocks_json` holds — a v2 document or the old array. */
export function openLandingDocument(blocksJson: unknown, accent?: string): BuilderDocument {
  const value = typeof blocksJson === "string" ? tryParse(blocksJson) : blocksJson;
  if (value && typeof value === "object" && !Array.isArray(value)
    && Number((value as any).v) === 2 && Array.isArray((value as any).sections)) {
    return deserialise(value);
  }
  return upgradeLandingBlocks(value, accent);
}

/* ══════════════════════════════════════════════════════════════════════════
   "Copy embed code"
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The snippet a business pastes into a website we do not run.
 *
 * An IFRAME, on purpose. §7's reasoning, kept: "converting to raw HTML for
 * them to paste is fragile and gets edited by hand; the hosted page keeps the
 * form → contact flow working." The little script is the only part that is
 * not plain markup, and all it does is listen for the page's own height so the
 * frame does not scroll inside their layout — a page with JavaScript switched
 * off still shows, at the fallback height.
 */
export function embedSnippet(publicUrl: string, opts: { height?: number; title?: string } = {}): string {
  const url = String(publicUrl || "").trim();
  const height = Math.max(200, Number(opts.height) || 900);
  const title = String(opts.title || "Landing page");
  return `<!-- ${title} — hosted by your Intelligent Analytics account -->
<iframe
  src="${escAttr(url)}"
  title="${escAttr(title)}"
  style="width:100%;border:0;min-height:${height}px"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"></iframe>
<script>
(function () {
  var origin = ${JSON.stringify(originOf(url))};
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "ia-landing-height") return;
    var frames = document.querySelectorAll('iframe[src^="' + origin + '"]');
    for (var i = 0; i < frames.length; i++) frames[i].style.minHeight = e.data.height + "px";
  });
})();
</script>`;
}

function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The origin of a URL, without needing the URL class to be present. */
export function originOf(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(url || ""));
  return m ? m[1] : "";
}
