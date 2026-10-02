// ProposalCatalogPicker — add a service to a proposal and bring its words with it.
//
// This is the difference between a quote and a proposal. A quote is a price for
// a known ask: line item, quantity, total. A proposal has to SELL — it needs
// the description of what the service is and why it is worth having, and
// nobody retypes that per proposal. It is already written down, once, in the
// product catalogue.
//
// Founder 2026-08-19: "the proposals is supposed to be the real editor,
// verbiage, descriptions, etc. pulled from the products catalog when they add
// a line item."
//
// So picking a service does three things at once:
//   * adds the line item at the price the writer CHOSE
//   * appends its description to the proposal narrative as a section
//   * appends its features_json bullets under that description
//
// The writer then edits — the catalogue supplies the first draft, not the
// final wording. Editing here never writes back to the catalogue, because one
// customer's proposal should not silently rewrite the product for everyone.
//
// ── 2026-08-25 defect fix ────────────────────────────────────────────────
// This used to collapse an offering's whole price list to one number:
//
//     const pick = list.find((p) => p.is_default) || list[0];
//
// with no way to choose. /catalog/offerings returns prices ordered
// `is_default DESC, unit_amount`, so with no is_default flag set that
// resolves to THE CHEAPEST PRICE. Measured against production the day this
// was found: 51 of 79 active offerings carry more than one active price, 36
// of them with no default flagged, and the picker under-quoted on 50 of 50 —
// Build Your Foundation pre-filled at $499.99 against a $5,399.89 top price,
// Per-push Plowing (six real tiers, $400–$1,200) always started at $400, and
// the worst gap was $14,700 on the FORGE Maintenance Retainer.
//
// Two things were wrong and both are fixed here:
//   1. no price selection    → every price is now its own button, the same
//                              shape CatalogLineItemPicker has always used.
//   2. no billing cadence    → 98 of 114 active prices are recurring, and the
//                              line description was the bare service name, so
//                              $29.99/mo read to the customer as a one-off
//                              $29.99 and summed into a one-off total.
//
// It also now carries service_offering_id + service_price_id onto the line.
// Quotes, jobs and invoices all record those; proposals recorded neither, so
// an accepted proposal could not be traced back to the catalogue price it
// came from. line_items_json passes unknown keys through untouched, so this
// needs no API or migration change.
import { useMemo, useState } from "react";

export interface CatalogPrice {
  price_id: string;
  unit_amount?: number;
  currency?: string;
  label?: string | null;
  pricing_model?: string | null;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  is_default?: boolean;
}

export interface CatalogOffering {
  offering_id: string;
  name: string;
  description?: string | null;
  features_json?: string | null;
  category_name?: string | null;
  prices?: CatalogPrice[];
}

export interface PickedService {
  /** The line item to add (legacy shape, still emitted). */
  item: {
    description: string;
    quantity: number;
    unit_price: number;
    service_offering_id?: string;
    service_price_id?: string;
  };
  /** HTML to append to a plain-text narrative (legacy shape). */
  scopeHtml: string;
  /** Structured pieces, for block-based editors that lay the section out
      themselves rather than accepting pre-rendered HTML. */
  parts: {
    name: string;
    description: string;
    features: string[];
    unit_price: number;
    /** Which catalogue price this came from — null when the offering has none. */
    offering_id: string;
    price_id: string | null;
    /** "billed monthly" / "billed annually" / null for a one-off. Shown on the
        document so a recurring price cannot read as a one-time total. */
    cadence: string | null;
    /** The price's OWN label — "Per 1,000 sq ft", "2-3 inch push" — i.e. what
        one of them is. Empty when the catalogue price carries no label. */
    label: string;
  };
}

/** Amount in whole currency units. service_offering_price.unit_amount is
    stored in DOLLARS, not cents — verified against prod 2026-08-19: a 2-3"
    plow push is unit_amount=525, i.e. $525. An earlier version divided by 100
    on the assumption every money column is minor units, and quoted the
    founder's $525 service at $5.25. */
function amountOf(p?: CatalogPrice | null): number {
  const amount = Number(p?.unit_amount);
  return Number.isFinite(amount) ? amount : 0;
}

export function isRecurring(p?: CatalogPrice | null): boolean {
  return !!p && (p.pricing_model === "recurring" || !!p.recurring_interval);
}

/**
 * The units a price LABEL can name, and the words a customer reads for each.
 *
 * D-09 (2026-09-16 user test): every row of a snow rate card printed "billed
 * monthly", including the six per-push tiers, on a contract somebody signs.
 * The catalogue is not lying — those tiers really are stored
 * `pricing_model: "recurring", recurring_interval: "month"`, because that is
 * how they were set up to bill — but the price's own LABEL says "2-3 inch
 * push", and a push is what the customer is buying. The label wins, because it
 * is the more specific thing the catalogue carries.
 *
 * Ordered longest-first so "cubic yard" is matched before "yard".
 */
const LABEL_UNITS: Array<[RegExp, string]> = [
  [/\bcubic\s+yards?\b/i, "per cubic yard"],
  [/\bapplications?\b/i, "per application"],
  [/\boccurrences?\b/i, "per occurrence"],
  [/\bpushe?s?\b/i, "per push"],
  [/\bvisits?\b/i, "per visit"],
  [/\bevents?\b/i, "per event"],
  [/\btrips?\b/i, "per trip"],
  [/\bcleanups?\b/i, "per cleanup"],
  [/\bhours?\b/i, "per hour"],
  [/\byards?\b/i, "per yard"],
  [/\bseasons?\b|\bseasonal\b/i, "per season"],
  [/\bmonthly\b|\bper month\b/i, "monthly"],
  [/\bannual(ly)?\b|\byearly\b|\bper year\b/i, "annually"],
];

/** The unit a price label names, or null when it names none. */
export function unitFromLabel(label?: string | null): string | null {
  const s = String(label ?? "");
  if (!s.trim()) return null;
  for (const [re, words] of LABEL_UNITS) if (re.test(s)) return words;
  return null;
}

/**
 * How this price bills, in words a customer reads on the document.
 *
 * PLAIN WORDS, NOT "billed …" (D-09). "per push", "per visit", "monthly",
 * "annually" — what a home-services owner would write on a rate card. A plain
 * one-off price with no unit in its label returns null: the amount is the
 * amount, and "(one-time)" after every line is noise, not information.
 */
export function cadenceOf(p?: CatalogPrice | null): string | null {
  const fromLabel = unitFromLabel(p?.label);
  if (fromLabel) return fromLabel;
  if (!isRecurring(p)) return null;
  const n = Number(p?.recurring_interval_count) || 1;
  const unit = p?.recurring_interval || "";
  if (n > 1) return `every ${n} ${unit}s`;
  if (unit === "month") return "monthly";
  if (unit === "year") return "annually";
  if (unit === "week") return "weekly";
  if (unit === "day") return "daily";
  return unit ? `per ${unit}` : "recurring";
}

/**
 * What goes in a rate card's "Basis" column — never blank.
 *
 * A rate card has a column headed "Basis" and every row must answer it. Where
 * `cadenceOf` declines (a plain one-off), the honest answer is "one-time", and
 * the old fallback — the literal string "Each visit", invented by the builder
 * for a price that says nothing of the kind — is gone.
 */
export function basisOf(p?: CatalogPrice | null): string {
  return cadenceOf(p) || (isRecurring(p) ? "recurring" : "one-time");
}

/* `shortCadence` LIVED HERE and is DELETED with the second picker it was the
   button label for. The one picker says the price and the cadence in the words
   `cadenceOf` returns — "billed monthly", "per push" — which is what the
   basis column and the document already say. */

/**
 * Money, with thousands separators, everywhere (D-29).
 *
 * Exported because the builder used to write a rate-card cell with
 * `$${n.toFixed(2)}`, which printed **$1200.00** beside $400.00 and $625.00 on
 * the same signed rate card. `toFixed` has no separator and never will; there
 * is one formatter and this is it.
 */
export function fmtMoney(n: number) {
  return `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Features are stored as JSON; malformed data must not break the picker. */
function featuresOf(o: CatalogOffering): string[] {
  try {
    const parsed = JSON.parse(o.features_json || "[]");
    if (Array.isArray(parsed)) return parsed.map((f) => (typeof f === "string" ? f : f?.label ?? "")).filter(Boolean);
  } catch { /* fall through */ }
  return [];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * @param price the price the writer clicked. Pass null only when the offering
 *              has no catalogue prices at all — then the line starts at $0 and
 *              is edited inline, which is honest about there being no price to
 *              inherit rather than inventing one.
 */
export function buildPick(o: CatalogOffering, price: CatalogPrice | null): PickedService {
  const features = featuresOf(o);
  const unit = amountOf(price);
  const cadence = cadenceOf(price);
  // A price can carry its own label ("2-3 inch push") — that IS the
  // distinguishing detail between tiers of the same service, so it belongs in
  // the line description, not just in the picker.
  const label = (price?.label || "").trim();
  const displayName = label ? `${o.name} — ${label}` : o.name;

  const parts: string[] = [`<h3>${esc(displayName)}</h3>`];
  if (o.description?.trim()) parts.push(`<p>${esc(o.description.trim())}</p>`);
  if (features.length) {
    parts.push(`<ul>${features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`);
  }

  return {
    item: {
      // The cadence rides in the description because the price column shows a
      // bare number. Without it "$29.99" on a proposal is read as the whole
      // cost of the engagement.
      description: cadence ? `${displayName} (${cadence})` : displayName,
      quantity: 1,
      unit_price: unit,
      service_offering_id: o.offering_id,
      ...(price ? { service_price_id: price.price_id } : {}),
    },
    scopeHtml: parts.join("\n"),
    parts: {
      name: displayName,
      description: (o.description || "").trim(),
      features,
      unit_price: unit,
      offering_id: o.offering_id,
      price_id: price?.price_id ?? null,
      cadence,
      // THE PRICE'S OWN LABEL — "Per 1,000 sq ft", "2-3 inch push". It is what
      // ONE of them is, and D-164 prints it beside the rate so a quantity can
      // never be read as a count when the catalogue meant a measurement.
      label,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PICKER (D-156 stream B) — one component, every widget that loads from
   Products & Services.
   ══════════════════════════════════════════════════════════════════════════

   There were TWO. This file exported a `ProposalCatalogPicker` that opened
   itself from a "+ Add from your services" link, and the builder had its own
   `CatalogPicker` inside ProposalBuilder.tsx. Nothing imported the one in this
   file — only its READERS (`buildPick`, `cadenceOf`, `basisOf`, `fmtMoney`)
   were ever used — so a picker nobody could open sat beside the picker
   everybody used, and each of them had its own idea of what a price button
   says. Replace means delete: the builder's is the one that shipped, it moved
   in here, and the other is gone.

   The product card, the priced line and the pricing table all open THIS, and
   so does the Products & services group of the widget picker. It takes the
   offerings it is given rather than fetching: the builder loads the catalogue
   once when it opens (D-147's one-fetch rule) and every picker on the page
   reads the same list. */

export interface CatalogPickerProps {
  offerings: CatalogOffering[];
  /** The line above the search box, in the words of the widget that opened it. */
  label: string;
  onPick: (o: CatalogOffering, price: CatalogPrice | null) => void;
  /** Offered only where adding every tier at once makes sense (tier cards). */
  onPickAll?: (o: CatalogOffering) => void;
  bulkLabel?: (o: CatalogOffering) => string;
  /** M-24 — still on its way. Says so instead of reading "nothing here". */
  loading?: boolean;
}

const PICK_LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A",
};
const PICK_INPUT: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 4, padding: "6px 8px", fontSize: 12,
  background: "#fff", color: "#0B1C24", width: "100%",
};
const PICK_BTN: React.CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 6, background: "#fff", color: "#334155",
  padding: "2px 7px", fontSize: 10, cursor: "pointer",
};

/* ══════════════════════════════════════════════════════════════════════════
   THE ONE CATALOGUE PICKER, MULTI-SELECT (scope 11.13.2, 2026-09-19)
   ══════════════════════════════════════════════════════════════════════════

   Brandon: "Then cards or line items that you can load the products from."

   The **Product Cards** and **Product Line Items** tiles in the widget pane
   open THIS, in multi-select: *whole catalogue / one category / picked items*,
   and one atomic widget is dropped per pick. It is the same component and the
   same list the per-widget pickers use — one picker on the platform, as F.1
   asks — with a `select` mode that adds the checkboxes and the three scope
   buttons. Two pickers is how the two started saying different things about a
   price (the note above this one, 2026-09-17). */

/** One thing the author picked: an offering and, where it has one, a price. */
export interface CatalogueChoice {
  offering: CatalogOffering;
  price: CatalogPrice | null;
}

/** The three scopes, in Brandon's own words. Nothing else is offered. */
export type CatalogueScope = "all" | "category" | "picked";

/** A stable key for one offering+price pair. The checkbox's identity. */
export function choiceKey(offeringId: string, priceId: string | null): string {
  return `${offeringId}::${priceId || ""}`;
}

/**
 * EVERY PICKABLE PAIR of a catalogue, in catalogue order.
 *
 * An offering with three prices is three choices, because a tier IS what the
 * author picks — "Per-push Plowing" is not a thing anybody quotes, "Per-push
 * Plowing, 2-3 inch push, $525" is. An offering with NO price is one choice
 * with a null price, which drops a card at $0 the author types over; refusing
 * to offer it would hide a service somebody sells.
 */
export function choicesOf(offerings: CatalogOffering[]): CatalogueChoice[] {
  const out: CatalogueChoice[] = [];
  for (const o of offerings) {
    const prices = o.prices?.length ? o.prices : [null];
    for (const p of prices) out.push({ offering: o, price: p });
  }
  return out;
}

/** The categories the catalogue actually has, in first-seen order. */
export function categoriesOf(offerings: CatalogOffering[]): string[] {
  const out: string[] = [];
  for (const o of offerings) {
    const c = (o.category_name || "").trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * WHAT A SCOPE MEANS, as a list of choices. Pure, so it is a test and not a
 * click-through.
 *
 * `all`      — every priced pair in the catalogue.
 * `category` — every pair in the named category. An unknown or empty category
 *              is NOTHING, never everything: "add one category" that silently
 *              added the whole catalogue is the kind of quiet over-quote the
 *              2026-08-25 defect note above was written for.
 * `picked`   — exactly the boxes ticked, in catalogue order.
 */
export function choicesForScope(
  offerings: CatalogOffering[],
  scope: CatalogueScope,
  category: string,
  ticked: string[],
): CatalogueChoice[] {
  const all = choicesOf(offerings);
  if (scope === "all") return all;
  if (scope === "category") {
    const want = (category || "").trim();
    if (!want) return [];
    return all.filter((c) => (c.offering.category_name || "").trim() === want);
  }
  const set = new Set(ticked);
  return all.filter((c) => set.has(choiceKey(c.offering.offering_id, c.price?.price_id ?? null)));
}

export interface CatalogueMultiPickerProps {
  offerings: CatalogOffering[];
  /** What the tile that opened this is going to drop. Plain words, on screen. */
  what: string;
  loading?: boolean;
  onAdd: (choices: CatalogueChoice[]) => void;
  onCancel: () => void;
}

/**
 * The multi-select picker the two IA tiles open.
 *
 * The "Add" button says HOW MANY it is about to add, because "whole catalogue"
 * on a business with 79 offerings and 114 prices is a click that fills a page
 * — and a person who can see "Add 114" before they press it does not make that
 * mistake twice.
 */
export function CatalogueMultiPicker({ offerings, what, loading, onAdd, onCancel }: CatalogueMultiPickerProps) {
  const [scope, setScope] = useState<CatalogueScope>("picked");
  const [category, setCategory] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const categories = useMemo(() => categoriesOf(offerings), [offerings]);
  const visible = useMemo(
    () => choicesOf(offerings).filter((c) => !q.trim()
      || c.offering.name.toLowerCase().includes(q.trim().toLowerCase())
      || (c.price?.label || "").toLowerCase().includes(q.trim().toLowerCase())),
    [offerings, q],
  );
  const chosen = useMemo(
    () => choicesForScope(offerings, scope, category, ticked),
    [offerings, scope, category, ticked],
  );

  const toggle = (key: string) => {
    setScope("picked");
    setTicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const scopeBtn = (v: CatalogueScope, text: string, title: string) => (
    <button type="button" data-scope={v} title={title}
      onClick={() => setScope(v)}
      style={{ ...PICK_BTN, ...(scope === v ? { borderColor: "#0B6E8C", color: "#0B6E8C", fontWeight: 700 } : {}) }}>
      {text}
    </button>
  );

  return (
    <div data-catalogue-multi="1" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={PICK_LBL}>Pick what goes on the page</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {scopeBtn("all", "Whole catalogue", "Add every product and service you sell, at its catalogue price")}
        {scopeBtn("category", "One category", "Add everything in one category")}
        {scopeBtn("picked", "Just these", "Add only the ones you tick below")}
      </div>
      {scope === "category" && (
        <select data-category-select="1" style={PICK_INPUT} value={category}
          title="Which category goes on the page"
          onChange={(e) => setCategory(e.target.value)}>
          <option value="">Choose a category…</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <input style={PICK_INPUT} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search your services…" title="Search Products & Services" data-catalog-search="1" />
      <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {loading && !offerings.length && (
          <div data-catalogue-loading="1" style={{ fontSize: 11, color: "#5A7A8A", padding: "6px 2px" }}>
            Loading your catalogue…
          </div>
        )}
        {!loading && !offerings.length && (
          <div style={{ fontSize: 11, color: "#5A7A8A", padding: "6px 2px" }}>
            Nothing in Products &amp; Services yet. Add what you sell there and it is here every time.
          </div>
        )}
        {visible.map((c) => {
          const key = choiceKey(c.offering.offering_id, c.price?.price_id ?? null);
          const inScope = chosen.some((x) =>
            choiceKey(x.offering.offering_id, x.price?.price_id ?? null) === key);
          return (
            <label key={key} data-choice={key}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#0B1C24", cursor: "pointer" }}>
              <input type="checkbox" checked={inScope} onChange={() => toggle(key)}
                title={`Put ${c.offering.name} on the page`} />
              <span style={{ fontWeight: 600 }}>{c.offering.name}</span>
              <span style={{ color: "#5A7A8A" }}>
                {c.price
                  ? `${c.price.label ? `${c.price.label} · ` : ""}${fmtMoney(Number(c.price.unit_amount ?? 0))}${cadenceOf(c.price) ? `, ${cadenceOf(c.price)}` : ""}`
                  : "no price yet"}
              </span>
            </label>
          );
        })}
        {!visible.length && !!offerings.length && (
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Nothing matches “{q}”.</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" data-add-picked="1" disabled={!chosen.length}
          title={chosen.length
            ? `Put ${chosen.length} ${what} on the page, at their catalogue prices`
            : "Tick something first, or choose the whole catalogue"}
          style={{ ...PICK_BTN, borderColor: "#EF6C33", color: chosen.length ? "#EF6C33" : "#94A3B8", fontWeight: 700 }}
          onClick={() => onAdd(chosen)}>
          {chosen.length ? `Add ${chosen.length} ${what}` : `Add ${what}`}
        </button>
        <button type="button" style={PICK_BTN} onClick={onCancel} title="Close without adding anything">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CatalogPicker({ offerings, label, onPick, onPickAll, bulkLabel, loading }: CatalogPickerProps) {
  const [q, setQ] = useState("");
  const list = useMemo(
    () => offerings.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase())),
    [offerings, q],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={PICK_LBL}>{label}</span>
      <input style={PICK_INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your services…"
        title="Search Products & Services" data-catalog-search="1" />
      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {loading && !offerings.length && (
          <div data-catalogue-loading="1" style={{ fontSize: 11, color: "#5A7A8A", padding: "6px 2px" }}>
            Loading your catalogue…
          </div>
        )}
        {!loading && !offerings.length && (
          <div style={{ fontSize: 11, color: "#5A7A8A", padding: "6px 2px" }}>
            Nothing in Products &amp; Services yet. Add what you sell there and it is here every time.
          </div>
        )}
        {list.map((o) => (
          <div key={o.offering_id} data-offering={o.offering_id}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#0B1C24" }}>{o.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
              {(o.prices?.length ? o.prices : [null]).map((pr, i) => (
                <button key={pr?.price_id || i} type="button" style={PICK_BTN}
                  title={pr
                    ? `Adds at ${fmtMoney(Number(pr.unit_amount ?? 0))}${cadenceOf(pr) ? `, ${cadenceOf(pr)}` : ""} — the basis is written onto the line`
                    : "No catalogue price — starts at $0 and you type it"}
                  onClick={() => onPick(o, pr)}>
                  {pr ? `${pr.label ? `${pr.label} · ` : ""}${fmtMoney(Number(pr.unit_amount ?? 0))}` : "No price — type one"}
                </button>
              ))}
              {onPickAll && (o.prices?.length ?? 0) > 1 && (
                <button type="button" data-add-all={o.offering_id}
                  style={{ ...PICK_BTN, borderColor: "#0B6E8C", color: "#0B6E8C" }}
                  title={`Add every priced tier of ${o.name} as its own card, filled from the catalogue`}
                  onClick={() => onPickAll(o)}>
                  {bulkLabel ? bulkLabel(o) : `Add all ${o.prices?.length}`}
                </button>
              )}
            </div>
          </div>
        ))}
        {!list.length && <div style={{ fontSize: 11, color: "#94A3B8" }}>Nothing matches “{q}”.</div>}
      </div>
    </div>
  );
}
