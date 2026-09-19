/**
 * f8-contact-furniture/login.ts — Elementor's **Login**, by its own name.
 *
 * Offer file: `login` is under `website.elementor_pro` and
 * `landing.elementor_pro`. It is NOT in the newsletter, proposal or My Brand
 * lists, so it is offered on those two and nowhere else.
 *
 * ── SO WHAT DOES IT LOG SOMEBODY INTO? ────────────────────────────────────
 * The WEBSITE. This is WordPress's own sign-in box drawn on a page, and it is
 * the site's own accounts it signs people into — not the client portal, which
 * is CIAM (`reference_ciam_architecture`) and has its own door. The sentence
 * under the tile says so in the author's own words, because a business owner
 * who drops this expecting the customer portal and gets a WordPress login has
 * been misled by us and not by Elementor.
 *
 * ── WHERE EVERY NAME AND DEFAULT BELOW COMES FROM ─────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `login`: title "Login",
 * category `pro-elements`, Content sections **Form Fields**, **Button** and
 * **Additional Options**, Style sections **Form**, **Label**, **Fields**,
 * **Button** and **Logged in Message**. Keys, labels, options and defaults are
 * copied from it.
 *
 * ── THE HOVER AND THE GRADIENT ARE NOT HERE ───────────────────────────────
 * Elementor's Button style section carries a whole background GROUP — classic
 * or gradient, two colours, an angle, a slideshow, Ken Burns — and a second
 * copy of the lot for hover. The panel draws single colours, and a gradient
 * stop control that stored a number nothing read would be the dead control
 * this family is trying not to ship. The plain colours are here; the rest is
 * in the handoff.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
const on = (v: unknown): boolean => v === true || v === "yes";

/** Elementor's own Input Size / Size list, shared with Form. */
const SIZES = [
  { value: "xs", label: "Extra Small" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

/** Elementor's Alignment `choose` for the button: start / center / end / stretch. */
const ALIGN = [
  { value: "start", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "end", label: "Right" },
  { value: "stretch", label: "Full width" },
];

const PAD: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };

/** …and the BUTTON's own padding per size, which is a different control. */
const BUTTON_PAD: Record<string, string> = {
  xs: "6px 12px", sm: "9px 16px", md: "11px 20px", lg: "13px 26px", xl: "16px 34px",
};

/** Where the button sits, from Elementor's four alignment values. */
function justify(align: string): string {
  if (align === "center") return "center";
  if (align === "end") return "flex-end";
  return "flex-start";
}

/**
 * WHAT THE CANVAS DRAWS: the signed-OUT state, which is the one an author is
 * laying out. Username, password, Remember Me, the button, and the lost
 * password link — each one only when its switch is on, so turning a switch off
 * in the panel is visible on the page immediately.
 */
export function renderLogin(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const showLabels = p.show_labels == null ? true : on(p.show_labels) || p.show_labels === true;
  const pad = PAD[str(p.input_size) || "sm"] ?? 8;
  const rowGap = Number(p.row_gap ?? 10);
  const align = str(p.align);
  const labelColour = str(p.label_color) || "#5A7A8A";
  const fieldBg = str(p.field_background_color) || "#ffffff";
  const fieldBorder = str(p.field_border_color) || "#CBD5E1";
  const fieldText = str(p.field_text_color) || "#0B1C24";
  const linksColour = str(p.links_color) || ctx.accent;
  const buttonBg = str(p.button_background_color) || ctx.accent;
  const buttonText = str(p.button_text_color) || "#ffffff";
  /* WAVE 2. Size and Border Color were on the panel and drew nothing: the
     button took one padding whatever Size said, and the colour was stored and
     never read. Both are Elementor's own keys and both now move the page. */
  const buttonBorder = str(p.button_border_color);

  const boxStyle =
    `display:block;width:100%;box-sizing:border-box;border:1px solid ${esc(fieldBorder)};`
    + `background:${esc(fieldBg)};color:${esc(fieldText)};border-radius:6px;padding:${pad}px;`
    + `min-height:${16 + pad * 2}px`;

  const field = (label: string) => `<label style="display:block;margin-bottom:${rowGap}px">
    ${showLabels ? `<span style="display:block;font-size:11px;color:${esc(labelColour)};margin-bottom:4px">${esc(label)}</span>` : ""}
    <span style="${boxStyle}"></span>
  </label>`;

  return `<div class="bx-login">
    ${field(str(p.user_label) || "Username or Email Address")}
    ${field(str(p.password_label) || "Password")}
    ${on(p.show_remember_me) || p.show_remember_me == null
      ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:${esc(labelColour)};margin-bottom:${rowGap}px">
          <span style="width:12px;height:12px;border:1px solid ${esc(fieldBorder)};border-radius:3px;display:inline-block"></span>Remember Me
        </label>`
      : ""}
    <div style="display:flex;justify-content:${justify(align)};margin-bottom:${rowGap}px">
      ${editRun("button_text", p.button_text ?? "Log In", "bx-button bx-login-b", "Log In", ctx, "span")}
    </div>
    ${on(p.show_lost_password) || p.show_lost_password == null
      ? `<a class="bx-login-l" href="#" style="font-size:12px;color:${esc(linksColour)}">Lost your password?</a>`
      : ""}
    <style>.bx-login .bx-login-b{background:${esc(buttonBg)};color:${esc(buttonText)};padding:${
    esc(BUTTON_PAD[str(p.button_size) || "sm"] ?? BUTTON_PAD.sm)};${
    buttonBorder ? `border:1px solid ${esc(buttonBorder)};` : ""}${
    align === "stretch" ? "width:100%;text-align:center;" : ""}}</style>
  </div>`;
}

export const LOGIN_DEF: FamilyWidgetDef = {
  kind: "login",
  label: "Login",
  description: "A sign-in box for your website's own accounts. Not the customer portal.",
  icon: "LogIn",
  picture: pictureFrom(box(10, 6, 44, 9) + box(10, 19, 44, 9)
    + `<rect x="10" y="32" width="18" height="6" rx="3" fill="#94A3B8" stroke="none"/>` + bar(34, 33, 20, 4)),
  category: "Pro",
  /**
   * WEBSITE ONLY, and the offer file lists landing too. Why it is short.
   *
   * This widget signs a visitor in to the WEBSITE's own accounts. A SPARK
   * hosted landing page has no accounts and no WordPress behind it, so the box
   * would be three fields and a button that cannot do anything — the dead
   * control this family is trying not to ship, widget-sized. A missing tile is
   * a TODO and not a failure (`builder-offers.test.mjs` (b)), so this is
   * reported rather than worked around, and it is in the handoff for the main
   * session to confirm or overrule.
   */
  builders: ["website"],
  tier: "pro",
  defaults: {
    show_labels: "yes",
    input_size: "sm",
    button_text: "Log In",
    button_size: "sm",
    align: "",
    show_lost_password: "yes",
    show_remember_me: "yes",
    show_logged_in_message: "yes",
    redirect_after_login: "",
    redirect_url: "",
    redirect_after_logout: "",
    redirect_logout_url: "",
    row_gap: 10,
    links_color: "",
    label_color: "",
    field_text_color: "",
    field_background_color: "#ffffff",
    field_border_color: "",
    button_text_color: "",
    button_background_color: "",
    button_border_color: "",
  },
  controls: [
    /* ── Content ─────────────────────────────────────────────────────── */
    { key: "show_labels", label: "Label", type: "toggle", tab: "content", section: "Form Fields", help: "Show a label over every box" },
    { key: "input_size", label: "Input Size", type: "select", tab: "content", section: "Form Fields", options: SIZES },
    { key: "button_text", label: "Text", type: "text", tab: "content", section: "Button", help: "Typed on the button itself." },
    { key: "button_size", label: "Size", type: "select", tab: "content", section: "Button", options: SIZES },
    /* Elementor marks Alignment responsive and stores `align_tablet` /
       `align_mobile`. Copied from the machine file. */
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Button", responsive: true, options: ALIGN },
    { key: "show_lost_password", label: "Lost your password?", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "show_remember_me", label: "Remember Me", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "show_logged_in_message", label: "Logged in Message", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "redirect_after_login", label: "Redirect After Login", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "redirect_url", label: "Where they land", type: "link", tab: "content", section: "Additional Options" },
    { key: "redirect_after_logout", label: "Redirect After Logout", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "redirect_logout_url", label: "Where they land after logging out", type: "link", tab: "content", section: "Additional Options" },

    /* ── Style — Elementor's five sections, its own labels ───────────── */
    { key: "row_gap", label: "Rows Gap", type: "number", tab: "style", section: "Form" },
    { key: "links_color", label: "Links Color", type: "colour", tab: "style", section: "Form" },
    { key: "label_color", label: "Text Color", type: "colour", tab: "style", section: "Label" },
    { key: "field_text_color", label: "Text Color", type: "colour", tab: "style", section: "Fields" },
    { key: "field_background_color", label: "Background Color", type: "colour", tab: "style", section: "Fields" },
    { key: "field_border_color", label: "Border Color", type: "colour", tab: "style", section: "Fields" },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Button" },
    { key: "button_background_color", label: "Color", type: "colour", tab: "style", section: "Button" },
    { key: "button_border_color", label: "Border Color", type: "colour", tab: "style", section: "Button" },
  ],
};
