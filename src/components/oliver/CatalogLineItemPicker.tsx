/**
 * CatalogLineItemPicker — Phase 3 catalog-driven job composition.
 *
 * Renders a table of line items + a "+ Add from catalog" picker. Each
 * catalog item snapshots its description, unit price, and (if present)
 * duration into the line — renaming or repricing the catalog entry later
 * doesn't rewrite history. Users can also add a free-form line if the
 * service doesn't live in the catalog yet.
 *
 * Used by JobModal (existing jobs) and JobCreateForm (new jobs).
 */
import { useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

export interface LineItem {
  id?: string;                 // present for persisted items
  description: string;
  quantity: number;
  unit_price: number;
  service_offering_id?: string | null;
  duration_minutes?: number | null;
  sort_order?: number;
  // F-57 (Defect #92): per-line-item discount. Both null = no discount.
  discount_type?: "percent" | "fixed" | null;
  discount_value?: number | null;
}

// F-57 helper — mirrors the backend calculator so the UI shows the same
// number the server will persist as line_total.
export function computeLineTotal(it: Pick<LineItem, "quantity" | "unit_price" | "discount_type" | "discount_value">): number {
  const gross = Number(it.quantity || 0) * Number(it.unit_price || 0);
  if (it.discount_type === "percent") {
    const pct = Math.min(100, Math.max(0, Number(it.discount_value) || 0));
    return Math.round((gross - gross * (pct / 100)) * 100) / 100;
  }
  if (it.discount_type === "fixed") {
    const amt = Math.max(0, Number(it.discount_value) || 0);
    return Math.round((gross - Math.min(gross, amt)) * 100) / 100;
  }
  return Math.round(gross * 100) / 100;
}

interface CatalogOffering {
  offering_id: string;
  name: string;
  description?: string | null;
  default_duration_minutes?: number | null;
  prices?: Array<{
    price_id: string;
    unit_amount: number;
    label?: string | null;
    pricing_model?: string | null;
    recurring_interval?: string | null;
  }>;
}

function fmtMoney(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CatalogLineItemPicker({
  items,
  onChange,
  disabled,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  disabled?: boolean;
}) {
  const { get, ready } = useOliverApi();
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!ready || loaded) return;
    (async () => {
      try {
        const data = await get<{ data: CatalogOffering[] } | CatalogOffering[]>("/catalog/offerings?include_prices=1");
        const list = Array.isArray(data) ? data : ((data as any).data ?? []);
        setOfferings(list);
      } catch {
        setOfferings([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, [ready, loaded, get]);

  // 2026-05-25 — Show EVERY offering, not just one-time-priced ones.
  // Recurring catalog items (a Pro tier subscription, a maintenance retainer,
  // etc.) are still legitimate line items on a job — they get billed once
  // per occurrence in that context. Filtering them out hid 90%+ of the
  // founder tenant's catalog (only "Business Consulting" had one_time
  // prices). Subscriptions still gate on recurring-only prices in their
  // own picker; that lives in SubscriptionCreatePanel and is separate.
  const filteredOfferings = useMemo(() => {
    if (!search.trim()) return offerings;
    const q = search.toLowerCase();
    return offerings.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q)
    );
  }, [offerings, search]);

  function addCatalogItem(off: CatalogOffering, priceIdx = 0) {
    // priceIdx === -1 means "offering has no catalog prices — add at $0
    // and let the user edit inline".
    const price = priceIdx >= 0 ? (off.prices || [])[priceIdx] : null;
    const newItem: LineItem = {
      description: off.name + (price?.label ? ` (${price.label})` : ""),
      quantity: 1,
      unit_price: Number(price?.unit_amount ?? 0),
      service_offering_id: off.offering_id,
      duration_minutes: off.default_duration_minutes ?? null,
      sort_order: items.length,
    };
    onChange([...items, newItem]);
    setPickerOpen(false);
    setSearch("");
  }

  function addCustomLine() {
    onChange([
      ...items,
      { description: "", quantity: 1, unit_price: 0, sort_order: items.length },
    ]);
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  }

  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sort_order: i })));
  }

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + computeLineTotal(it), 0),
    [items],
  );
  const totalDuration = useMemo(
    () => items.reduce((s, it) => s + (Number(it.duration_minutes || 0) * Number(it.quantity || 1)), 0),
    [items],
  );

  return (
    <div>
      {items.length === 0 ? (
        <div style={{
          padding: 18, border: "1px dashed #cbd5e1", borderRadius: 8,
          textAlign: "center", color: "#5A7A8A", fontSize: 12, background: "#F8FAFC",
        }}>
          No line items yet. Add services from your catalog or enter custom lines.
        </div>
      ) : (
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#5A7A8A" }}>
              <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 600 }}>Service</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, width: 70 }}>Qty</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, width: 110 }}>Unit price</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, width: 150 }}>Discount</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, width: 110 }}>Line total</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const lineTotal = computeLineTotal(it);
              const discountType = it.discount_type ?? "";
              const discountValue = it.discount_value ?? 0;
              return (
                <tr key={it.id || idx} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "8px 0" }}>
                    <input
                      type="text"
                      value={it.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder="Service description"
                      disabled={disabled}
                      style={{ width: "100%", border: "none", padding: "4px 0", fontSize: 12, color: "#0B1C24", background: "transparent" }}
                    />
                    {it.service_offering_id && (
                      <div style={{ fontSize: 10, color: "#1A7DB5", marginTop: 1 }}>
                        from catalog
                        {it.duration_minutes ? ` · ${it.duration_minutes} min default` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px" }}>
                    <input
                      type="number" min={0} step="0.25" value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                      disabled={disabled}
                      style={{ width: "100%", textAlign: "right", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}
                    />
                  </td>
                  <td style={{ padding: "8px" }}>
                    <input
                      type="number" min={0} step="0.01" value={it.unit_price}
                      onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })}
                      disabled={disabled}
                      style={{ width: "100%", textAlign: "right", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 6px", fontSize: 12, fontFamily: "monospace" }}
                    />
                  </td>
                  <td style={{ padding: "8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <select
                        value={discountType}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "percent" || v === "fixed") {
                            updateItem(idx, { discount_type: v, discount_value: it.discount_value ?? 0 });
                          } else {
                            updateItem(idx, { discount_type: null, discount_value: null });
                          }
                        }}
                        disabled={disabled}
                        style={{ width: 62, border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 4px", fontSize: 11, background: "#fff" }}
                        title="Line-item discount type"
                      >
                        <option value="">—</option>
                        <option value="percent">%</option>
                        <option value="fixed">$</option>
                      </select>
                      <input
                        type="number" min={0} step="0.01"
                        value={discountType ? discountValue : ""}
                        placeholder="0"
                        onChange={(e) => updateItem(idx, { discount_value: Number(e.target.value) || 0 })}
                        disabled={disabled || !discountType}
                        style={{ width: "100%", textAlign: "right", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 6px", fontSize: 12, fontFamily: "monospace" }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#0B1C24" }}>
                    {fmtMoney(lineTotal)}
                  </td>
                  <td style={{ padding: "8px", textAlign: "center" }}>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        title="Remove line"
                        style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, color: "#5A7A8A", fontWeight: 600 }}>
                Subtotal
              </td>
              <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#0B1C24" }}>
                {fmtMoney(subtotal)}
              </td>
              <td />
            </tr>
            {totalDuration > 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "0 8px 6px", textAlign: "right", fontSize: 10, color: "#5A7A8A" }}>
                  Estimated duration
                </td>
                <td style={{ padding: "0 8px 6px", textAlign: "right", fontSize: 10, color: "#1A7DB5" }}>
                  {totalDuration >= 60 ? `${(totalDuration / 60).toFixed(1)} hr` : `${totalDuration} min`}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      )}

      {!disabled && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!pickerOpen ? (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                style={{ fontSize: 12, padding: "6px 12px", background: "#0C4A60", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                + Add from catalog
              </button>
              <button
                type="button"
                onClick={addCustomLine}
                style={{ fontSize: 12, padding: "6px 12px", background: "#fff", color: "#0C4A60", border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}
              >
                + Add custom line
              </button>
            </>
          ) : (
            <div style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="search"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={loaded && offerings.length === 0 ? "No catalog items yet — add some on Products & Services" : "Search services in your catalog…"}
                  disabled={loaded && offerings.length === 0}
                  style={{ flex: 1, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13 }}
                />
                <button
                  type="button"
                  onClick={() => { setPickerOpen(false); setSearch(""); }}
                  style={{ background: "none", border: "none", color: "#5A7A8A", cursor: "pointer", fontSize: 13 }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {!loaded ? (
                  <div style={{ fontSize: 12, color: "#5A7A8A", padding: 8 }}>Loading catalog…</div>
                ) : filteredOfferings.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#5A7A8A", padding: 8 }}>
                    {offerings.length === 0
                      ? "Your catalog is empty. Add products and services first."
                      : "No matches. Try a different search or use “+ Add custom line”."}
                  </div>
                ) : (
                  filteredOfferings.map((o) => {
                    const prices = o.prices || [];
                    return (
                      <div key={o.offering_id} style={{ borderBottom: "1px solid #F3F4F6", padding: "8px 4px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{o.name}</div>
                        {o.description && (
                          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 1, marginBottom: 4 }}>{o.description}</div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {prices.length === 0 ? (
                            // Offering has no prices in catalog — add at $0 and
                            // let the user set the price inline.
                            <button
                              type="button"
                              onClick={() => addCatalogItem(o, -1)}
                              style={{
                                fontSize: 11, padding: "4px 10px", background: "#fff",
                                color: "#0C4A60", border: "1px dashed rgba(45,156,219,0.28)",
                                borderRadius: 4, cursor: "pointer",
                              }}
                            >
                              + Add (no preset price — set inline)
                            </button>
                          ) : prices.map((p, idx) => {
                            const isRecurring = p.pricing_model === "recurring" || !!p.recurring_interval;
                            return (
                              <button
                                key={p.price_id}
                                type="button"
                                onClick={() => addCatalogItem(o, idx)}
                                title={isRecurring
                                  ? `Adds at ${fmtMoney(Number(p.unit_amount))} per occurrence (catalog price is recurring; on a job it bills once)`
                                  : ""}
                                style={{
                                  fontSize: 11, padding: "4px 10px",
                                  background: isRecurring ? "#FEF3C7" : "#E8F4FB",
                                  color: isRecurring ? "#92400E" : "#0C4A60",
                                  border: `1px solid ${isRecurring ? "rgba(217,119,6,0.4)" : "rgba(45,156,219,0.28)"}`,
                                  borderRadius: 4, cursor: "pointer",
                                }}
                              >
                                + {fmtMoney(Number(p.unit_amount))}
                                {p.label ? ` (${p.label})` : ""}
                                {isRecurring ? " · recurring" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
