/**
 * families/f6-money/payButtons.ts — ELEMENTOR'S **PayPal Button**
 * (`paypal-button`) and **Stripe Button** (`stripe-button`).
 *
 * The offer file lists BOTH, under website ▸ elementor_pro and
 * landing ▸ elementor_pro, and nowhere else. D-168 is absolute: a widget on a
 * panel is an Elementor widget by Elementor's own name, or an IA widget the
 * offer file names. So both tiles exist, with Elementor's own titles, sections
 * and control labels, and neither is offered in a proposal, a newsletter or
 * My Brand — paper cannot take a payment and a mailbox must not try.
 *
 * ── ONE PAY / DEPOSIT BUTTON, TWO TILES ───────────────────────────────────
 * The two widgets are the same object with a different processor behind it, so
 * there is ONE renderer (`renderPayButton`) and one set of shapes; the defs
 * differ only in the fields the processor needs. Two renderers would be two
 * places for the same button to drift.
 *
 * ── NO VENDOR NAME ON A CLIENT SCREEN ─────────────────────────────────────
 * Elementor ships `selected_icon` defaulted to the PayPal and Stripe brand
 * glyphs, which puts a processor's logo on the business's own page. We do not:
 * `selected_icon` starts EMPTY on both, and the renderer draws the author's own
 * Text and nothing else. Which processor takes the money is the business's
 * arrangement, not a badge on their page. This is the ONE default that
 * deliberately differs from Elementor's, and it is written here rather than
 * discovered later.
 *
 * ── WHAT IS DELIBERATELY NOT A CONTROL ────────────────────────────────────
 * PayPal's `sdk_token` and `sandbox_email` are not on the panel. A token is a
 * credential, and a credential typed into a page builder ends up inside a
 * stored document and inside every copy of it. The business connects its
 * processor once, in Settings; the widget says WHAT is being sold.
 *
 * ── THE PUBLISHED PAGE NEEDS JAVASCRIPT ───────────────────────────────────
 * Both widgets are scripted on the live site. The arion emitter therefore
 * carries a `fallback` for a site whose plan has no Pro widgets — see
 * `lib/websiteBuilder/families/f6-money/emitters.js`. It publishes a real
 * heading, the price and a button to the business's own payment page when the
 * author gave one, and REFUSES BY NAME when they did not, because a button
 * that looks like it takes a payment and does nothing is worse than a widget
 * the client is told they cannot have.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import { run } from "./run";
import type { FamilyWidgetDef, FamilyWidgetDef as Def } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's `align` — where the button sits in its box, as a cell align. */
function alignOf(v: unknown): string {
  switch (str(v)) {
    case "center": return "center";
    case "right": return "right";
    default: return "left";
  }
}

/**
 * What this button is asking for, in words, for the line under it on the
 * canvas. Never drawn for the customer — it is the author's own reassurance
 * that the widget knows the amount.
 */
export function payNote(p: Record<string, unknown>): string {
  const price = str((p as any).product_price || (p as any).stripe_product_price).trim();
  const donation = str((p as any).donation_type) === "any";
  if (donation) return "The person paying types the amount.";
  if (!price || Number(price) === 0) return "No amount set yet — this button will not take a payment.";
  const qty = Number(str((p as any).quantity || (p as any).stripe_quantity) || 1) || 1;
  return qty > 1 ? `${price} × ${qty}` : `${price}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The one renderer
   ══════════════════════════════════════════════════════════════════════════ */

export function renderPayButton(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const editing = ctx.mode === "edit";
  const label = str(p.text);
  if (!label.trim() && !editing) return "";
  const button = run("text", label, "Buy Now",
    `display:inline-block;padding:10px 20px;border-radius:${
      Math.max(0, Number(str(p.border_radius)) || 6)}px;background:${
      esc(str(p.background_color) || ctx.accent || "#0C4A60")};color:${
      esc(str(p.button_text_color) || "#FFFFFF")};font-weight:600;`, ctx, "span");
  /* Tables and inline styles, like the rest of the family — these two are not
     offered in the newsletter, but one shape across a family is one thing to
     learn and one thing to fix. */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" `
    + `style="border-collapse:collapse;"><tr><td align="${esc(alignOf(p.align))}">${button}`
    + (editing
      ? `<div style="font-size:11px;color:#94A3B8;padding-top:4px;">${esc(payNote(p))}</div>`
      : "")
    + `</td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The two definitions
   ══════════════════════════════════════════════════════════════════════════ */

/** Elementor's own Button section, shared by both — same labels, same order. */
const BUTTON_SECTION: Def["controls"] = [
  { key: "text", label: "Text", type: "text", tab: "content", section: "Button" },
  { key: "button_css_id", label: "Button ID", type: "text", tab: "content", section: "Button", help: "Only needed when something else on the page has to point at this button." },
];

/** Elementor's own Additional Options, minus the credential fields. */
const OPTIONS_SECTION: Def["controls"] = [
  { key: "redirect_after_success", label: "Redirect After Success", type: "link", tab: "content", section: "Additional Options", help: "Where the person lands once they have paid. A thank-you page is the usual one." },
  { key: "sandbox_mode", label: "Sandbox", type: "toggle", tab: "content", section: "Additional Options", help: "Test mode. No real money moves while this is on." },
  { key: "open_in_new_window", label: "Open In New Tab", type: "toggle", tab: "content", section: "Additional Options" },
  { key: "error_message_global", label: "Error Message", type: "text", tab: "content", section: "Additional Options" },
];

/** Elementor's own Button style section, shared by both. */
const BUTTON_STYLE: Def["controls"] = [
  {
    key: "align", label: "Position", type: "select", tab: "style", section: "Button", responsive: true,
    options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" },
      { value: "right", label: "Right" }, { value: "justify", label: "Full width" },
    ],
  },
  { key: "background_color", label: "Color", type: "colour", tab: "style", section: "Button" },
  { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Button" },
  { key: "typography_font_size", label: "Size", type: "number", tab: "style", section: "Button", responsive: true },
  { key: "border_radius", label: "Border Radius", type: "number", tab: "style", section: "Button", responsive: true },
];

const PAY_PICTURE = pictureFrom(box(8, 8, 48, 24) + bar(16, 17, 20, 6) + bar(41, 17, 8, 6));

export const PAYPAL_BUTTON_DEF: FamilyWidgetDef = {
  kind: "paypal_button",
  /** ELEMENTOR'S OWN TITLE. */
  label: "PayPal Button",
  description: "A Pay or Deposit button on the page. The money goes to your PayPal account.",
  icon: "Wallet",
  picture: PAY_PICTURE,
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    email: "", type: "checkout",
    product_name: "", product_sku: "", product_price: "",
    donation_type: "fixed", donation_amount: "",
    currency: "USD", billing_cycle: "months", auto_renewal: "yes",
    quantity: 1, shipping_price: 0, tax_type: "", tax_rate: "",
    /* ELEMENTOR SHIPS `fab fa-paypal` HERE. See the header: no processor's
       logo goes on a business's own page unless they put it there. */
    selected_icon: "",
    text: "Buy Now", button_css_id: "",
    redirect_after_success: "", sandbox_mode: "no", open_in_new_window: "yes",
    error_message_global: "An error occurred.",
    align: "", background_color: "", button_text_color: "", border_radius: "",
  },
  controls: [
    /* ── Content ▸ Pricing & Payments ─────────────────────────────────── */
    { key: "email", label: "PayPal Account", type: "text", tab: "content", section: "Pricing & Payments", help: "The email address the money should go to." },
    {
      key: "type", label: "Transaction Type", type: "select", tab: "content", section: "Pricing & Payments",
      options: [
        { value: "checkout", label: "Checkout" }, { value: "donation", label: "Donation" },
        { value: "subscription", label: "Subscription" },
      ],
    },
    { key: "product_name", label: "Item Name", type: "text", tab: "content", section: "Pricing & Payments" },
    { key: "product_sku", label: "SKU", type: "text", tab: "content", section: "Pricing & Payments" },
    { key: "product_price", label: "Price", type: "number", tab: "content", section: "Pricing & Payments" },
    {
      key: "donation_type", label: "Donation Amount", type: "select", tab: "content", section: "Pricing & Payments",
      options: [{ value: "fixed", label: "Fixed" }, { value: "any", label: "The person chooses" }],
      help: "Only used when Transaction Type is Donation.",
    },
    { key: "donation_amount", label: "Amount", type: "number", tab: "content", section: "Pricing & Payments" },
    {
      key: "currency", label: "Currency", type: "select", tab: "content", section: "Pricing & Payments",
      options: ["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => ({ value: c, label: c })),
    },
    {
      key: "billing_cycle", label: "Billing Cycle", type: "select", tab: "content", section: "Pricing & Payments",
      options: [
        { value: "days", label: "Days" }, { value: "weeks", label: "Weeks" },
        { value: "months", label: "Months" }, { value: "years", label: "Years" },
      ],
      help: "Only used when Transaction Type is Subscription.",
    },
    { key: "auto_renewal", label: "Auto Renewal", type: "toggle", tab: "content", section: "Pricing & Payments" },
    { key: "quantity", label: "Quantity", type: "number", tab: "content", section: "Pricing & Payments" },
    { key: "shipping_price", label: "Shipping Price", type: "number", tab: "content", section: "Pricing & Payments" },
    {
      key: "tax_type", label: "Tax", type: "select", tab: "content", section: "Pricing & Payments",
      options: [{ value: "", label: "None" }, { value: "percentage", label: "A percentage" }],
    },
    { key: "tax_rate", label: "Tax Percentage", type: "number", tab: "content", section: "Pricing & Payments" },
    ...BUTTON_SECTION,
    ...OPTIONS_SECTION,
    ...BUTTON_STYLE,
  ],
};

export const STRIPE_BUTTON_DEF: FamilyWidgetDef = {
  kind: "stripe_button",
  /** ELEMENTOR'S OWN TITLE. */
  label: "Stripe Button",
  description: "A Pay or Deposit button on the page. The money goes to your Stripe account.",
  icon: "CreditCard",
  picture: PAY_PICTURE,
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    product_name: "", stripe_product_price: "", stripe_currency: "USD", stripe_quantity: 1,
    donation_type: "fixed", donation_amount: "",
    shipping_price: 0, tax_rate: "",
    /* As PayPal: Elementor ships `fab fa-stripe-s` and we ship nothing. */
    selected_icon: "",
    text: "Buy Now", button_css_id: "",
    redirect_after_success: "", sandbox_mode: "no", open_in_new_window: "yes",
    error_message_global: "Something went wrong",
    align: "", background_color: "", button_text_color: "", border_radius: "",
  },
  controls: [
    /* ── Content ▸ Pricing & Payments ─────────────────────────────────── */
    { key: "product_name", label: "Product Name", type: "text", tab: "content", section: "Pricing & Payments" },
    { key: "stripe_product_price", label: "Product Price", type: "number", tab: "content", section: "Pricing & Payments" },
    {
      key: "stripe_currency", label: "Currency", type: "select", tab: "content", section: "Pricing & Payments",
      options: ["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => ({ value: c, label: c })),
    },
    { key: "stripe_quantity", label: "Quantity", type: "number", tab: "content", section: "Pricing & Payments" },
    {
      key: "donation_type", label: "Donation Amount", type: "select", tab: "content", section: "Pricing & Payments",
      options: [{ value: "fixed", label: "Fixed" }, { value: "any", label: "The person chooses" }],
    },
    { key: "donation_amount", label: "Amount", type: "number", tab: "content", section: "Pricing & Payments" },
    { key: "shipping_price", label: "Shipping Price", type: "number", tab: "content", section: "Pricing & Payments" },
    { key: "tax_rate", label: "Tax Percentage", type: "number", tab: "content", section: "Pricing & Payments" },
    ...BUTTON_SECTION,
    ...OPTIONS_SECTION,
    ...BUTTON_STYLE,
  ],
};
