/**
 * builder/widgets/binding.ts — THE BINDING SECTION, ONCE, FOR EVERY WIDGET
 * THAT READS OUR DATA.
 *
 * Catalogue F.2: *"A shared **Binding** section on every one of them, so a
 * client learns it once."* Five controls, and the rule under them.
 *
 * | control         | what it does                                          |
 * |-----------------|-------------------------------------------------------|
 * | `_ia_source`    | which table or route this is bound to                 |
 * | `_ia_selection` | the ids or the query                                  |
 * | `refresh`       | Live · Snapshot at publish · Snapshot at send         |
 * | `on_empty`      | Hide · Show a placeholder · Show the last snapshot    |
 * | `overrides`     | any bound field the author retyped                    |
 *
 * ── WHY IT IS ONE MODULE AND NOT FOUR COPIES ──────────────────────────────
 * Before this the section existed on ONE widget (`catalog_card`), and the
 * other three bound widgets each carried their own ad-hoc binding: a price
 * line kept `offering_id` / `price_id` loose, an address block kept
 * `locationId`, and a totals widget read the document. So a client who learnt
 * the Binding section on a product card did not find it on any of the other
 * three — which is the one thing F.2 exists to prevent. Every bound widget
 * spreads `BINDING_CONTROLS` and reads through `bindingSettings` now.
 *
 * ── THE THIRD REFRESH MODE IS REAL, NOT AN ABSENCE ────────────────────────
 * `refresh` had two values, and the third — "snapshot at send" — was said to
 * happen anyway "because the server has no catalogue to re-read". That is an
 * absence-based guarantee (`reference_absence_based_guards_fail_open`): the day
 * the PDF worker gains a catalogue client, every sent proposal starts
 * re-pricing itself under the customer who signed it. So the mode is a stored
 * value, `freezeOnSend` writes the snapshot, and the guard is the PRESENCE of
 * `_ia_snapshot` on the copy that was sent.
 *
 * ── AND IT IS THE MERGE MECHANISM, NOT A SECOND ONE ───────────────────────
 * F.2: *"`merge.fill` already has the three modes (`edit` / `view` / `send`)
 * that make this true for merge tags; data widgets join them."* They do: the
 * ONE trigger is `FillMode === "send"`, and the two seams that already pass it
 * — `toEmailWire` and the proposal's `toWire` — call `freezeOnSend`. There is
 * no second freezing path and nothing to keep in step.
 *
 * Pure. Nothing here fetches; the catalogue is handed in, as it is everywhere.
 */
import type { BuilderDocument, Node, Section, Widget } from "../model";
import type { WidgetControl } from "../registry";
import type { FillMode } from "../merge";
import { isContainer } from "../treeOps";

/* ══════════════════════════════════════════════════════════════════════════
   The five controls
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHICH OF OUR SOURCES a widget is bound to.
 *
 * NOT a table name. Agreed with stream O on 2026-09-17, for two reasons that
 * apply to every repo:
 *
 *   1. `reference_data_ownership_architecture` MOVES schema objects, and a
 *      stored document naming one is a stored document that goes stale.
 *   2. oliver-api keeps a deliberately CLOSED list of the files allowed to
 *      name the LUMEN location table (`test/customer-location-promotion.test.mjs`,
 *      two files). A source marker carrying that string put a third file on
 *      that list for no reason at all.
 *
 * So the marker names the SOURCE, the way a client would: the business's own
 * catalogue, a customer's sites, or the document itself. Byte-identical in
 * oliver `lib/builderCard.js` and LUMEN `src/lib/builderCard.js`.
 */
export type IaSource =
  | "oliver:catalogue"
  | "lumen:locations"
  /* D-165 — the customer picked in the top bar. §11.13.2: "Load a customer and
     it auto loads customer information." The Customer widget reads it; nothing
     else does, and it is a SOURCE rather than a table name for the same two
     reasons the other three are. */
  | "lumen:customer"
  | "document"
  | "";

/**
 * When the figures are re-read.
 *
 * `live` re-reads wherever a catalogue is in the room — the canvas, and a
 * website page drawn on request. `snapshot_publish` pins them at the moment a
 * page is published. `snapshot_send` pins them at the moment a document goes
 * to a customer, which is the one F.2 puts in as many words: *"a price a
 * customer was quoted must not move under them."*
 */
export type RefreshMode = "live" | "snapshot_publish" | "snapshot_send";

/** What a bound widget with nothing to show does. */
export type OnEmpty = "hide" | "placeholder" | "last_snapshot";

export const REFRESH_MODES: ReadonlyArray<{ value: RefreshMode; label: string; help: string }> = [
  {
    value: "live", label: "Follow the catalogue",
    help: "Change the price in Products & Services and this follows it",
  },
  {
    value: "snapshot_publish", label: "Keep this price when published",
    help: "Pin the figures as they are the next time this page is published",
  },
  {
    value: "snapshot_send", label: "Keep this price when sent",
    help: "Pin the figures as they go to the customer — what they were quoted must not move under them",
  },
];

export const ON_EMPTY_CHOICES: ReadonlyArray<{ value: OnEmpty; label: string }> = [
  { value: "hide", label: "Show nothing" },
  { value: "placeholder", label: "Leave a gap that says what is missing" },
  { value: "last_snapshot", label: "Show the figures it last had" },
];

/**
 * The Binding section, as controls, for every bound widget's definition.
 *
 * `_ia_source` and `_ia_selection` are the catalogue's hidden pair: they are
 * on the widget and written into the published node so a re-publish refreshes
 * it, and they are not something an author types. The Inspector draws no field
 * for a `hidden` control; the adapter's own picker is what sets them, because
 * only the adapter knows this business's catalogue (D-33).
 */
export const BINDING_CONTROLS: WidgetControl[] = [
  { key: "_ia_source", label: "Bound to", type: "hidden", section: "Binding" },
  { key: "_ia_selection", label: "Which rows", type: "hidden", section: "Binding" },
  {
    key: "refresh", label: "Keep the figures up to date", type: "select", section: "Binding",
    options: REFRESH_MODES.map((m) => ({ value: m.value, label: m.label })),
    help: "When the numbers on this are re-read from your own data.",
  },
  {
    key: "on_empty", label: "When there is nothing to show", type: "select", section: "Binding",
    options: ON_EMPTY_CHOICES.map((c) => ({ value: c.value, label: c.label })),
  },
  { key: "overrides", label: "Words you typed over", type: "hidden", section: "Binding" },
];

/**
 * The defaults every bound widget starts with. One object, one answer.
 *
 * A location-bound widget gets no `_ia_selection`: its id lives on
 * `locationId` for the reason `selectionProps` writes out in full, and a null
 * key nothing ever writes is a field an author will one day try to set.
 */
export function bindingDefaults(source: IaSource): Record<string, unknown> {
  return {
    _ia_source: source,
    ...(source === "lumen:locations" ? {} : { _ia_selection: null }),
    refresh: "live",
    on_empty: "hide",
    overrides: {},
    _ia_snapshot: null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Reading one
   ══════════════════════════════════════════════════════════════════════════ */

const REFRESH_SET = new Set<string>(REFRESH_MODES.map((m) => m.value));
const EMPTY_SET = new Set<string>(ON_EMPTY_CHOICES.map((c) => c.value));

export interface BindingSettings {
  source: string;
  selection: unknown;
  refresh: RefreshMode;
  onEmpty: OnEmpty;
  overrides: Record<string, unknown>;
  /** The values frozen at send or publish, or null. */
  snapshot: Record<string, unknown> | null;
}

/**
 * The Binding section off one widget, tolerantly.
 *
 * Reads the older spellings the streams wrote for a day — `onEmpty` for
 * `on_empty`, the bare `snapshot` for `_ia_snapshot`, and `refresh:
 * "snapshot"` for the mode that is now two — so a widget that reached a page
 * without passing through `upgrade.ts` still behaves as its author asked.
 * Absent means live, which is what every bound widget written before this did.
 */
export function bindingSettings(props: Record<string, unknown> | undefined | null): BindingSettings {
  const p: any = props || {};
  const raw = String(p.refresh ?? "");
  // "snapshot" was the single pinned mode before there were two of them. A
  // document that asked for it asked for "do not move under the customer",
  // which is the SEND one.
  const refresh: RefreshMode = REFRESH_SET.has(raw)
    ? (raw as RefreshMode)
    : (raw === "snapshot" ? "snapshot_send" : "live");
  const empty = String(p.on_empty ?? p.onEmpty ?? "");
  const snapshot = (p._ia_snapshot && typeof p._ia_snapshot === "object")
    ? p._ia_snapshot
    : ((p.snapshot && typeof p.snapshot === "object") ? p.snapshot : null);
  return {
    source: String(p._ia_source ?? ""),
    selection: p._ia_selection ?? null,
    refresh,
    onEmpty: EMPTY_SET.has(empty) ? (empty as OnEmpty) : "hide",
    overrides: (p.overrides && typeof p.overrides === "object") ? p.overrides : {},
    snapshot,
  };
}

/**
 * WHICH ROWS — `_ia_selection`, read tolerantly, in ONE place.
 *
 * Four widgets used to keep their selection in four shapes: a product card in
 * `offeringId` / `priceId`, a priced line in `offering_id` / `price_id`, an
 * address block in `locationId`, and the totals in nothing at all. They are
 * one object on one key now, and every reader on the platform asks here — so
 * the loose keys are aliases with an end date (`upgrade.ts` renames them on
 * open) rather than four vocabularies for "which row is this".
 */
export interface IaSelection {
  offeringId: string;
  priceId: string;
  locationId: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();

export function selectionOf(props: Record<string, unknown> | undefined | null): IaSelection {
  const p: any = props || {};
  const sel: any = (p._ia_selection && typeof p._ia_selection === "object") ? p._ia_selection : {};
  return {
    offeringId: str(sel.offering_id ?? sel.offeringId ?? p.offeringId ?? p.offering_id),
    priceId: str(sel.price_id ?? sel.priceId ?? p.priceId ?? p.price_id),
    // A location id is compared lower-cased everywhere on this platform: the
    // records come back from SQL Server in whatever case they were written.
    locationId: str(sel.location_id ?? sel.locationId ?? p.locationId).toLowerCase(),
  };
}

/**
 * The props that BIND a widget to rows. Every writer goes through this.
 *
 * ── THE ONE EXCEPTION, WRITTEN DOWN ───────────────────────────────────────
 * A LOCATION's id stays on `locationId` and does NOT move into
 * `_ia_selection`. It is not our key alone: `oliver-api`'s
 * `locationIdsInDocument` reads it off the stored document to open a job per
 * site (`oliver.proposal_location`), and D-33 settled it as the address
 * block's own. Moving it here would be a schema change in another repo in the
 * same pass, which is how a signed proposal ends up with no address. So
 * `_ia_selection` is the CATALOGUE selection's home, `locationId` is the
 * location's, and each has exactly one.
 */
export function selectionProps(
  source: IaSource,
  selection: Partial<IaSelection>,
): Record<string, unknown> {
  if (source === "lumen:locations") {
    return { _ia_source: source, locationId: str(selection.locationId).toLowerCase() };
  }
  const sel: Record<string, string> = {};
  if (str(selection.offeringId)) sel.offering_id = str(selection.offeringId);
  if (str(selection.priceId)) sel.price_id = str(selection.priceId);
  return {
    _ia_source: source,
    _ia_selection: Object.keys(sel).length ? sel : null,
    // Every older spelling, cleared in the same write. A loose `offeringId`
    // left beside an empty `_ia_selection` is a binding that comes back the
    // next time somebody opens the document.
    offeringId: "", priceId: "", offering_id: "", price_id: "",
  };
}

/** Is this widget pinned — i.e. must the live catalogue be ignored? */
export function isPinned(props: Record<string, unknown> | undefined | null): boolean {
  return bindingSettings(props).refresh !== "live";
}

/** Which mode, for the surfaces that only need the one word. */
export function refreshModeOf(props: Record<string, unknown> | undefined | null): RefreshMode {
  return bindingSettings(props).refresh;
}

/** Nothing to show: leave a gap, show what it last had, or nothing at all. */
export function onEmptyOf(props: Record<string, unknown> | undefined | null): OnEmpty {
  return bindingSettings(props).onEmpty;
}

/* ══════════════════════════════════════════════════════════════════════════
   Which widgets have one
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * EVERY CATALOGUE-BOUND WIDGET, in one list.
 *
 * The four F.2 names: the product card and the priced line read the
 * catalogue, the service address reads a customer's locations, and the totals
 * read the document's own priced lines. One list, so "which widgets carry the
 * Binding section" has one answer and a test can assert every one of them
 * declares it.
 */
export const BOUND_KINDS: Readonly<Record<string, IaSource>> = {
  catalog_card: "oliver:catalogue",
  price_line: "oliver:catalogue",
  priced_line: "oliver:catalogue",
  /* D-167 — `address_block` was BOTH the customer's address and the site's,
     and one widget that was quietly both is how a bill goes to a site office.
     It became Customer and Service Location for one morning and then became
     **Custom Field**: ONE widget showing ONE field, which says on its own
     control which record it reads. The source below is the one the field's
     defaults carry; `customFieldProps` writes it per field. */
  custom_field: "lumen:customer",
  totals: "document",
};

export function isBound(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(BOUND_KINDS, kind);
}

/* ══════════════════════════════════════════════════════════════════════════
   "Typed, not live"
   ══════════════════════════════════════════════════════════════════════════ */

/** The fields on this widget the author has retyped over the live value. */
export function overriddenFields(props: Record<string, unknown> | undefined | null): string[] {
  const over = bindingSettings(props).overrides;
  return Object.keys(over).filter((k) => {
    const v = (over as any)[k];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && String(v).trim() !== "";
  }).sort();
}

/** The sentence the canvas puts beside an overridden field. */
export const TYPED_NOT_LIVE = "Typed, not live";

/** What the button that undoes it says, and the props it writes. */
export const PUT_IT_BACK = "Put it back";

/** Clear every override, so the widget follows its source again. */
export function putItBackProps(): Record<string, unknown> {
  return { overrides: {} };
}

/* ══════════════════════════════════════════════════════════════════════════
   Freeze on send — ONE mechanism, keyed on merge.fill's own mode
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What a bound widget's frozen values are, per kind.
 *
 * The caller supplies it, because only the caller has the catalogue and the
 * locations in its hand — the same "handed in, never fetched" contract every
 * renderer on this platform follows.
 */
export type FreezeResolver = (w: Widget) => Record<string, unknown> | null;

/**
 * Freeze every bound widget in the document, for the copy that is SENT.
 *
 * Returns THE SAME DOCUMENT, by identity, for any mode but `send` and for a
 * document with nothing bound in it — so `serialise` of a saved draft is byte
 * for byte what it was, and the goldens do not move. That identity is the
 * whole promise, and it is what a mutation test breaks on purpose.
 *
 * Widgets already pinned are left alone: their figures were pinned by the
 * author, at their own moment, and re-freezing them now would quietly replace
 * a decision with today's catalogue.
 */
export function freezeOnSend(
  doc: BuilderDocument,
  mode: FillMode,
  resolve: FreezeResolver,
): BuilderDocument {
  if (mode !== "send") return doc;

  const freezeNode = (n: Node): Node => {
    if (isContainer(n)) {
      const kids = n.children.map(freezeNode);
      return kids.every((k, i) => k === n.children[i]) ? n : { ...n, children: kids };
    }
    if (!isBound(n.kind)) return n;
    const b = bindingSettings(n.props);
    if (b.refresh !== "live") return n;
    const frozen = resolve(n);
    if (!frozen) return n;
    return {
      ...n,
      props: {
        ...n.props,
        _ia_source: b.source || BOUND_KINDS[n.kind] || "",
        _ia_snapshot: frozen,
        refresh: "snapshot_send" as RefreshMode,
      },
    };
  };

  let touched = false;
  const sections: Section[] = doc.sections.map((s) => {
    let sectionTouched = false;
    const columns = s.columns.map((c) => {
      const kids = c.widgets.map(freezeNode);
      if (kids.every((k, i) => k === c.widgets[i])) return c;
      sectionTouched = true;
      return { ...c, widgets: kids as Widget[] };
    });
    if (!sectionTouched) return s;
    touched = true;
    return { ...s, columns };
  });
  return touched ? { ...doc, sections } : doc;
}
