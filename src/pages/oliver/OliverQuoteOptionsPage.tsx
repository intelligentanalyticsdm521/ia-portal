import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, EmptyState, Button,
} from "../../components/oliver/ui";
import { Edit3, Trash2, Star, CheckCircle2, Plus } from "lucide-react";

interface QuoteOption {
  option_id: string;
  quote_id: string;
  label: string;
  description: string | null;
  total_amount: number;
  line_items_json: string | LineItem[] | null;
  is_recommended: boolean;
  sort_order: number;
  selected_at: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

function fmtMoney(n?: number | null) {
  if (n == null) return "$0";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function parseLineItems(raw: string | LineItem[] | null): LineItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function OliverQuoteOptionsPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<QuoteOption | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const quoteId = useMemo(() => new URLSearchParams(window.location.search).get("quoteId") || "", []);

  const reload = useCallback(async () => {
    if (!quoteId) {
      setError(new Error("Missing quoteId query param"));
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const data = await get<QuoteOption[]>(`/quote-options/by-quote/${quoteId}`);
      setOptions(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, quoteId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function deleteOption(o: QuoteOption) {
    if (!confirm(`Delete option "${o.label}"?`)) return;
    try {
      await del(`/quote-options/${o.option_id}`);
      setFlash("Option deleted.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function selectOption(o: QuoteOption) {
    if (!confirm(`Mark "${o.label}" as the selected option? This locks the quote.`)) return;
    try {
      await post(`/quote-options/${o.option_id}/select`);
      setFlash(`"${o.label}" selected.`);
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Select failed");
    }
  }

  const sorted = useMemo(() => [...options].sort((a, b) => a.sort_order - b.sort_order), [options]);

  return (
    <OliverPageWrapper title="Quote Options" subtitle="Good / better / best alternatives for a single quote" error={error} loading={loading && !options.length}>
      <PageHeader
        title="Quote Options"
        subtitle={quoteId ? `Quote ${quoteId.slice(0, 8)} — present multiple price points so customers can pick the tier that fits.` : "Missing quoteId."}
        actions={<Button variant="primary" onClick={() => setShowCreate(true)} disabled={!quoteId || options.length >= 5}><Plus size={12} /> Add option</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      {!options.length && !loading ? (
        <EmptyState
          title="No options yet"
          description="Offer good/better/best alternatives — customers convert faster when given a choice. Add 2–3 options to this quote."
          action={<Button variant="primary" onClick={() => setShowCreate(true)} disabled={!quoteId}>+ Add first option</Button>}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(sorted.length, 3)}, 1fr)`, gap: 14 }}>
          {sorted.map((o) => {
            const isSelected = !!o.selected_at;
            const lineItems = parseLineItems(o.line_items_json);
            return (
              <div key={o.option_id} className="card" style={{
                padding: 18, position: "relative",
                borderTop: o.is_recommended ? "3px solid #FEC82C" : undefined,
                background: isSelected ? "linear-gradient(180deg, #F0FDF4 0%, #fff 80%)" : undefined,
              }}>
                {o.is_recommended && (
                  <div style={{ position: "absolute", top: -1, right: 12, background: "#FEC82C", color: "#1A3A4A", padding: "3px 10px", borderRadius: "0 0 6px 6px", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <Star size={10} fill="#1A3A4A" /> RECOMMENDED
                  </div>
                )}
                {isSelected && (
                  <div style={{ position: "absolute", top: -1, left: 12, background: "#059669", color: "#fff", padding: "3px 10px", borderRadius: "0 0 6px 6px", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={10} /> SELECTED
                  </div>
                )}

                <div style={{ marginTop: o.is_recommended || isSelected ? 14 : 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>{o.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#059669", fontFamily: "monospace", marginTop: 6 }}>{fmtMoney(o.total_amount)}</div>
                  {o.description && (
                    <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 10, lineHeight: 1.5 }}>{o.description}</div>
                  )}
                </div>

                {lineItems.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", marginBottom: 6 }}>Includes</div>
                    {lineItems.map((li, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: i < lineItems.length - 1 ? "1px dashed #F1F5F9" : undefined }}>
                        <span style={{ color: "#0B1C24" }}>{li.description}</span>
                        <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>{li.quantity} × {fmtMoney(li.unit_price)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!isSelected && (
                    <Button variant="primary" size="sm" onClick={() => selectOption(o)}><CheckCircle2 size={11} /> Select</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(o)}><Edit3 size={11} /> Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteOption(o)}><Trash2 size={11} color="#dc2626" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showCreate || editing) && quoteId && (
        <OptionModal
          quoteId={quoteId}
          option={editing}
          existingCount={options.length}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={(msg) => { setShowCreate(false); setEditing(null); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

function OptionModal({ quoteId, option, existingCount, onClose, onSaved, api }: {
  quoteId: string;
  option: QuoteOption | null;
  existingCount: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
}) {
  const [label, setLabel] = useState(option?.label ?? "");
  const [description, setDescription] = useState(option?.description ?? "");
  const [total, setTotal] = useState(option?.total_amount?.toString() ?? "");
  const [isRecommended, setIsRecommended] = useState(option?.is_recommended ?? false);
  const [sortOrder, setSortOrder] = useState(option?.sort_order?.toString() ?? String(existingCount));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!label.trim() || !total) { setErr("Label and price required"); return; }
    setErr(null); setSaving(true);
    try {
      const body = {
        label: label.trim(),
        description: description.trim() || null,
        total_amount: Number(total),
        is_recommended: isRecommended,
        sort_order: Number(sortOrder) || 0,
      };
      if (option) {
        await api.patch(`/quote-options/${option.option_id}`, body);
        onSaved("Option updated.");
      } else {
        await api.post(`/quote-options/by-quote/${quoteId}`, body);
        onSaved("Option added.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 460, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>{option ? "Edit option" : "Add option"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Label</span><input style={pInput} placeholder="Good / Better / Best" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus /></label>
          <label><span style={pLabel}>Description</span><textarea rows={3} style={{ ...pInput, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Total ($)</span><input type="number" min="0" step="0.01" style={pInput} value={total} onChange={(e) => setTotal(e.target.value)} /></label>
            <label><span style={pLabel}>Sort order</span><input type="number" style={pInput} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={isRecommended} onChange={(e) => setIsRecommended(e.target.checked)} />
            <Star size={12} color="#FEC82C" fill="#FEC82C" /> Mark as recommended
          </label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !label.trim() || !total}>{saving ? "Saving…" : (option ? "Save" : "Add option")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };
