/**
 * builder/proposal/recordWidgets.ts — THE THREE WIDGETS THAT FILL THEMSELVES
 * FROM THE DATABASE.
 *
 * Scope 11.13.2, agreed with Brandon 2026-09-19:
 *
 *   "Pick the customer once. Every widget bound to the customer, the service
 *    location or the business fills itself from the database the moment the
 *    customer is picked or changed … The author edits any of them directly on
 *    the page; an edited field stops tracking and can be put back. **Nobody
 *    types into a list of boxes.**"
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * The Details group — a side list of boxes invented on 2026-09-16 to give the
 * blanks one home. It was never asked for. It is deleted, not hidden
 * (`documentDetails.ts` now carries only the ONE blank rule and the store),
 * and these three widgets are what the page has instead.
 *
 * ── WHY THREE WIDGETS AND NOT ONE ─────────────────────────────────────────
 * Elementor's answer to "a block of facts about a record" is a widget per
 * record, not one widget with a "which record?" select — a Post Info widget is
 * not a Site Logo widget with a dropdown. Three kinds means the pane reads
 * *Customer · Service Location · Business Info*, which is the author's own
 * vocabulary, and the widget that is on the page says what it is without
 * anybody opening a panel.
 *
 * ── ONE BINDING MECHANISM, THE ONE IN 11.12 ───────────────────────────────
 * `widgets/binding.ts` (F.2) already owns "which record, how fresh, what if
 * empty, what did the author retype". These three spread `BINDING_CONTROLS`,
 * store a retyped field in `overrides` and offer **Put it back** exactly as a
 * product card does. There is no second override store and no second
 * "typed, not live" sentence.
 *
 * ── AND THE FIELD CHOICE IS ELEMENTOR'S SHAPE ─────────────────────────────
 * 11.13.2 asks for "a field choice control (which fields show, layout stacked
 * / two columns / inline) in the widget's Content tab". Elementor's own answer
 * to "which of these parts show" is a `switcher` per part (Post Info, Icon
 * Box, Price Table all do it that way), and its answer to "how are they laid
 * out" is one select. So: one toggle per field plus one `layout` select, all
 * in a Content-tab section named **Fields**. Nothing invented.
 *
 * PURE. No React, no fetch — the record is handed in, as it is everywhere on
 * this platform, so every line here runs under `node --test`.
 */
import type { Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import {
  BINDING_CONTROLS, PUT_IT_BACK, TYPED_NOT_LIVE, bindingDefaults, bindingSettings, onEmptyOf,
} from "../widgets/binding";

/* ══════════════════════════════════════════════════════════════════════════
   The three kinds, and the fields each one has
   ══════════════════════════════════════════════════════════════════════════ */

/** The three record-bound widget kinds. New in 11.13; no old ids to keep. */
export type RecordKind = "customer" | "service_location" | "business_info";

export const RECORD_KINDS: readonly RecordKind[] = ["customer", "service_location", "business_info"];

/** One field of a record block. */
export interface RecordFieldDef {
  /** The key on the record AND the override key. One name, not two. */
  key: string;
  /** Plain words on the page, beside the value. */
  label: string;
  /** What the author sees in edit mode when the record has nothing. */
  placeholder: string;
  /** A picture rather than a run of text — the business's logo, and only it. */
  picture?: true;
}

/**
 * WHICH FIELDS EACH BLOCK HAS — 11.13.2's own list, word for word.
 *
 * "name, company, contact, email, phone, billing address / location name,
 *  address, access notes / the business's name, logo, phone, email, licence"
 *
 * Nothing else. A field that is not on that sentence is a field nobody asked
 * for, which is how the Details group happened.
 */
export const RECORD_FIELDS: Readonly<Record<RecordKind, readonly RecordFieldDef[]>> = {
  customer: [
    { key: "name", label: "Name", placeholder: "Who this is for" },
    { key: "company", label: "Company", placeholder: "The business name on the agreement" },
    { key: "contact", label: "Contact", placeholder: "Who to speak to" },
    { key: "email", label: "Email", placeholder: "Where the document goes" },
    { key: "phone", label: "Phone", placeholder: "Best number" },
    { key: "billing_address", label: "Billing address", placeholder: "Where the invoice goes" },
  ],
  service_location: [
    { key: "name", label: "Location", placeholder: "What this site is called" },
    { key: "address", label: "Address", placeholder: "Street, town, postcode" },
    /* CARRIED OVER, NOT INVENTED. 11.13.2's sentence names "location name,
       address, access notes"; the widget this one replaces (`address_block`)
       also printed the SITE CONTACT, and a crew sheet that quietly stopped
       saying who to ask for on the day would be a fact deleted by a rename.
       So it is a field, default on, and the handoff carries the note. */
    { key: "site_contact", label: "Site contact", placeholder: "Who to ask for on the day" },
    { key: "access_notes", label: "Access notes", placeholder: "Gate code, where to park, who to call" },
  ],
  business_info: [
    { key: "logo", label: "Logo", placeholder: "Your mark", picture: true },
    { key: "name", label: "Business", placeholder: "Your business name" },
    { key: "phone", label: "Phone", placeholder: "Your number" },
    { key: "email", label: "Email", placeholder: "Your email" },
    { key: "licence", label: "Licence", placeholder: "Your licence number" },
  ],
};

/** Is this one of the three? Used by the renderer hook and by the upgrade. */
export function isRecordKind(kind: unknown): kind is RecordKind {
  return RECORD_KINDS.includes(String(kind ?? "") as RecordKind);
}

/** The fields of one kind, or an empty list for anything else. */
export function fieldsOf(kind: string): readonly RecordFieldDef[] {
  return isRecordKind(kind) ? RECORD_FIELDS[kind] : [];
}

/* ══════════════════════════════════════════════════════════════════════════
   The record, as the page reads it
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The values the DATABASE has for one block, already plain strings.
 *
 * Assembled by the adapter from the customer it fetched, the location chip and
 * the business identity — the same "handed in, never fetched" contract every
 * renderer on this platform follows. Absent keys mean the record has nothing
 * there, which is a different thing from the author blanking it.
 */
export type RecordValues = Record<string, string>;

/** Every block's live values, keyed by kind. What `ctx.extra` is given. */
export type RecordBook = Partial<Record<RecordKind, RecordValues>>;

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The overrides map off one widget, through the ONE binding reader. */
function overridesOf(props: Record<string, unknown> | undefined | null): Record<string, string> {
  const raw = bindingSettings(props).overrides;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v == null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

/** One field, resolved: what it shows, where the words came from. */
export interface ResolvedField extends RecordFieldDef {
  value: string;
  /** The author retyped this one. It has stopped tracking the record. */
  overridden: boolean;
  /** What the record says, still, under the override. */
  live: string;
}

/**
 * WHICH FIELDS SHOW.
 *
 * A field is shown unless its toggle is explicitly off. Absent means ON, so a
 * widget dropped on the page shows everything the record has and the author
 * takes away what they do not want — which is the way round Elementor does it
 * and the way round that never hides a fact by accident.
 */
export function shownFields(kind: string, props: Record<string, unknown> | undefined | null): RecordFieldDef[] {
  const p: any = props || {};
  return fieldsOf(kind).filter((f) => p[showKey(f.key)] !== false && p[showKey(f.key)] !== "false");
}

/** The prop that says whether one field shows. One spelling, one place. */
export function showKey(field: string): string {
  return `show_${field}`;
}

/** How the fields are laid out. Elementor's three, and no fourth. */
export type RecordLayout = "stacked" | "two_columns" | "inline";
const LAYOUTS = new Set<string>(["stacked", "two_columns", "inline"]);

export function layoutOf(props: Record<string, unknown> | undefined | null): RecordLayout {
  const v = str((props as any)?.layout);
  return LAYOUTS.has(v) ? (v as RecordLayout) : "stacked";
}

/**
 * The block as the page draws it: the record's values, with anything the
 * author retyped on top and marked.
 *
 * An override of `""` is a real answer — "I want this line blank" — and is
 * kept, because the alternative is a field an author cannot clear. It is still
 * an override, so it still says *Typed, not live* and still offers *Put it
 * back*.
 */
export function resolveRecord(
  kind: string,
  props: Record<string, unknown> | undefined | null,
  record: RecordValues | undefined | null,
): ResolvedField[] {
  const over = overridesOf(props);
  const rec = record || {};
  return shownFields(kind, props).map((f) => {
    const live = str(rec[f.key]);
    const has = Object.prototype.hasOwnProperty.call(over, f.key);
    return { ...f, live, overridden: has, value: has ? over[f.key] : live };
  });
}

/** The props that record one retyped field. The ONE writer. */
export function overrideProps(
  props: Record<string, unknown> | undefined | null,
  field: string,
  value: string,
): Record<string, unknown> {
  return { overrides: { ...overridesOf(props), [field]: String(value ?? "") } };
}

/** The props that put ONE field back on the record. */
export function putFieldBackProps(
  props: Record<string, unknown> | undefined | null,
  field: string,
): Record<string, unknown> {
  const next = { ...overridesOf(props) };
  delete next[field];
  return { overrides: next };
}

/** Every field of this block the author has retyped, in reading order. */
export function overriddenOn(kind: string, props: Record<string, unknown> | undefined | null): string[] {
  const over = overridesOf(props);
  return fieldsOf(kind).map((f) => f.key).filter((k) => Object.prototype.hasOwnProperty.call(over, k));
}

/* ══════════════════════════════════════════════════════════════════════════
   Drawing one
   ══════════════════════════════════════════════════════════════════════════ */

const LAYOUT_STYLE: Record<RecordLayout, string> = {
  stacked: "display:block",
  two_columns: "display:grid;grid-template-columns:1fr 1fr;gap:4px 18px",
  inline: "display:flex;flex-wrap:wrap;gap:4px 18px",
};

/**
 * One record block, as HTML.
 *
 * ── THE EDIT IS ON THE PAGE ───────────────────────────────────────────────
 * Every value carries `data-edit="overrides.<field>"`, which is the engine's
 * own editable-run marker and `setPropPath`'s own dotted path — so typing over
 * a value writes the override through `editWidgetText`, the same one call every
 * other widget's text goes through. There is no second edit path and no box in
 * a side panel.
 *
 * ── AND AN EMPTY RUN IS STILL CLICKABLE ───────────────────────────────────
 * `bx-slot` + a placeholder, for the reason `widgets/text.ts` writes out in
 * full: a run that is only drawn once it has words is a field nobody can fill
 * in (D-01, the worst moment of the 2026-09-16 walk).
 */
export function renderRecordBlock(w: Widget, ctx: RenderContext, book: RecordBook): string {
  const kind = w.kind as RecordKind;
  const fields = resolveRecord(kind, w.props, book[kind]);
  const editing = ctx.mode === "edit";
  const heading = str((w.props as any)?.heading);

  if (!editing && !heading && fields.every((f) => !f.value.trim())) {
    // `on_empty` (F.2) — the same three values every bound widget has.
    return onEmptyOf(w.props) === "placeholder"
      ? `<div class="bx-record bx-record-empty" data-empty="placeholder"></div>`
      : "";
  }

  const layout = layoutOf(w.props);
  const rows = fields.map((f) => {
    if (!f.value.trim() && !editing) return "";
    if (f.picture) {
      return f.value.trim()
        ? `<div class="bx-record-logo"><img src="${esc(f.value)}" alt="${esc(f.label)}" style="max-height:52px"/></div>`
        : (editing ? `<div class="bx-record-logo bx-slot" data-placeholder="${esc(f.placeholder)}"></div>` : "");
    }
    const empty = f.value.trim() ? "" : " bx-slot";
    // AN OVERRIDE IS MARKED WHERE IT IS, AND PUT BACK IN THE PANEL.
    // `TYPED_NOT_LIVE` is F.2's own sentence and the tooltip is the only thing
    // on the page that says it; the BUTTON is in the widget's panel beside
    // every other control, which is where a product card's *Put it back*
    // already lives. One shape for "this field stopped tracking", not two.
    const mark = editing && f.overridden
      ? ` data-overridden="1" title="${esc(`${TYPED_NOT_LIVE} — ${PUT_IT_BACK} in the panel to follow the record again.`)}"`
      : "";
    return `<div class="bx-record-row" data-field="${esc(f.key)}"${mark}>
      <span class="bx-record-k">${esc(f.label)}</span><span class="bx-record-v${empty}"
        data-edit="overrides.${esc(f.key)}"
        data-placeholder="${esc(f.placeholder)}">${esc(f.value)}</span></div>`;
  }).join("");

  const head = heading || editing
    ? `<div class="bx-h bx-h3${heading ? "" : " bx-slot"}" data-edit="heading"
         data-placeholder="${esc(RECORD_HEADING_PLACEHOLDER[kind])}">${esc(heading)}</div>`
    : "";

  // ONE sentence, only while editing, only when something really is bound.
  const note = editing && fields.some((f) => f.live.trim())
    ? `<div class="bx-card-note">These come from the customer's own record, so this page and your crew's sheet cannot disagree.</div>`
    : "";

  return `<div class="bx-record" data-record="${esc(kind)}" data-layout="${esc(layout)}">
    ${head}<div class="bx-record-fields" style="${LAYOUT_STYLE[layout]}">${rows}</div>${note}</div>`;
}

const RECORD_HEADING_PLACEHOLDER: Record<RecordKind, string> = {
  customer: "Prepared for",
  service_location: "Where the work happens",
  business_info: "Prepared by",
};

/* ══════════════════════════════════════════════════════════════════════════
   The three definitions
   ══════════════════════════════════════════════════════════════════════════ */

function fieldControls(kind: RecordKind) {
  return [
    ...RECORD_FIELDS[kind].map((f) => ({
      key: showKey(f.key),
      label: `Show ${f.label.toLowerCase()}`,
      type: "toggle" as const,
      section: "Fields",
    })),
    {
      key: "layout", label: "Layout", type: "select" as const, section: "Fields",
      options: [
        { value: "stacked", label: "One under another" },
        { value: "two_columns", label: "Two columns" },
        { value: "inline", label: "All on one line" },
      ],
      help: "How the fields sit on the page.",
    },
  ];
}

function fieldDefaults(kind: RecordKind): Record<string, unknown> {
  const out: Record<string, unknown> = { heading: "", layout: "stacked" };
  for (const f of RECORD_FIELDS[kind]) out[showKey(f.key)] = true;
  return out;
}

const RECORD_PICTURE = pictureFrom(
  `<circle cx="9" cy="9" r="4" fill="#94A3B8"/>` + bar(22, 8, 30) + bar(22, 17, 24) + bar(22, 26, 28),
);

export const CUSTOMER_DEF: WidgetDef = {
  kind: "customer",
  label: "Customer",
  description: "Who this document is for — filled from their record the moment you pick them.",
  task: "Customer & property",
  icon: "UserRound",
  picture: RECORD_PICTURE,
  category: "Document",
  /* PROPOSAL ONLY, for now, and the reason is written down rather than left
     as an omission. The renderer for these lives in the proposal adapter
     (`ctx.extra`), because only that adapter has the customer, the site and
     the business in its hand. Offering them on an email or a landing page
     would be offering a widget an author can place and that draws nothing —
     the exact defect 11.12's catalogue pass was opened to close. 11.13.3 asks
     for them on those panes; they need the adapter's own record book first,
     and the ask is in D165_HANDOFF_2026-09-19.md. */
  adapters: ["proposal"],
  defaults: { ...fieldDefaults("customer"), ...bindingDefaults("lumen:locations") },
  controls: [...fieldControls("customer"), ...BINDING_CONTROLS],
};

export const SERVICE_LOCATION_DEF: WidgetDef = {
  kind: "service_location",
  label: "Service Location",
  description: "Where the work happens — the site you chose, straight off the customer's record.",
  task: "Customer & property",
  icon: "MapPin",
  picture: pictureFrom(
    `<path d="M12 8a5 5 0 0 1 5 5c0 4-5 9-5 9s-5-5-5-9a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`
    + bar(22, 10, 34) + bar(22, 20, 26),
  ),
  category: "Document",
  adapters: ["proposal"],
  defaults: { ...fieldDefaults("service_location"), ...bindingDefaults("lumen:locations") },
  controls: [...fieldControls("service_location"), ...BINDING_CONTROLS],
};

export const BUSINESS_INFO_DEF: WidgetDef = {
  kind: "business_info",
  label: "Business Info",
  description: "Your own name, mark and details — always the current ones.",
  task: "Customer & property",
  icon: "Building2",
  picture: pictureFrom(`<rect x="6" y="8" width="12" height="16" rx="1" fill="#94A3B8"/>` + bar(22, 12, 26) + bar(22, 21, 20)),
  category: "Document",
  adapters: ["proposal"],
  defaults: { ...fieldDefaults("business_info"), ...bindingDefaults("document") },
  controls: [...fieldControls("business_info"), ...BINDING_CONTROLS],
};

/** The three, as the pane shows them: who it is for, where, who from. */
export const RECORD_WIDGET_DEFS: WidgetDef[] = [CUSTOMER_DEF, SERVICE_LOCATION_DEF, BUSINESS_INFO_DEF];

export default {
  RECORD_KINDS, RECORD_FIELDS, RECORD_WIDGET_DEFS,
  isRecordKind, fieldsOf, shownFields, showKey, layoutOf, resolveRecord,
  overrideProps, putFieldBackProps, overriddenOn, renderRecordBlock,
};
