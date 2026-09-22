/**
 * builder/widgets/families/ia/customField.ts — ONE FIELD FROM THE DATABASE.
 *
 * D-167, Brandon's own words (2026-09-19):
 *
 *   "I need dynamic fields for customer information and just normal widgets.
 *    Text, html, cards, images, headers … inside these we can add a widget for
 *    like custom fields that we can then select from the database, like
 *    customer name, service address, etc. Pulled from OLIVER/SPARK lumen
 *    contacts."
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * The three block widgets **Customer**, **Service Location** and **Business
 * Info**, built the same morning and deleted the same afternoon. They were
 * special-purpose widgets — a shape nobody asked for holding several facts at
 * once — and there is now ONE widget holding ONE fact, which the author drops
 * in a Container as many times as they need. A "Customer details" block is a
 * SECTION TEMPLATE made of these (see `proposal/sectionTemplates.ts`), and it
 * can be pulled apart like anything else on the page.
 *
 * ── WHY THIS IS AN IA WIDGET AND NOT AN INVENTION ─────────────────────────
 * It is the DATABASE TWIN of Elementor's Text Editor: the same thing on the
 * page — a run of words with typography, colour and alignment — with the words
 * coming out of the record instead of out of the author's keyboard. Elementor's
 * own answer to this is a dynamic tag on a text control; we have no tag
 * infrastructure, so the choice is a widget with one select on it. No normal
 * widget can read a lumen contact, which is the other half of the rule.
 *
 * ── THE ONE BINDING MECHANISM, THE ONE IN 11.12 F.2 ───────────────────────
 * `widgets/binding.ts` already owns "which record, how fresh, what if empty,
 * what did the author retype". This widget spreads `BINDING_CONTROLS`, stores a
 * retyped value in `overrides` under the field's own key, and offers **Put it
 * back** exactly as a product card does. There is no second override store.
 *
 * ── AND THE RECORD BOOK IS THE ONE STREAM 3 BUILT ─────────────────────────
 * `proposal/recordWidgets.ts` keeps `RECORD_FIELDS`, `RecordBook`,
 * `resolveRecord`, `recordFor` and `recordBookFromContext` — the reading half
 * of the deleted widgets, which was never the part anybody objected to. This
 * file is the front.
 *
 * PURE. No React, no fetch: the record is handed in, so every line runs under
 * `node --test`.
 */
import type { Widget } from "../../../model";
/* B-168 LANDED: `esc` comes from the module that imports nothing
   (`builder/esc.ts`), not from `render.ts`. A family folder that reaches into
   render.ts closes the cycle the families index documents, and entering this
   family first then throws "Cannot access CUSTOM_FIELD_DEF before
   initialization" — which it did. */
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import type { WidgetControl } from "../../../registry";
import type { FamilyWidgetDef } from "../types";
import { bar, pictureFrom } from "../../../pictures";
import {
  RECORD_FIELDS, RECORD_KINDS, recordBookFromContext, recordValuesFor,
  type RecordBook, type RecordFieldDef, type RecordKind,
} from "../../../proposal/recordWidgets";
import {
  BINDING_CONTROLS, PUT_IT_BACK, TYPED_NOT_LIVE, bindingDefaults, bindingSettings, onEmptyOf,
} from "../../binding";

export const CUSTOM_FIELD_KIND = "custom_field";

/* ══════════════════════════════════════════════════════════════════════════
   The list the author picks from
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE THREE GROUPS, in the words D-167 used: *"grouped Customer / Service
 * location / Business"*. The engine's `select` control is a flat list, so the
 * group is the first half of every option's label — which is also how a person
 * reads it out loud ("Customer, Email").
 */
export const FIELD_GROUPS: Readonly<Record<RecordKind, string>> = {
  customer: "Customer",
  service_location: "Service location",
  business_info: "Business",
};

/** One thing the author can point this widget at. */
export interface CustomFieldChoice extends RecordFieldDef {
  /** What is STORED — "customer.email". One string, one control. */
  key: string;
  /** Which record it comes out of. */
  record: RecordKind;
  /** The key on that record, and the override key. */
  field: string;
  /** "Customer" · "Service location" · "Business". */
  group: string;
  /** What the panel's select reads. */
  optionLabel: string;
}

/** Every field, in the order the three records declare them. Machine-derived
 *  from `RECORD_FIELDS`, so a field can never exist in one list and not the
 *  other — the failure the record blocks' own mirror test was written for. */
export const CUSTOM_FIELD_CHOICES: readonly CustomFieldChoice[] = RECORD_KINDS.flatMap(
  (record) => RECORD_FIELDS[record].map((f) => ({
    ...f,
    key: `${record}.${f.key}`,
    record,
    field: f.key,
    group: FIELD_GROUPS[record],
    optionLabel: `${FIELD_GROUPS[record]} — ${f.label}`,
  })),
);

const BY_KEY: Record<string, CustomFieldChoice> = Object.fromEntries(
  CUSTOM_FIELD_CHOICES.map((c) => [c.key, c]),
);

/** The field a dropped widget starts on. The first thing on a proposal. */
export const DEFAULT_CUSTOM_FIELD = "customer.name";

/** The choice this widget points at, or null when it points at nothing. */
export function choiceOf(props: Record<string, unknown> | undefined | null): CustomFieldChoice | null {
  return BY_KEY[str((props as any)?.field)] ?? null;
}

/** The props a Custom Field carries when it is dropped on `<field>`. */
export function customFieldProps(field: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const c = BY_KEY[field] ?? null;
  return {
    ...bindingDefaults(c?.record === "business_info" ? "document" : "lumen:customer"),
    field,
    show_label: true,
    locationId: "",
    ...extra,
  };
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/* ══════════════════════════════════════════════════════════════════════════
   Reading one
   ══════════════════════════════════════════════════════════════════════════ */

/** What this widget shows, and where the words came from. */
export interface ResolvedCustomField {
  choice: CustomFieldChoice;
  /** What is drawn — the override when there is one, else the record. */
  value: string;
  /** What the record says, still, under any override. */
  live: string;
  /** The author typed over it. It has stopped tracking the record. */
  overridden: boolean;
}

/** The overrides map, through the ONE binding reader. */
function overridesOf(props: Record<string, unknown> | undefined | null): Record<string, string> {
  const raw = bindingSettings(props).overrides;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v == null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

/**
 * The field, resolved against the book.
 *
 * An override of `""` is a real answer — "I want this blank" — and is kept,
 * because the alternative is a field an author cannot clear. It still says
 * *Typed, not live* and still offers *Put it back*.
 */
export function resolveCustomField(
  props: Record<string, unknown> | undefined | null,
  values: Record<string, string>,
): ResolvedCustomField | null {
  const choice = choiceOf(props);
  if (!choice) return null;
  const over = overridesOf(props);
  const has = Object.prototype.hasOwnProperty.call(over, choice.field);
  const live = str(values[choice.field]);
  return { choice, live, overridden: has, value: has ? over[choice.field] : live };
}

/** The props that put this one field back on the record. The ONE writer. */
export function putCustomFieldBackProps(
  props: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const choice = choiceOf(props);
  const next = { ...overridesOf(props) };
  if (choice) delete next[choice.field];
  return { overrides: next };
}

/** Has the author typed over this widget's value? */
export function isRetyped(props: Record<string, unknown> | undefined | null): boolean {
  const choice = choiceOf(props);
  if (!choice) return false;
  return Object.prototype.hasOwnProperty.call(overridesOf(props), choice.field);
}

/* ══════════════════════════════════════════════════════════════════════════
   Drawing one
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ONE FIELD, as HTML.
 *
 * ── IT LOOKS LIKE A TEXT EDITOR, BECAUSE IT IS ONE ────────────────────────
 * The value is a `bx-p` run inside a `bx-prose` wrapper, which is exactly what
 * `paragraph` draws, so the Typography group's size, weight, font and colour
 * and the Layout group's alignment land on it with no new CSS. The label, when
 * it is on, is the record block's own `bx-record-k` — the one piece of styling
 * this widget adds, and it is one that already existed.
 *
 * ── THE EDIT IS ON THE PAGE ───────────────────────────────────────────────
 * `data-edit="overrides.<field>"` is the engine's editable-run marker and
 * `setPropPath`'s dotted path, so typing over the value writes the override
 * through `editWidgetText` — the same one call every other widget's text goes
 * through. There is no second edit path and no box in a side panel.
 *
 * ── AND AN EMPTY RUN IS STILL CLICKABLE ───────────────────────────────────
 * `bx-slot` + a placeholder, for the reason `widgets/text.ts` writes out in
 * full: a run that is only drawn once it has words is a field nobody can fill
 * in (D-01, the worst moment of the 2026-09-16 walk).
 */
export function renderCustomFieldWith(w: Widget, ctx: RenderContext, book: RecordBook): string {
  const p: any = w.props || {};
  const choice = choiceOf(p);
  const editing = ctx.mode === "edit";

  if (!choice) {
    return editing
      ? `<div class="bx-prose bx-customfield" data-field="">`
        + `<p class="bx-p bx-slot" data-placeholder="Pick a field on the right — customer name, service address, your phone number."></p></div>`
      : "";
  }

  const values = recordValuesFor(choice.record, p, ctx, book);
  const r = resolveCustomField(p, values)!;

  if (!editing && !r.value.trim()) {
    // `on_empty` (F.2) — the same three values every bound widget has.
    return onEmptyOf(p) === "placeholder"
      ? `<div class="bx-customfield bx-record-empty" data-empty="placeholder"></div>`
      : "";
  }

  /* A PICTURE IS A PICTURE. The business's logo is the one field on the three
     records that is not a run of words, and drawing its URL as text would put
     "https://…" on a document somebody signs. */
  if (choice.picture) {
    if (r.value.trim()) {
      return `<div class="bx-customfield bx-record-logo" data-field="${esc(choice.key)}">`
        + `<img src="${esc(r.value)}" alt="${esc(choice.label)}" style="max-height:52px"/></div>`;
    }
    return editing
      ? `<div class="bx-customfield bx-record-logo bx-slot" data-field="${esc(choice.key)}" data-placeholder="${esc(choice.placeholder)}"></div>`
      : "";
  }

  const showLabel = p.show_label !== false && p.show_label !== "false";
  const label = showLabel
    ? `<span class="bx-record-k">${esc(choice.label)}</span> `
    : "";
  // AN OVERRIDE IS MARKED WHERE IT IS, AND PUT BACK IN THE PANEL — F.2's own
  // sentence, and the same shape a retyped product card carries.
  const mark = editing && r.overridden
    ? ` data-overridden="1" title="${esc(`${TYPED_NOT_LIVE} — ${PUT_IT_BACK} in the panel to follow the record again.`)}"`
    : "";
  const empty = r.value.trim() ? "" : " bx-slot";
  return `<div class="bx-prose bx-customfield" data-field="${esc(choice.key)}"${mark}>`
    + `<p class="bx-p">${label}<span class="bx-record-v${empty}"`
    + ` data-edit="overrides.${esc(choice.field)}"`
    + ` data-placeholder="${esc(choice.placeholder)}">${esc(r.value)}</span></p></div>`;
}

/**
 * The renderer every surface without an adapter uses.
 *
 * `render.ts` asks `ctx.extra` first, so the proposal builder's richer book —
 * the customer it fetched, the sites it was given, the business identity —
 * wins on its own canvas. The customer's own copy, the sent wire and a
 * template preview have no adapter and build the book out of the context.
 * ONE renderer, one shape, two ways of filling it in.
 */
export function renderCustomField(w: Widget, ctx: RenderContext): string {
  return renderCustomFieldWith(w, ctx, recordBookFromContext(ctx));
}

/* ══════════════════════════════════════════════════════════════════════════
   The definition
   ══════════════════════════════════════════════════════════════════════════ */

const FIELD_CONTROLS: WidgetControl[] = [
  {
    key: "field",
    label: "Which field",
    type: "select",
    tab: "content",
    section: "Field",
    options: CUSTOM_FIELD_CHOICES.map((c) => ({ value: c.key, label: c.optionLabel })),
    help: "Where the words come from. Change the customer and this changes with them.",
  },
  {
    key: "show_label",
    label: "Show the label",
    type: "toggle",
    tab: "content",
    section: "Field",
    help: "Prints “Email” in front of the value. Turn it off for a bare run of text.",
  },
];

export const CUSTOM_FIELD_DEF: FamilyWidgetDef = {
  kind: CUSTOM_FIELD_KIND,
  label: "Custom Field",
  description: "One fact from your own records — the customer's name, the service address, your phone number.",
  icon: "Database",
  picture: pictureFrom(bar(6, 12, 16) + bar(26, 12, 32) + bar(6, 24, 16) + bar(26, 24, 22)),
  category: "Intelligent Analytics",
  /* PROPOSALS, AND MY BRAND (2026-09-22). The reason the other four were off
     still holds for three of them and is kept here: the record book is
     assembled by the proposal adapter and by `recordBookFromContext`, both of
     which read a DOCUMENT's customer, and an email or a website page has no
     customer picked, so the widget would draw an empty run an author could
     never fill.

     It does NOT hold for the BUSINESS group. Every surface knows which
     business is signed in, and a poster with the shop's phone number on it is
     the commonest thing anybody makes in the studio. So My Brand offers this
     tile over the business record ONLY — `StudioBrand.record`, filled from
     `GET /account/profile`, with the chooser saying so in those words — and
     `adapters/mybrand/insert.ts` places the value as a run of words with the
     field's own placeholder when it is blank. Website, landing and newsletter
     are still off, and that is still ask R-D4. */
  builders: ["proposal", "mybrand"],
  defaults: customFieldProps(DEFAULT_CUSTOM_FIELD),
  controls: [...FIELD_CONTROLS, ...BINDING_CONTROLS],
};

export default {
  CUSTOM_FIELD_KIND, CUSTOM_FIELD_DEF, CUSTOM_FIELD_CHOICES, DEFAULT_CUSTOM_FIELD, FIELD_GROUPS,
  choiceOf, customFieldProps, resolveCustomField, putCustomFieldBackProps, isRetyped,
  renderCustomField, renderCustomFieldWith,
};
