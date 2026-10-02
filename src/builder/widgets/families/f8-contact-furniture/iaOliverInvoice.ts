/**
 * f8-contact-furniture/iaOliverInvoice.ts — **IA OLIVER Invoice**, deepened.
 *
 * A customer's own invoice, drawn on the client's website once that customer is
 * signed in. Offered on `website.ia` and nowhere else — a hosted landing page
 * has no signed-in customer to show an invoice to, which is why b168/seams took
 * it off the landing panel.
 *
 * ── WHERE EVERY KEY COMES FROM ────────────────────────────────────────────
 * `ia_oliver_invoice` is a REAL REGISTERED ELEMENTOR WIDGET in the IA WordPress
 * plugin. The 2026-09-17 scrape records title "IA OLIVER Invoice", category
 * `intelligent-analytics`, four sections and thirteen keys:
 *
 *   Content · **Business Information**  business_logo_url · business_name ·
 *                                       business_phone · business_email
 *   Content · **Book Again CTA**        show_book_again_cta · book_again_url ·
 *                                       book_again_text
 *   Content · **API Settings**          oliver_api_base   ← NOT a control, below
 *   Style   · **Style**                 accent_color
 *
 * Before today: `pluginDef(… defaults: {}, controls: [])` — a tile with an
 * empty panel drawing a dashed grey box. Same `kind`, so a page saved before
 * today opens and draws.
 *
 * ── WHAT A DATABASE TWIN MEANS HERE ───────────────────────────────────────
 * The four Business Information keys are the business's OWN details, and the
 * builder already knows them: `ctx.business` carries the name, the contact line
 * and the logo. So the canvas fills them in from the profile and the author
 * only types when they want something different on this one page. That is
 * D-168's "pull it in automatically" in one widget.
 *
 * ── THE ONE KEY THAT IS DELIBERATELY NOT A CONTROL ────────────────────────
 * `oliver_api_base` — the address of the OLIVER API the plugin calls. It is a
 * deployment fact, not a design choice, and a business owner who mistypes it
 * takes their own invoice page down with no way of knowing why. The plugin's
 * own default is the production API. It is left out on purpose, it is not
 * published from here, and it is written in the handoff so the decision is
 * visible rather than missing.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { esc } from "../../../esc";
import { bar, box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
/** A switch whose default is ON: absent means the default, never "off". */
const onByDefault = (v: unknown): boolean => !(v === false || v === "no" || v === "");

/**
 * WHAT THE CANVAS DRAWS: an invoice header the author can see and lay out —
 * the logo, the business's own name and details, one specimen line, and the
 * Book Again button when its switch is on. The accent colour is on the rule and
 * on the button, so changing it is visible at once.
 *
 * The REAL invoice lines come from OLIVER at the moment the customer opens the
 * page; the canvas says so in one sentence while the page is being built,
 * because a made-up amount on a builder canvas is a number somebody will read
 * as real.
 */
export function renderIaOliverInvoice(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const accent = str(p.accent_color) || ctx.accent;
  const logo = str(p.business_logo_url) || str(ctx.business?.logoUrl || "");
  const name = str(p.business_name) || str(ctx.business?.name || "");
  const phone = str(p.business_phone);
  const email = str(p.business_email);
  const contact = [phone, email].filter((s) => s.trim()).join(" · ")
    || str(ctx.business?.contactLine || "");

  const head = `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;
      border-bottom:2px solid ${esc(accent)};padding-bottom:8px">
    <div style="display:flex;gap:10px;align-items:center">
      ${logo ? `<img src="${esc(logo)}" alt="" style="height:28px;width:auto"/>` : ""}
      <div>
        ${editRun("business_name", name, "bx-inv-n", "Your business name", ctx, "strong")}
        ${editRun("business_phone", phone, "bx-inv-p", "Phone number", ctx, "span")}
        ${editRun("business_email", email, "bx-inv-e", "Email address", ctx, "span")}
        ${!phone && !email && contact
          ? `<span style="font-size:11px;color:#5A7A8A">${esc(contact)}</span>` : ""}
      </div>
    </div>
    <span style="font-size:12px;color:${esc(accent)};font-weight:700">INVOICE</span>
  </div>`;

  const body = `<div style="padding:10px 0;font-size:12px;color:#5A7A8A">
    ${ctx.mode === "edit"
      ? "Your customer's own lines and total show here when they are signed in."
      : ""}
  </div>`;

  const cta = onByDefault(p.show_book_again_cta)
    ? `<a class="bx-button" href="${esc(str(p.book_again_url) || "#")}"
        style="background:${esc(accent)};display:inline-block">${
      ctx.mode === "edit"
        ? editRun("book_again_text", p.book_again_text ?? "Schedule your next service",
          "bx-inv-c", "Schedule your next service", ctx, "span")
        : esc(str(p.book_again_text) || "Schedule your next service")}</a>`
    : "";

  return `<div class="bx-invoice" style="border:1px solid #E2E8F0;border-radius:8px;padding:12px">
    ${head}${body}${cta}</div>`;
}

export const IA_OLIVER_INVOICE_DEF: FamilyWidgetDef = {
  kind: "ia_oliver_invoice",
  label: "IA OLIVER Invoice",
  description: "A customer's own invoice, shown once they are signed in.",
  icon: "Receipt",
  picture: pictureFrom(box(14, 4, 36, 32) + bar(19, 11, 20, 3) + bar(19, 19, 26, 3) + bar(19, 27, 14, 3)),
  category: "Intelligent Analytics",
  builders: ["website"],
  tier: "ia:oliver",
  defaults: {
    business_logo_url: "",
    business_name: "",
    business_phone: "",
    business_email: "",
    show_book_again_cta: "yes",
    book_again_url: "",
    book_again_text: "Schedule your next service",
    accent_color: "",
  },
  controls: [
    /* ── Content · "Business Information" (section_business) ──────────── */
    { key: "business_logo_url", label: "Business Logo", type: "image", tab: "content",
      section: "Business Information", help: "Leave it empty to use the logo on your profile" },
    { key: "business_name", label: "Business Name", type: "text", tab: "content",
      section: "Business Information" },
    { key: "business_phone", label: "Phone Number", type: "text", tab: "content",
      section: "Business Information" },
    { key: "business_email", label: "Email Address", type: "text", tab: "content",
      section: "Business Information" },

    /* ── Content · "Book Again CTA" (section_cta) ─────────────────────── */
    { key: "show_book_again_cta", label: "Show Book Again CTA", type: "toggle", tab: "content",
      section: "Book Again CTA" },
    { key: "book_again_url", label: "Book Again URL", type: "link", tab: "content",
      section: "Book Again CTA" },
    { key: "book_again_text", label: "Book Again Text", type: "text", tab: "content",
      section: "Book Again CTA" },

    /* ── Style · "Style" (section_style) ──────────────────────────────── */
    { key: "accent_color", label: "Accent Color", type: "colour", tab: "style", section: "Style" },
  ],
};
