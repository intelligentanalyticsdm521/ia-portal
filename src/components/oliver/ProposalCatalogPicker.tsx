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
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Package } from "lucide-react";

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

/** How this price bills, in words a customer reads on the document. */
export function cadenceOf(p?: CatalogPrice | null): string | null {
  if (!isRecurring(p)) return null;
  const n = Number(p?.recurring_interval_count) || 1;
  const unit = p?.recurring_interval || "";
  if (n > 1) return `billed every ${n} ${unit}s`;
  if (unit === "month") return "billed monthly";
  if (unit === "year") return "billed annually";
  if (unit === "week") return "billed weekly";
  if (unit === "day") return "billed daily";
  return unit ? `billed per ${unit}` : "recurring";
}

/** Short form for the picker button, where space is tight. */
function shortCadence(p: CatalogPrice): string {
  const n = Number(p.recurring_interval_count) || 1;
  const u = p.recurring_interval;
  const unit = u === "month" ? "mo" : u === "year" ? "yr" : u === "week" ? "wk" : u === "day" ? "day" : u;
  return n > 1 ? `/${n}${unit}` : `/${unit}`;
}

function fmtMoney(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    },
  };
}

interface Props {
  get: <T>(p: string) => Promise<T>;
  ready: boolean;
  onPick: (picked: PickedService) => void;
}

export function ProposalCatalogPicker({ get, ready, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [offerings, setOfferings] = useState<CatalogOffering[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || !ready || offerings) return;
    // The oliver api client auto-unwraps { data: ... }; tolerate both shapes.
    get<any>("/catalog/offerings?include_prices=1")
      .then((r) => setOfferings(Array.isArray(r) ? r : (r as any)?.data ?? []))
      .catch(() => setOfferings([]));
  }, [open, ready, offerings, get]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = offerings || [];
    return q
      ? list.filter((o) =>
          o.name.toLowerCase().includes(q) ||
          (o.description || "").toLowerCase().includes(q) ||
          (o.category_name || "").toLowerCase().includes(q))
      : list;
  }, [offerings, query]);

  function pick(o: CatalogOffering, price: CatalogPrice | null) {
    onPick(buildPick(o, price));
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11, fontWeight: 600, color: "#1A7DB5", background: "transparent",
          border: 0, cursor: "pointer", marginTop: 8, marginLeft: 12, padding: 0,
        }}
      >
        + Add from your services
      </button>
    );
  }

  return (
    <div style={{ marginTop: 8, border: "1px solid #D5E2E8", borderRadius: 6, background: "#FAFDFE" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderBottom: "1px solid #E8F0F4" }}>
        <Search className="h-3 w-3" style={{ color: "#8AA6B4" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a service"
          style={{ flex: 1, border: 0, background: "transparent", fontSize: 12, outline: "none" }}
        />
        <span style={{ fontSize: 10, color: "#8AA6B4", whiteSpace: "nowrap" }}>
          {offerings ? `${filtered.length} of ${offerings.length}` : ""}
        </span>
        <button onClick={() => setOpen(false)} style={{ border: 0, background: "none", color: "#8AA6B4", cursor: "pointer", fontSize: 11 }}>
          Done
        </button>
      </div>

      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {offerings === null && <div style={{ padding: 10, fontSize: 12, color: "#6B8A99" }}>Loading your services…</div>}

        {offerings !== null && !offerings.length && (
          <div style={{ padding: 12, fontSize: 12, color: "#6B8A99" }}>
            No services in your catalogue yet. Add them under Products &amp; Services and their
            descriptions will flow into proposals from then on.
          </div>
        )}

        {filtered.map((o) => {
          const prices = o.prices || [];
          const features = featuresOf(o);
          return (
            <div key={o.offering_id} style={{ padding: "8px 10px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Package className="h-3 w-3" style={{ color: "#1A7DB5", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{o.name}</span>
                {o.category_name && (
                  <span style={{ fontSize: 10, color: "#8AA6B4" }}>{o.category_name}</span>
                )}
                {prices.length > 1 && (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#8AA6B4", whiteSpace: "nowrap" }}>
                    {prices.length} prices — pick one
                  </span>
                )}
              </div>

              {o.description && (
                <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2, paddingLeft: 18 }}>
                  {o.description.length > 120 ? `${o.description.slice(0, 120)}…` : o.description}
                </div>
              )}
              {features.length > 0 && (
                <div style={{ fontSize: 10, color: "#8AA6B4", marginTop: 2, paddingLeft: 18 }}>
                  brings {features.length} bullet{features.length === 1 ? "" : "s"} into the proposal
                </div>
              )}

              {/* One button per price. A service with six tiers gets six
                  buttons; the writer chooses, nothing is chosen for them. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, paddingLeft: 18 }}>
                {prices.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => pick(o, null)}
                    style={{
                      fontSize: 11, padding: "4px 10px", background: "#fff", color: "#0C4A60",
                      border: "1px dashed rgba(45,156,219,0.28)", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    + Add (no catalogue price — set it inline)
                  </button>
                ) : prices.map((p) => {
                  const rec = isRecurring(p);
                  return (
                    <button
                      key={p.price_id}
                      type="button"
                      onClick={() => pick(o, p)}
                      title={rec
                        ? `Adds at ${fmtMoney(amountOf(p))}, ${cadenceOf(p)} — the cadence is written onto the proposal line`
                        : `Adds at ${fmtMoney(amountOf(p))} as a one-time charge`}
                      style={{
                        fontSize: 11, padding: "4px 10px",
                        background: rec ? "#FEF3C7" : "#E8F4FB",
                        color: rec ? "#92400E" : "#0C4A60",
                        border: `1px solid ${rec ? "rgba(217,119,6,0.4)" : "rgba(45,156,219,0.28)"}`,
                        borderRadius: 4, cursor: "pointer",
                      }}
                    >
                      <Plus className="h-3 w-3" style={{ display: "inline", verticalAlign: "-2px", marginRight: 2 }} />
                      {fmtMoney(amountOf(p))}{rec ? shortCadence(p) : ""}
                      {p.label ? ` · ${p.label}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {offerings !== null && offerings.length > 0 && !filtered.length && (
          <div style={{ padding: 10, fontSize: 12, color: "#6B8A99" }}>No service matches “{query}”.</div>
        )}
      </div>

      <div style={{ padding: "6px 10px", fontSize: 10, color: "#8AA6B4", borderTop: "1px solid #E8F0F4" }}>
        Descriptions and bullets come from Products &amp; Services. Editing them here changes this
        proposal only.
      </div>
    </div>
  );
}
