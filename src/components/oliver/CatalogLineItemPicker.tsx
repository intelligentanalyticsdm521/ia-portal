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

  // Filter offerings by search (skip recurring-only offerings — those are for
  // subscriptions, not jobs).
  const filteredOfferings = useMemo(() => {
    const oneTime = offerings
      .map((o) => {
        const prices = (o.prices || []).filter((p) => !(p.pricing_model === "recurring" || p.recurring_interval));
        return { ...o, prices };
      })
      .filter((o) => (o.prices || []).length > 0);
    if (!search.trim()) return oneTime;
    const q = search.toLowerCase();
    return oneTime.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q)
    );
  }, [offerings, search]);

  function addCatalogItem(off: CatalogOffering, priceIdx = 0) {
    const price = (off.prices || [])[priceIdx];
    if (!price) return;
    const newItem: LineItem = {
      description: off.name + (price.label ? ` (${price.label})` : ""),
      quantity: 1,
      unit_price: Number(price.unit_amount),
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
    () => items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0),
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
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, width: 110 }}>Line total</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
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
              <td colSpan={3} style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, color: "#5A7A8A", fontWeight: 600 }}>
                Subtotal
              </td>
              <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#0B1C24" }}>
                {fmtMoney(subtotal)}
              </td>
              <td />
            </tr>
            {totalDuration > 0 && (
              <tr>
                <td colSpan={3} style={{ padding: "0 8px 6px", textAlign: "right", fontSize: 10, color: "#5A7A8A" }}>
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
                  filteredOfferings.map((o) => (
                    <div key={o.offering_id} style={{ borderBottom: "1px solid #F3F4F6", padding: "8px 4px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{o.name}</div>
                      {o.description && (
                        <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 1, marginBottom: 4 }}>{o.description}</div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(o.prices || []).map((p, idx) => (
                          <button
                            key={p.price_id}
                            type="button"
                            onClick={() => addCatalogItem(o, idx)}
                            style={{
                              fontSize: 11, padding: "4px 10px", background: "#E8F4FB",
                              color: "#0C4A60", border: "1px solid rgba(45,156,219,0.28)",
                              borderRadius: 4, cursor: "pointer",
                            }}
                          >
                            + {fmtMoney(Number(p.unit_amount))}
                            {p.label ? ` (${p.label})` : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
