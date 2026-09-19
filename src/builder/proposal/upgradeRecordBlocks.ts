/**
 * builder/proposal/upgradeRecordBlocks.ts — THE THREE BLOCK WIDGETS, UNPACKED.
 *
 * D-167 deleted **Customer**, **Service Location** and **Business Info** and
 * put ONE widget in their place — Custom Field, one fact each. A document
 * stored between the morning they landed and the afternoon they went still
 * holds them, and "replace means delete" only holds if the thing that replaced
 * them can show everything they showed.
 *
 * So: one block becomes a **Container** holding one **Custom Field** per field
 * it showed, in the order it showed them, with the words the author typed over
 * carried across as that field's own override. The container keeps the block's
 * id, so a revision diff does not badge the section as new the first time it
 * opens; its heading, if it had one, becomes a Heading widget above the fields,
 * because that is what it already was on the page.
 *
 * ── AND THE AUTHOR CAN PULL IT APART ──────────────────────────────────────
 * Which is the point. Before this, "I only want the email line" meant finding a
 * toggle in a panel. After it, the email line is a widget: click it, delete it,
 * drag it somewhere else, style it on its own.
 *
 * ── MIRRORED ON THE SERVER, FUNCTION FOR FUNCTION ─────────────────────────
 * oliver-api `lib/deletedKinds.js` does exactly this on the door a stored
 * document comes through. A conversion the canvas makes and the server does not
 * is one document read two ways — the editor's and the PDF's — and a test in
 * each repo pins the two against each other.
 *
 * Pure. Runs under `node --test`.
 */
import { makeContainer, makeWidget, type Node, type Widget } from "../model";
import { customFieldProps } from "../widgets/families/ia/customField";
import {
  RECORD_FIELDS, isRecordKind, shownFields, type RecordKind,
} from "./recordWidgets";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The overrides map a stored block carried, as plain strings. */
function overridesOf(props: Record<string, unknown> | undefined | null): Record<string, string> {
  const raw = (props as any)?.overrides;
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

/**
 * ONE FIELD OF A STORED BLOCK → one Custom Field widget.
 *
 * `locationId` travels for a site block only, because only a site has one, and
 * `recordValuesFor` reads it to answer "which of this customer's yards".
 */
export function customFieldFor(
  record: RecordKind,
  fieldKey: string,
  block: Record<string, unknown> | undefined | null,
): Widget {
  const over = overridesOf(block);
  const has = Object.prototype.hasOwnProperty.call(over, fieldKey);
  return makeWidget("custom_field", customFieldProps(`${record}.${fieldKey}`, {
    show_label: true,
    locationId: record === "service_location" ? str((block as any)?.locationId).toLowerCase() : "",
    /* THE TYPED WORDS TRAVEL, and they travel as an OVERRIDE — the same key on
       the same store the block used. Writing them as a flat prop would put them
       somewhere the renderer never looks, and a stored agreement would open
       with the address silently replaced by whatever the record says today. */
    overrides: has ? { [fieldKey]: over[fieldKey] } : {},
    on_empty: (block as any)?.on_empty ?? (block as any)?.onEmpty ?? "hide",
    refresh: (block as any)?.refresh ?? "live",
  }));
}

/**
 * One stored block → a Container of Custom Fields.
 *
 * Every field the block SHOWED, in the record's own order. A toggle that was
 * explicitly off stays off — as a field that is simply not there, which is what
 * "off" always meant on the page.
 */
export function recordBlockToContainer(w: Widget): Node {
  const kind = w.kind as RecordKind;
  const p = (w.props || {}) as Record<string, unknown>;
  const kids: Node[] = [];
  const heading = str(p.heading).trim();
  if (heading) kids.push(makeWidget("heading", { text: heading, level: 3 }));
  for (const f of shownFields(kind, p)) kids.push(customFieldFor(kind, f.key, p));

  /* TWO COLUMNS AND ONE LINE were LAYOUTS of the block, and a Container has
     both: `two_columns` is a row that wraps, `inline` is a row, and the default
     is a column. One mechanism — the box's own direction — rather than a
     `layout` prop only one widget understood. */
  const layout = str(p.layout);
  const style = layout === "two_columns"
    ? { direction: "row" as const, gap: 18, wrap: true }
    : layout === "inline"
      ? { direction: "row" as const, gap: 18 }
      : { direction: "column" as const, gap: 6 };

  const box = makeContainer(style, kids);
  // The id is KEPT, for the reason `upgrade.asBox` gives: a revision diff
  // matches by id, and a document whose ids all changed on open would badge
  // every section as new the first time somebody opened it.
  box.id = w.id;
  if (w.style) (box as any).style = { ...style, ...JSON.parse(JSON.stringify(w.style)) };
  return box;
}

/** Is this one of the three block kinds the upgrade unpacks? */
export function isRecordBlockKind(kind: unknown): boolean {
  return isRecordKind(kind);
}

/**
 * THE CONTAINER AN `address_block` / `property_plan` BECOMES.
 *
 * Those two used to convert into a record BLOCK, which no longer exists. They
 * convert into the same Container of Custom Fields, in one hop — a two-hop
 * conversion is a conversion that only works if both passes run, and the one
 * that ran second was the one nobody remembered to call.
 */
/**
 * THE CUSTOM FIELDS OF ONE RECORD, FLAT.
 *
 * What a shipped template places where it used to place a block widget. Flat
 * rather than boxed, because the template's own section is already the box and
 * a box inside a box is one more thing for the author to click through before
 * they reach the line they wanted to change.
 */
export function customFields(
  record: RecordKind,
  opts: { locationId?: string; only?: readonly string[] } = {},
): Node[] {
  const keys = opts.only ?? RECORD_FIELDS[record].map((f) => f.key);
  return keys.map((key) => makeWidget("custom_field", customFieldProps(`${record}.${key}`, {
    show_label: true,
    locationId: record === "service_location" ? str(opts.locationId).toLowerCase() : "",
  })));
}

export function fieldsContainer(
  record: RecordKind,
  opts: {
    heading?: string;
    locationId?: string;
    /** The words the author typed, by field key. */
    overrides?: Record<string, string>;
    /** Which fields to draw. Defaults to every field the record has. */
    only?: readonly string[];
    /** Extra widgets under the fields, in order — the plan's own rows. */
    after?: Node[];
    /** The id to keep, when one widget is becoming this box. */
    id?: string;
  } = {},
): Node {
  const over = opts.overrides || {};
  const keys = opts.only ?? RECORD_FIELDS[record].map((f) => f.key);
  const kids: Node[] = [];
  if (str(opts.heading).trim()) kids.push(makeWidget("heading", { text: str(opts.heading).trim(), level: 3 }));
  for (const key of keys) {
    kids.push(makeWidget("custom_field", customFieldProps(`${record}.${key}`, {
      show_label: true,
      locationId: record === "service_location" ? str(opts.locationId).toLowerCase() : "",
      overrides: Object.prototype.hasOwnProperty.call(over, key) ? { [key]: over[key] } : {},
    })));
  }
  for (const n of opts.after || []) kids.push(n);
  const box = makeContainer({ direction: "column", gap: 6 }, kids);
  if (opts.id) box.id = opts.id;
  return box;
}

export default { customFieldFor, recordBlockToContainer, isRecordBlockKind, fieldsContainer };
