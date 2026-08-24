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
//   * adds the line item, priced from the catalogue's default price
//   * appends its description to the proposal narrative as a section
//   * appends its features_json bullets under that description
//
// The writer then edits — the catalogue supplies the first draft, not the
// final wording. Editing here never writes back to the catalogue, because one
// customer's proposal should not silently rewrite the product for everyone.
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Package } from "lucide-react";

export interface CatalogOffering {
  offering_id: string;
  name: string;
  description?: string | null;
  features_json?: string | null;
  category_name?: string | null;
  prices?: Array<{ unit_amount?: number; is_default?: boolean; currency?: string }>;
}

export interface PickedService {
  /** The line item to add (legacy shape, still emitted). */
  item: { description: string; quantity: number; unit_price: number };
  /** HTML to append to a plain-text narrative (legacy shape). */
  scopeHtml: string;
  /** Structured pieces, for block-based editors that lay the section out
      themselves rather than accepting pre-rendered HTML. */
  parts: { name: string; description: string; features: string[]; unit_price: number };
}

/** Default price in whole currency units, or 0 when the catalogue has none. */
function defaultPrice(o: CatalogOffering): number {
  const list = o.prices || [];
  const pick = list.find((p) => p.is_default) || list[0];
  const amount = Number(pick?.unit_amount);
  if (!Number.isFinite(amount)) return 0;
  // service_offering_price stores minor units (cents), like every other money
  // column in OLIVER. Dividing here keeps the editor in dollars.
  return Math.round(amount) / 100;
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

export function buildPick(o: CatalogOffering): PickedService {
  const features = featuresOf(o);
  const parts: string[] = [`<h3>${esc(o.name)}</h3>`];
  if (o.description?.trim()) parts.push(`<p>${esc(o.description.trim())}</p>`);
  if (features.length) {
    parts.push(`<ul>${features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`);
  }
  return {
    item: { description: o.name, quantity: 1, unit_price: defaultPrice(o) },
    scopeHtml: parts.join("\n"),
    parts: {
      name: o.name,
      description: (o.description || "").trim(),
      features,
      unit_price: defaultPrice(o),
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
    get<{ data: CatalogOffering[] }>("/catalog/offerings?include_prices=1")
      .then((r) => setOfferings(r.data || []))
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
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a service"
          style={{ flex: 1, border: 0, background: "transparent", fontSize: 12, outline: "none" }}
        />
        <button onClick={() => setOpen(false)} style={{ border: 0, background: "none", color: "#8AA6B4", cursor: "pointer", fontSize: 11 }}>
          Done
        </button>
      </div>

      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {offerings === null && <div style={{ padding: 10, fontSize: 12, color: "#6B8A99" }}>Loading your services…</div>}

        {offerings !== null && !offerings.length && (
          <div style={{ padding: 12, fontSize: 12, color: "#6B8A99" }}>
            No services in your catalogue yet. Add them under Products &amp; Services and their
            descriptions will flow into proposals from then on.
          </div>
        )}

        {filtered.map((o) => {
          const price = defaultPrice(o);
          const features = featuresOf(o);
          return (
            <button
              key={o.offering_id}
              onClick={() => { onPick(buildPick(o)); setOpen(false); setQuery(""); }}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                border: 0, borderBottom: "1px solid #F1F5F9", background: "transparent", cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Package className="h-3 w-3" style={{ color: "#1A7DB5", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{o.name}</span>
                {o.category_name && (
                  <span style={{ fontSize: 10, color: "#8AA6B4" }}>{o.category_name}</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "monospace", color: "#3A5A6A" }}>
                  {price ? `$${price.toFixed(2)}` : "—"}
                </span>
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
            </button>
          );
        })}

        {offerings !== null && offerings.length > 0 && !filtered.length && (
          <div style={{ padding: 10, fontSize: 12, color: "#6B8A99" }}>No service matches “{query}”.</div>
        )}
      </div>

      <div style={{ padding: "6px 10px", fontSize: 10, color: "#8AA6B4", borderTop: "1px solid #E8F0F4" }}>
        Adds the line item and drops its description into the proposal, where you can edit it.
      </div>
    </div>
  );
}
