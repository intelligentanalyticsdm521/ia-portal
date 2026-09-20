/**
 * f8-contact-furniture/form.ts — Elementor's **Form**, by its own name.
 *
 * Offer file `BUILDER_OFFERS_2026-09-19.json`: `form` is listed under
 * `website.elementor_pro` and `landing.elementor_pro`, and nowhere else. It is
 * not a newsletter widget (a mailbox cannot post a form) and not a proposal one
 * (paper cannot either); both lists say so in their own words.
 *
 * ── WHERE EVERY NAME AND DEFAULT BELOW COMES FROM ─────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `form`: title "Form",
 * category `pro-elements`, Content sections **Form Fields** and **Buttons**,
 * and the control keys, labels, option values and defaults copied out of it
 * one by one. Nothing here is invented and nothing is guessed: where the
 * catalogue and this file disagree, the catalogue is right and this file is a
 * defect.
 *
 * ── THE FOUR CONTENT SECTIONS WE DO **NOT** OFFER, AND WHY ────────────────
 * Elementor's Form has nineteen Content sections. Fifteen of them —
 * Email, Email 2, Redirect, ActiveCampaign, ConvertKit, Discord, Drip,
 * GetResponse, MailChimp, MailerLite, Slack, Webhook, Popup, Steps Settings,
 * Additional Options — configure where a submission GOES. On an ARION site it
 * does not go where this widget says: `arion-api`'s own `form` emitter stamps
 * the three form-purpose keys (`lib/websiteBuilder/formPurpose.js`) and the
 * site files every enquiry by that purpose, so a mail server typed in here
 * would be a control the author filled in and nothing read. A dead control is
 * worse than a missing one, so they are left off and said out loud here.
 *
 * Elementor's **Actions After Submit** is a `select2` — many values in one
 * control — and the panel draws no such shape. It is left off for that reason
 * and written in the handoff, not worked around with a single-choice select
 * that would silently drop the author's second action.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's own Input Size list, `xs … xl`, with its own words for them. */
/* WAVE 2. Elementor's own button padding per Size. The Size select was on the
   panel and drew nothing: the button took one padding whatever it said. */
const BUTTON_PAD: Record<string, string> = {
  xs: "6px 12px", sm: "9px 16px", md: "11px 20px", lg: "13px 26px", xl: "16px 34px",
};

const SIZES = [
  { value: "xs", label: "Extra Small" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

/** Elementor's Column Width list for the submit button, as percentages. */
const WIDTHS = ["20", "25", "30", "33", "40", "50", "60", "66", "70", "75", "80", "100"]
  .map((v) => ({ value: v, label: `${v}%` }));

/**
 * ELEMENTOR'S OWN THREE STARTING FIELDS.
 *
 * The catalogue's `form_fields` default is Name, Email, Message, and a form
 * that starts empty is a form the author has to build before they can see one.
 * The row shape is Elementor's too — `custom_id`, `field_type`, `field_label`,
 * `placeholder`, `width` — so what we store is what the page engine reads.
 */
export const DEFAULT_FORM_FIELDS = [
  { custom_id: "name", field_type: "text", field_label: "Name", placeholder: "Name", width: "100" },
  { custom_id: "email", field_type: "email", field_label: "Email", placeholder: "Email", width: "100" },
  { custom_id: "message", field_type: "textarea", field_label: "Message", placeholder: "Message", width: "100" },
];

/** The rows an author has, falling back to Elementor's three. */
export function formFields(props: Record<string, unknown> | undefined): any[] {
  const p: any = props || {};
  const rows = Array.isArray(p.form_fields) ? p.form_fields
    /* `fields` is what the landing builder's older form kind stored, and those
       pages are on disk. Read both, write one. */
    : (Array.isArray(p.fields) ? p.fields : []);
  return rows.length ? rows : DEFAULT_FORM_FIELDS;
}

/** One field's visible words, whichever vocabulary it was stored in. */
function fieldLabel(f: any): string {
  return str(f?.field_label ?? f?.label);
}

function fieldType(f: any): string {
  return str(f?.field_type ?? f?.type) || "text";
}

const PAD: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };

/**
 * WHAT THE CANVAS DRAWS: Elementor's own default form, standing still.
 *
 * Labels above the boxes, the required mark where the author asked for one, a
 * textarea drawn taller than a single line, and the submit button in the
 * business's accent. The label and the button text are typed ON THE PAGE —
 * that is the platform's one editing mechanism and the reason the panel has no
 * text boxes in it.
 */
export function renderForm(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const rows = formFields(p);
  const showLabels = p.show_labels !== false && p.show_labels !== "" && p.show_labels !== "no";
  const mark = p.mark_required === true || p.mark_required === "yes";
  const pad = PAD[str(p.input_size) || "sm"] ?? 8;
  const rowGap = Number(p.row_gap ?? 10);
  const colGap = Number(p.column_gap ?? 10);
  const fieldBg = str(p.field_background_color) || "#ffffff";
  const fieldBorder = str(p.field_border_color) || "#CBD5E1";
  const fieldText = str(p.field_text_color) || "#0B1C24";
  const labelColour = str(p.label_color) || "#5A7A8A";
  const buttonBg = str(p.button_background_color) || ctx.accent;
  const buttonText = str(p.button_text_color) || "#ffffff";
  const buttonWidth = str(p.button_width) || "100";

  const boxStyle = (tall: boolean) =>
    `display:block;width:100%;box-sizing:border-box;border:1px solid ${esc(fieldBorder)};`
    + `background:${esc(fieldBg)};color:${esc(fieldText)};border-radius:6px;`
    + `padding:${pad}px;min-height:${tall ? 72 : 16 + pad * 2}px`;

  const field = (f: any, i: number) => {
    const label = fieldLabel(f);
    const tall = fieldType(f) === "textarea";
    return `<label class="bx-form-f" style="display:block;margin-bottom:${rowGap}px">
      ${showLabels
        ? `<span class="bx-form-l" style="display:block;font-size:11px;color:${esc(labelColour)};margin-bottom:4px"${
          ctx.mode === "edit" ? ` data-edit="form_fields.${i}.field_label"` : ""}>${esc(label)}${
          mark ? `<span style="color:#DC2626"> *</span>` : ""}</span>`
        : ""}
      <span class="bx-form-i" style="${boxStyle(tall)}"></span>
    </label>`;
  };

  return `<form class="bx-form" onsubmit="return false" style="column-gap:${colGap}px">
    ${rows.map(field).join("")}
    <span class="bx-form-actions" style="display:block;width:${esc(buttonWidth)}%">
      ${editRun("button_text", p.button_text ?? "Send", "bx-button", "Send", ctx, "span")}
    </span>
    <style>.bx-form .bx-button{background:${esc(buttonBg)};color:${esc(buttonText)};padding:${
    esc(BUTTON_PAD[str(p.button_size) || "sm"] ?? BUTTON_PAD.sm)};display:inline-block;width:100%;text-align:center}</style>
  </form>`;
}

export const FORM_DEF: FamilyWidgetDef = {
  kind: "form",
  /* ELEMENTOR'S OWN TITLE. The kind is unchanged on purpose: a `form` is
     already on disk in landing pages built before D-168, and a widget that
     renamed its own id would blank them. See the handoff: registry.ts still
     carries a `hidden` legacy `form` definition and the lander deletes it. */
  label: "Form",
  description: "Fields a visitor fills in, and a button that sends them to you.",
  icon: "ClipboardList",
  picture: pictureFrom(box(8, 5, 48, 9) + box(8, 17, 48, 9)
    + `<rect x="8" y="29" width="20" height="7" rx="3" fill="#94A3B8" stroke="none"/>`),
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    form_name: "Contact",
    form_fields: DEFAULT_FORM_FIELDS,
    input_size: "sm",
    show_labels: true,
    mark_required: "",
    button_size: "sm",
    button_width: "100",
    button_text: "Send",
    /* Style, Elementor's own defaults. `""` means "the theme decides", which
       is what an empty colour control means in its panel too. */
    column_gap: 10,
    row_gap: 10,
    label_color: "",
    field_text_color: "",
    field_background_color: "#ffffff",
    field_border_color: "",
    button_background_color: "",
    button_text_color: "#ffffff",
  },
  controls: [
    /* ── Content ─────────────────────────────────────────────────────── */
    /* The rows themselves. Typed on the page, like every other list on this
       platform: the panel draws no `list` control and a form whose fields were
       edited in a side pane would be the raw field list Brandon called a FAIL
       on 2026-09-15. Adding and removing a ROW still needs the shell's
       `repeatKeyFor`, which is not this family's file — it is in the handoff. */
    { key: "form_fields", label: "Form Fields", type: "list", tab: "content", section: "Form Fields" },
    { key: "input_size", label: "Input Size", type: "select", tab: "content", section: "Form Fields", options: SIZES },
    { key: "show_labels", label: "Label", type: "toggle", tab: "content", section: "Form Fields", help: "Show a label over every box" },
    { key: "mark_required", label: "Required Mark", type: "toggle", tab: "content", section: "Form Fields", help: "Put a star on the ones they must fill in" },
    { key: "button_size", label: "Size", type: "select", tab: "content", section: "Buttons", options: SIZES },
    /* Elementor marks Column Width responsive and stores `button_width_tablet`
       / `button_width_mobile` beside it. Copied from the machine file, not
       guessed; `deviceKey()` is the only place that spelling lives. */
    { key: "button_width", label: "Column Width", type: "select", tab: "content", section: "Buttons", responsive: true, options: WIDTHS },
    { key: "button_text", label: "Submit", type: "text", tab: "content", section: "Buttons", help: "Typed on the button itself." },

    /* ── Style — Elementor's three sections, its own labels ──────────── */
    { key: "column_gap", label: "Columns Gap", type: "number", tab: "style", section: "Form" },
    { key: "row_gap", label: "Rows Gap", type: "number", tab: "style", section: "Form" },
    { key: "label_color", label: "Text Color", type: "colour", tab: "style", section: "Form" },
    { key: "field_text_color", label: "Text Color", type: "colour", tab: "style", section: "Field" },
    { key: "field_background_color", label: "Background Color", type: "colour", tab: "style", section: "Field" },
    { key: "field_border_color", label: "Border Color", type: "colour", tab: "style", section: "Field" },
    { key: "button_background_color", label: "Background Color", type: "colour", tab: "style", section: "Buttons" },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Buttons" },
  ],
};
