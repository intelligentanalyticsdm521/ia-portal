/**
 * builder/adapters/website/siteRender.ts — the WEBSITE renderers.
 *
 * SD-010: "add a widget into a section and SEE THE REAL RESULT LIVE."
 *
 * ── WHAT "THE REAL RESULT" MEANS HERE ─────────────────────────────────────
 * Every function below draws one ARION section the way Elementor will draw it
 * on the live site: the hero's full-bleed band with the business's own colour
 * behind it, the services row as cards, the pricing row as price cards, the
 * contact section as methods beside a form. Deterministic HTML from the
 * section's own fields — not a screenshot, not an iframe, and above all not a
 * form beside a preview.
 *
 * It is the SAME renderer the Portal's own preview uses, which is the point:
 * acceptance row (d) is "preview shows exactly what the canvas shows", and
 * that can only be true if there is one function.
 *
 * ── HOW IT PLUGS IN ───────────────────────────────────────────────────────
 * `RenderContext.extra` (render.ts). The engine asks the adapter first and
 * falls through to its own switch for the widgets every builder shares, so
 * this file holds website knowledge and the engine holds none.
 *
 * ── EDIT MARKERS ──────────────────────────────────────────────────────────
 * `data-edit="<prop path>"` is what makes a run of text typeable on the
 * canvas (Canvas.tsx). The paths here are the ARION FIELD paths — `headline`,
 * `services.0.title` — so typing on the page writes straight into the fields
 * that get published. There is no second map of the layout to drift.
 *
 * Pure: strings in, string out.
 */
import type { Widget } from "../../model";
import { esc, type RenderContext } from "../../render";
import { STACK_QUERY } from "../../responsive";

/* ── small shared bits ──────────────────────────────────────────────────── */

/** Merge-fill then escape, exactly as the engine does. */
function t(v: unknown): string {
  return esc(String(v ?? ""));
}

/** An editable run. Empty in edit mode still renders, so it can be typed into. */
function run(path: string, value: unknown, cls: string, placeholder: string, ctx: RenderContext): string {
  const text = String(value ?? "");
  if (!text.trim() && ctx.mode !== "edit") return "";
  const empty = text.trim() ? "" : " sw-slot";
  return `<div class="${cls}${empty}" data-edit="${esc(path)}" data-placeholder="${esc(placeholder)}">${t(text)}</div>`;
}

function band(ctx: RenderContext, inner: string, style = ""): string {
  return `<div class="sw-band" style="${style}">${inner}</div>`;
}

function head(p: any, ctx: RenderContext, align = "center"): string {
  return `<div class="sw-head sw-${align}">
    ${run("headline", p.headline, "sw-h2", "Add a heading…", ctx)}
    ${run("subheadline", p.subheadline, "sw-sub", "One supporting line…", ctx)}
  </div>`;
}

function list(p: any, key: string): any[] {
  return Array.isArray(p?.[key]) ? p[key] : [];
}

function imageOrSlot(url: unknown, alt: unknown, cls: string, note: string): string {
  const src = String(url || "");
  if (!src) return `<div class="${cls} sw-imgslot">${esc(note)}</div>`;
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(String(alt || ""))}"/>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The eleven archetypes
   ══════════════════════════════════════════════════════════════════════════ */

function hero(p: any, ctx: RenderContext): string {
  const bg = String(p.image_url || "")
    ? `background-image:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url(${esc(p.image_url)});background-size:cover;background-position:center`
    : `background:${esc(ctx.accent)}`;
  return band(ctx, `
    <div class="sw-hero">
      ${run("headline", p.headline, "sw-h1", "Your headline…", ctx)}
      ${run("subheadline", p.subheadline, "sw-lead", "One line about what you do…", ctx)}
      <div class="sw-btnrow">
        <span class="sw-btn" style="background:#FFFFFF;color:${esc(ctx.accent)}" data-edit="cta_text" data-placeholder="Button text…">${t(p.cta_text)}</span>
      </div>
    </div>`, `${bg};color:#FFFFFF;min-height:220px`);
}

function services(p: any, ctx: RenderContext): string {
  const items = list(p, "services");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-row sw-row-${Math.min(4, Math.max(1, items.length))}">
      ${items.map((s, i) => `
        <div class="sw-card">
          <div class="sw-icon" style="background:${esc(ctx.accent)}22;color:${esc(ctx.accent)}">${esc((s?.icon_name || "•").slice(0, 2))}</div>
          ${run(`services.${i}.title`, s?.title, "sw-cardtitle", "Service name…", ctx)}
          ${run(`services.${i}.description`, s?.description, "sw-cardtext", "What it is…", ctx)}
        </div>`).join("")}
    </div>`);
}

function testimonials(p: any, ctx: RenderContext): string {
  const items = list(p, "testimonials");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-row sw-row-${Math.min(3, Math.max(1, items.length))}">
      ${items.map((q, i) => `
        <div class="sw-card sw-quote">
          <div class="sw-stars" style="color:${esc(ctx.accent)}">${"★".repeat(Math.max(1, Math.min(5, Number(q?.rating) || 5)))}</div>
          ${run(`testimonials.${i}.quote`, q?.quote, "sw-cardtext", "What they said…", ctx)}
          ${run(`testimonials.${i}.attribution`, q?.attribution, "sw-attrib", "Who said it…", ctx)}
          ${run(`testimonials.${i}.role`, q?.role, "sw-role", "Their job or company…", ctx)}
        </div>`).join("")}
    </div>`);
}

function cta(p: any, ctx: RenderContext): string {
  return band(ctx, `
    <div class="sw-hero">
      ${run("headline", p.headline, "sw-h2", "Ready to get started?", ctx)}
      ${run("subheadline", p.subheadline, "sw-lead", "One line…", ctx)}
      <div class="sw-btnrow">
        <span class="sw-btn" style="background:#FFFFFF;color:${esc(ctx.accent)}" data-edit="primary_cta_text" data-placeholder="Button text…">${t(p.primary_cta_text)}</span>
        ${p.secondary_cta_text || ctx.mode === "edit"
      ? `<span class="sw-btn sw-btn-ghost" data-edit="secondary_cta_text" data-placeholder="Second button…">${t(p.secondary_cta_text)}</span>`
      : ""}
      </div>
    </div>`, `background:linear-gradient(135deg,${esc(ctx.accent)},${esc(ctx.accent)}CC);color:#FFFFFF`);
}

function about(p: any, ctx: RenderContext): string {
  const paras: string[] = Array.isArray(p.story_paragraphs) ? p.story_paragraphs : [];
  const values = list(p, "values");
  return band(ctx, `
    <div class="sw-split">
      <div class="sw-splitimg">${imageOrSlot(p.image_url, p.image_alt, "sw-img", "Choose a picture in the panel on the right")}</div>
      <div class="sw-splitcopy">
        ${run("headline", p.headline, "sw-h2", "About the business…", ctx)}
        ${run("subheadline", p.subheadline, "sw-em", "One line…", ctx)}
        ${(paras.length ? paras : ctx.mode === "edit" ? [""] : []).map((para, i) =>
    run(`story_paragraphs.${i}`, para, "sw-p", "Your story…", ctx)).join("")}
      </div>
    </div>
    ${values.length ? `<div class="sw-row sw-row-${Math.min(3, values.length)}">${values.map((v, i) => `
      <div class="sw-card">
        ${run(`values.${i}.title`, v?.title, "sw-cardtitle", "What you stand for…", ctx)}
        ${run(`values.${i}.description`, v?.description, "sw-cardtext", "In one line…", ctx)}
      </div>`).join("")}</div>` : ""}`);
}

function faq(p: any, ctx: RenderContext): string {
  const items = list(p, "faqs");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-acc">
      ${items.map((f, i) => `
        <div class="sw-accrow">
          <div class="sw-accq">
            <span class="sw-accmark" style="color:${esc(ctx.accent)}">+</span>
            ${run(`faqs.${i}.question`, f?.question, "sw-accqt", "A question…", ctx)}
          </div>
          ${run(`faqs.${i}.answer`, f?.answer, "sw-acca", "Your answer…", ctx)}
        </div>`).join("")}
    </div>`);
}

function gallery(p: any, ctx: RenderContext): string {
  const images = list(p, "images");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-grid">
      ${images.map((img, i) => `
        <figure class="sw-gcell">
          ${imageOrSlot(img?.url, img?.alt, "sw-gimg", "Picture")}
          ${run(`images.${i}.caption`, img?.caption, "sw-cap", "Caption…", ctx)}
        </figure>`).join("")}
      ${!images.length && ctx.mode === "edit" ? `<div class="sw-imgslot">Choose pictures in the panel on the right</div>` : ""}
    </div>`);
}

function pricing(p: any, ctx: RenderContext): string {
  const plans = list(p, "plans");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-row sw-row-${Math.min(4, Math.max(1, plans.length))}">
      ${plans.map((plan, i) => {
    const features: string[] = Array.isArray(plan?.features) ? plan.features : [];
    return `
        <div class="sw-card sw-plan">
          ${run(`plans.${i}.name`, plan?.name, "sw-cardtitle", "Package name…", ctx)}
          <div class="sw-price">
            <span class="sw-amount" style="color:${esc(ctx.accent)}" data-edit="plans.${i}.price" data-placeholder="$0">${t(plan?.price)}</span>
            <span class="sw-period" data-edit="plans.${i}.period" data-placeholder="per month">${t(plan?.period)}</span>
          </div>
          ${run(`plans.${i}.summary`, plan?.summary, "sw-cardtext", "One line about it…", ctx)}
          <ul class="sw-feats">${(features.length ? features : ctx.mode === "edit" ? [""] : [])
      .map((f, j) => `<li data-edit="plans.${i}.features.${j}" ${String(f || "").trim() ? "" : 'class="sw-slot" data-placeholder="add a line…"'}>${t(f)}</li>`).join("")}</ul>
          <span class="sw-btn" style="background:${esc(ctx.accent)};color:#fff" data-edit="plans.${i}.cta_text" data-placeholder="Button text…">${t(plan?.cta_text)}</span>
        </div>`;
  }).join("")}
    </div>`);
}

function team(p: any, ctx: RenderContext): string {
  const members = list(p, "members");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-row sw-row-${Math.min(4, Math.max(1, members.length))}">
      ${members.map((m, i) => `
        <div class="sw-card sw-person">
          ${imageOrSlot(m?.photo_url, m?.photo_alt, "sw-avatar", "Photo")}
          ${run(`members.${i}.name`, m?.name, "sw-cardtitle", "Name…", ctx)}
          ${run(`members.${i}.role`, m?.role, "sw-cardtext", "What they do…", ctx)}
        </div>`).join("")}
    </div>`);
}

function stats(p: any, ctx: RenderContext): string {
  const items = list(p, "stats");
  return band(ctx, `${head(p, ctx)}
    <div class="sw-row sw-row-${Math.min(4, Math.max(1, items.length))}">
      ${items.map((s, i) => `
        <div class="sw-stat">
          <div class="sw-statnum" style="color:${esc(ctx.accent)}">
            <span data-edit="stats.${i}.prefix" data-placeholder="$">${t(s?.prefix)}</span><span
              data-edit="stats.${i}.value" data-placeholder="0">${t(s?.value)}</span><span
              data-edit="stats.${i}.suffix" data-placeholder="+">${t(s?.suffix)}</span>
          </div>
          ${run(`stats.${i}.label`, s?.label, "sw-statlabel", "What it counts…", ctx)}
        </div>`).join("")}
    </div>`, "background:#F1F5F9");
}

function contact(p: any, ctx: RenderContext): string {
  const methods = list(p, "contact_methods");
  const fields: string[] = Array.isArray(p.form_fields) ? p.form_fields : [];
  return band(ctx, `${head(p, ctx)}
    <div class="sw-split">
      <div class="sw-splitcopy">
        ${methods.map((m, i) => `
          <div class="sw-method">
            <span class="sw-dot" style="background:${esc(ctx.accent)}"></span>
            <span class="sw-mlabel" data-edit="contact_methods.${i}.label" data-placeholder="Label…">${t(m?.label)}</span>
            <span class="sw-mvalue" data-edit="contact_methods.${i}.value" data-placeholder="Value…">${t(m?.value)}</span>
          </div>`).join("")}
        ${!methods.length && ctx.mode === "edit" ? `<div class="sw-imgslot">Add ways to reach you in the panel on the right</div>` : ""}
      </div>
      <div class="sw-splitcopy">
        <div class="sw-form">
          ${(fields.length ? fields : ["Name", "Email", "Message"]).map((f, i) => `
            <label class="sw-field"><span data-edit="form_fields.${i}">${t(f)}</span><i class="sw-input"></i></label>`).join("")}
          <span class="sw-btn" style="background:${esc(ctx.accent)};color:#fff" data-edit="submit_text" data-placeholder="Send">${t(p.submit_text || "Send")}</span>
          <div class="sw-formnote">Goes to ${t(p.email_to) || "<em>nobody yet — set your business email</em>"}</div>
        </div>
      </div>
    </div>`);
}

/* ══════════════════════════════════════════════════════════════════════════
   The locked one
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A section somebody built on the website itself.
 *
 * It is drawn as a LOCKED block that says what it is and what its first words
 * are, and it is carried back byte for byte on every save. Never blank, never
 * silently dropped, and never pretending to be editable — "nothing is lost
 * silently" is the acceptance rule this answers.
 */
function custom(p: any, ctx: RenderContext): string {
  const lock = p.__lock || {};
  const preview = String(lock.preview || "").trim();
  return `<div class="sw-locked">
    <div class="sw-lockhead">
      <span class="sw-lockicon">🔒</span>
      <span class="sw-locktitle">${esc(lock.label || "Kept exactly as it is")}</span>
    </div>
    ${preview ? `<div class="sw-lockpreview">“${esc(preview)}”</div>` : ""}
    <div class="sw-locknote">${esc(
    lock.why || "It stays exactly as it is. Publishing this page does not change one byte of it.",
  )}</div>
  </div>`;
}

/**
 * ONE WIDGET ON THE CLIENT'S PAGE THAT WE HAVE NO ROW FOR (B-168, 2026-09-22).
 *
 * Everything around it on the page is editable; this one is not, and it says
 * so by name and says where it CAN be changed. It is written back to the
 * website byte for byte, so it is never a hole in somebody's live page — which
 * is the whole reason a page with one on it still opens.
 */
function opaque(p: any, _ctx: RenderContext): string {
  const what = String(p.__widgetType || "").trim();
  return `<div class="sw-locked">
    <div class="sw-lockhead">
      <span class="sw-lockicon">🔒</span>
      <span class="sw-locktitle">${esc(what ? `Built with ${what}` : "Built on the website")}</span>
    </div>
    <div class="sw-locknote">${esc(
    "This part was built on the website itself and we cannot change it here. "
    + "It stays exactly as it is — edit it in WordPress, or ask us to change it.",
  )}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The two content blocks the engine does not draw
   ══════════════════════════════════════════════════════════════════════════ */

function video(p: any, ctx: RenderContext): string {
  const url = String(p.url || "");
  return `<div class="sw-video">${url
    ? `<span class="sw-play">▶</span><span class="sw-videourl">${esc(url)}</span>`
    : `<span class="sw-videourl">Paste a YouTube or Vimeo address in the panel on the right</span>`}</div>`;
}

function map(p: any, ctx: RenderContext): string {
  const address = String(p.address || "");
  return `<div class="sw-map"><span class="sw-pin" style="color:${esc(ctx.accent)}">📍</span>
    <span class="sw-mapaddr" data-edit="address" data-placeholder="Type an address…">${t(address)}</span></div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The plug-in point
   ══════════════════════════════════════════════════════════════════════════ */

const SITE_RENDERERS: Record<string, (p: any, ctx: RenderContext) => string> = {
  site_hero: hero,
  site_services: services,
  site_testimonials: testimonials,
  site_cta: cta,
  site_about: about,
  site_faq: faq,
  site_gallery: gallery,
  site_pricing: pricing,
  site_team: team,
  site_stats: stats,
  site_contact: contact,
  site_custom: custom,
  opaque,
  video,
  map,
};

/** Every widget kind this file draws. The parity test reads this. */
export const SITE_RENDERED_KINDS = Object.keys(SITE_RENDERERS);

/**
 * Offered in the pane, deliberately NOT drawn as a widget.
 *
 * `site_content` is the free section, and a free section on the canvas IS its
 * blocks — a heading, a paragraph, a picture, each drawn by the engine. There
 * is no "content widget" on the page to draw, only the section that holds
 * them, so choosing it in the pane creates a SECTION and never a widget. Listed
 * here so the parity test can tell a deliberate omission from a forgotten one,
 * exactly as the engine's own UNRENDERED_KINDS does for `columns`.
 */
export const SITE_UNRENDERED_KINDS = ["site_content"] as const;

/** `RenderContext.extra`. Returns null for anything the engine already draws. */
export function renderSiteWidget(w: Widget, ctx: RenderContext): string | null {
  const fn = SITE_RENDERERS[w.kind];
  if (!fn) return null;
  return fn(w.props || {}, ctx);
}

/**
 * Which of a section's fields are typed ON THE PAGE.
 *
 * DERIVED FROM THE RENDERER, never listed beside it. The inspector's job is
 * "everything that has no place on the page" (Inspector.tsx), and the only
 * honest way to know which fields those are is to ask the renderer what it
 * made editable. A second list would drift the first time a renderer gained a
 * run, and the client would get the same box twice.
 *
 * `services.0.title` comes back as BOTH the exact path and the pattern
 * `services.*.title`, so a list's sub-field can be matched without knowing how
 * many items there are.
 */
export function editablePaths(w: Widget, ctx: RenderContext): Set<string> {
  const out = new Set<string>();
  const html = renderSiteWidget(w, { ...ctx, mode: "edit" });
  if (!html) return out;
  for (const m of html.matchAll(/data-edit="([^"]+)"/g)) {
    const path = m[1];
    out.add(path);
    out.add(path.replace(/\.\d+\./g, ".*."));
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   The stylesheet
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Travels WITH the renderers, for the reason DOCUMENT_CSS does: a stylesheet a
 * consumer has to remember to import is a stylesheet a consumer will forget,
 * and then the canvas and the preview show two different pages.
 */
export const SITE_CSS = `
.bx-doc.bx-style-site { font-size: 14px; }
.bx-style-site .bx-sec { padding: 0 !important; }
.bx-style-site .bx-grid { gap: 0; }
.bx-style-site .bx-w { margin: 0; }
.sw-band { padding: 40px 36px; }
.sw-head { margin-bottom: 20px; }
.sw-center { text-align: center; }
.sw-h1 { font-family: var(--bx-head, Inter), system-ui, sans-serif; font-size: 30px; font-weight: 800; line-height: 1.15; margin-bottom: 10px; }
.sw-h2 { font-family: var(--bx-head, Inter), system-ui, sans-serif; font-size: 22px; font-weight: 700; line-height: 1.2; margin-bottom: 6px; }
.sw-sub, .sw-lead { font-size: 14px; opacity: .85; line-height: 1.5; }
.sw-lead { font-size: 15px; max-width: 520px; margin: 0 auto 14px; }
.sw-p { margin-bottom: 8px; line-height: 1.6; }
.sw-em { font-style: italic; opacity: .8; margin-bottom: 8px; }
.sw-hero { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; }
.sw-btnrow { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 6px; }
.sw-btn { display: inline-block; border-radius: 6px; padding: 9px 18px; font-weight: 700; font-size: 13px; }
.sw-btn-ghost { background: transparent; border: 1px solid currentColor; color: inherit; }
.sw-row { display: grid; gap: 16px; }
.sw-row-1 { grid-template-columns: 1fr; }
.sw-row-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
.sw-row-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
.sw-row-4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
.sw-card { border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px; background: #fff; }
.sw-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; font-size: 12px; }
.sw-cardtitle { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.sw-cardtext { font-size: 13px; color: #475569; line-height: 1.5; }
.sw-quote .sw-cardtext { font-style: italic; }
.sw-stars { letter-spacing: 2px; margin-bottom: 6px; }
.sw-attrib { font-weight: 700; font-size: 13px; margin-top: 8px; }
.sw-role { font-size: 12px; color: #64748B; }
.sw-split { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 28px; align-items: start; margin-bottom: 20px; }
.sw-img { width: 100%; border-radius: 10px; display: block; max-height: 220px; object-fit: cover; }
.sw-imgslot { border: 1px dashed #CBD5E1; border-radius: 10px; padding: 26px 14px; text-align: center; color: #94A3B8; font-size: 12px; }
.sw-acc { display: grid; gap: 8px; }
.sw-accrow { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; background: #fff; }
.sw-accq { display: flex; gap: 8px; align-items: baseline; font-weight: 700; }
.sw-accmark { font-size: 18px; line-height: 1; }
.sw-acca { font-size: 13px; color: #475569; margin-top: 6px; line-height: 1.5; }
.sw-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
.sw-gcell { margin: 0; }
.sw-gimg { width: 100%; height: 100px; object-fit: cover; border-radius: 8px; display: block; }
.sw-cap { font-size: 11px; color: #64748B; margin-top: 4px; }
.sw-plan { text-align: center; }
.sw-price { display: flex; align-items: baseline; justify-content: center; gap: 5px; margin: 8px 0; }
.sw-amount { font-size: 26px; font-weight: 800; }
.sw-period { font-size: 12px; color: #64748B; }
.sw-feats { list-style: none; padding: 0; margin: 10px 0; font-size: 13px; color: #475569; }
.sw-feats li { padding: 3px 0; border-bottom: 1px solid #F1F5F9; }
.sw-person { text-align: center; }
.sw-avatar { width: 72px; height: 72px; border-radius: 999px; object-fit: cover; margin: 0 auto 10px; display: block; }
.sw-person .sw-imgslot { width: 72px; height: 72px; border-radius: 999px; margin: 0 auto 10px; padding: 0; display: flex; align-items: center; justify-content: center; }
.sw-stat { text-align: center; }
.sw-statnum { font-size: 30px; font-weight: 800; line-height: 1.1; }
.sw-statlabel { font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; margin-top: 4px; }
.sw-method { display: flex; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; }
.sw-dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; flex: 0 0 auto; }
.sw-mlabel { font-weight: 700; }
.sw-form { border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px; background: #fff; }
.sw-field { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 10px; }
.sw-input { display: block; height: 30px; border: 1px solid #CBD5E1; border-radius: 6px; margin-top: 4px; background: #F8FAFC; }
.sw-formnote { font-size: 11px; color: #64748B; margin-top: 10px; }
.sw-locked { border: 1px dashed #94A3B8; border-radius: 10px; background: repeating-linear-gradient(45deg,#F8FAFC,#F8FAFC 10px,#F1F5F9 10px,#F1F5F9 20px); padding: 16px 18px; margin: 12px 20px; }
.sw-lockhead { display: flex; align-items: center; gap: 8px; }
.sw-locktitle { font-weight: 700; font-size: 13px; }
.sw-lockchip { color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-radius: 999px; padding: 2px 9px; }
.sw-lockpreview { font-size: 13px; color: #334155; margin-top: 8px; font-style: italic; }
.sw-locknote { font-size: 11px; color: #64748B; margin-top: 6px; }
.sw-video { border: 1px solid #E2E8F0; border-radius: 10px; background: #0F172A; color: #E2E8F0; padding: 24px; display: flex; gap: 10px; align-items: center; justify-content: center; font-size: 12px; }
.sw-play { font-size: 20px; }
.sw-map { border: 1px solid #E2E8F0; border-radius: 10px; background: #EEF2F7; padding: 26px; display: flex; gap: 8px; align-items: center; justify-content: center; font-size: 13px; }
.sw-slot:empty::before { content: attr(data-placeholder); color: #94A3B8; }
.sw-slot:empty { min-height: 1.3em; display: block; }
.sw-chrome-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; border-bottom: 1px solid #E2E8F0; background: #FFFFFF; font-size: 12px; }
.sw-chrome-foot { border-top: 1px solid #E2E8F0; background: #0F172A; color: #CBD5E1; padding: 18px 24px; font-size: 11px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sw-chrome-brand { font-weight: 800; font-size: 14px; color: #0F172A; }
.sw-chrome-nav { display: flex; gap: 14px; color: #475569; flex-wrap: wrap; }
/* ── THE PHONE ──────────────────────────────────────────────────────────────
   The same container query DOCUMENT_CSS uses (responsive.ts), so a page is
   drawn the same way by the canvas's phone preview and by the phone. It was a
   MEDIA query until 2026-09-16, which meant the preview could only ever show
   the desktop layout however narrow the paper was made. */
${STACK_QUERY} {
  .sw-row-2, .sw-row-3, .sw-row-4, .sw-split, .sw-grid { grid-template-columns: 1fr; }
  /* 36px each side of a 390px screen is a fifth of the page. */
  .sw-band { padding: 28px 20px; }
  .sw-locked { margin: 12px 0; padding: 14px; }
  .sw-h1 { font-size: 24px; }
  .sw-h2 { font-size: 19px; }
  .sw-split { gap: 18px; }
  .sw-img { max-height: 180px; }
  .sw-gimg { height: 140px; }
  .sw-btnrow { justify-content: flex-start; }
  .sw-hero .sw-btnrow { justify-content: center; }
  /* The theme's own header and footer wrap rather than push the page sideways. */
  .sw-chrome-bar { flex-wrap: wrap; padding: 12px 20px; gap: 8px; }
  .sw-chrome-foot { padding: 16px 20px; }
  .sw-method { flex-wrap: wrap; }
  .sw-doc img, .sw-card img { max-width: 100%; height: auto; }
}
`;

/* ══════════════════════════════════════════════════════════════════════════
   The site's own header and footer — chrome, not page content
   ══════════════════════════════════════════════════════════════════════════ */

export interface SiteChrome {
  businessName: string;
  logoUrl?: string | null;
  menu: Array<{ label: string; url?: string }>;
  contactLine?: string;
}

/**
 * The header a visitor sees above every page.
 *
 * It belongs to the THEME, not to the page — it is the same on every page and
 * it is edited under Website → Menus. Drawing it here is honest (the page does
 * not start at the hero) and drawing it as CHROME rather than as a section is
 * the other half of that honesty: there is nothing here anybody can delete.
 */
export function renderHeaderChrome(c: SiteChrome): string {
  const brand = c.logoUrl
    ? `<img src="${esc(c.logoUrl)}" alt="" style="height:26px"/>`
    : `<span class="sw-chrome-brand">${esc(c.businessName || "Your business")}</span>`;
  const menu = (c.menu || []).slice(0, 7)
    .map((m) => `<span>${esc(m.label)}</span>`).join("");
  return `<div class="sw-chrome-bar">${brand}<nav class="sw-chrome-nav">${
    menu || `<span>Home</span><span>Services</span><span>About</span><span>Contact</span>`}</nav></div>`;
}

export function renderFooterChrome(c: SiteChrome): string {
  return `<div class="sw-chrome-foot">
    <span>© ${new Date().getFullYear()} ${esc(c.businessName || "Your business")}</span>
    <span>${esc(c.contactLine || "")}</span>
  </div>`;
}
