// StellaSalesTaxPage — Settings → Sales tax. STELLA pack 2, item 9 (S-5a).
//
// Two things a business has to tell us before a sales-tax return can exist:
// the RATES it charges, and WHICH of the things it sells are taxable. Neither
// existed anywhere in the product; the old Sales Tax report read one number off
// each paid invoice and could not produce a filing.
//
// THE HONEST BIT, said on the page and not only in a code comment: these rates
// are typed in and kept current by the business. Automatic rate updates need a
// paid tax-data service, and that is a 2027 decision. Nothing here watches for
// a rate change, and pretending otherwise is how somebody files last year's
// percentage.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { EmptyState } from "../../components/oliver/ui";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

interface TaxRate {
  tax_rate_id: string;
  name: string;
  jurisdiction: string;
  rate_percent: number;
  filing_frequency: string | null;
  is_active: boolean;
  is_default: boolean;
  used_on_invoices: number;
  liability_name?: string | null;
}
interface Offering { offering_id: string; name: string; is_active: boolean; is_taxable: boolean }

const label = { fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 } as const;
const input = { width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6, color: "#0B1C24", background: "#fff" } as const;

export function StellaSalesTaxPage() {
  const { get, post, patch, del, ready } = useStellaApi();
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, o] = await Promise.all([
        get<TaxRate[]>("/ledger/tax-rates"),
        get<Offering[]>("/ledger/taxable-offerings"),
      ]);
      setRates(r || []);
      setOfferings(o || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const taxableCount = useMemo(() => offerings.filter((o) => o.is_taxable).length, [offerings]);

  async function toggleOffering(o: Offering) {
    try {
      await patch(`/ledger/taxable-offerings/${o.offering_id}`, { is_taxable: !o.is_taxable });
      setOfferings((list) => list.map((x) => (x.offering_id === o.offering_id ? { ...x, is_taxable: !x.is_taxable } : x)));
      setNotice(`${o.name} is now ${o.is_taxable ? "not taxable" : "taxable"}. Invoices already raised keep the tax they were charged.`);
    } catch (e) { setError(e); }
  }

  async function toggleRate(r: TaxRate) {
    try {
      await patch(`/ledger/tax-rates/${r.tax_rate_id}`, { is_active: !r.is_active });
      reload();
    } catch (e) { setError(e); }
  }

  async function removeRate(r: TaxRate) {
    try {
      await del(`/ledger/tax-rates/${r.tax_rate_id}`);
      setNotice(`${r.name} removed.`);
      reload();
    } catch (e) { setError(e); }
  }

  const actions = (
    <button onClick={() => setShowAdd(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: STELLA_INDIGO, background: "#fff", border: `1px solid ${STELLA_INDIGO}`, borderRadius: 6, cursor: "pointer" }}>
      <Plus size={13} /> Add a rate
    </button>
  );

  return (
    <StellaShell
      title="Sales tax"
      subtitle="The rates you charge, and what you charge them on."
      actions={actions}
      error={error}
      loading={loading && !rates.length}
    >
      {notice && <div style={{ padding: "9px 12px", marginBottom: 12, fontSize: 12, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", borderRadius: 8 }}>{notice}</div>}

      <div style={{ padding: "11px 14px", marginBottom: 16, fontSize: 12, color: "#475569", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, lineHeight: 1.6 }}>
        <strong>You keep these rates current.</strong> STELLA does not watch for rate changes —
        automatic updates need a paid tax-data service and that is a decision for 2027. What is here
        is enough to charge the right tax, record what you collected per jurisdiction, and produce
        the figure you file: <strong>Reports → Sales Tax</strong>.
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24", marginBottom: 8 }}>Rates</div>
      {!rates.length ? (
        <EmptyState
          title="No rates yet"
          description="Add the rate you charge and the place you file it to. Most service businesses have one; a business selling across a county line may have two."
        />
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, color: "#5A7A8A" }}>Rate</th>
                <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, color: "#5A7A8A" }}>You file it to</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, color: "#5A7A8A" }}>Percent</th>
                <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10, color: "#5A7A8A" }}>How often</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, color: "#5A7A8A" }}>Used on</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10, color: "#5A7A8A" }} />
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.tax_rate_id} style={{ borderTop: "1px solid #F1F5F9", opacity: r.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
                    {r.name}
                    {!r.is_active && <span style={{ marginLeft: 8, fontSize: 10, color: "#94A3B8" }}>switched off</span>}
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#334155" }}>{r.jurisdiction}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(r.rate_percent).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#5A7A8A" }}>{r.filing_frequency || "—"}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", color: "#5A7A8A" }}>{r.used_on_invoices} invoice(s)</td>
                  <td style={{ padding: "9px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => toggleRate(r)} style={{ fontSize: 11, color: STELLA_INDIGO, background: "none", border: "none", cursor: "pointer", marginRight: 10 }}>
                      {r.is_active ? "switch off" : "switch on"}
                    </button>
                    {r.used_on_invoices === 0 && (
                      <button onClick={() => removeRate(r)} style={{ fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}>remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24", marginBottom: 4 }}>What you charge tax on</div>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 10 }}>
        Nothing is taxable until you say so. In most states labour is not taxed and parts and
        materials are — your accountant will know which of yours are. {taxableCount} of {offerings.length} marked taxable.
      </div>
      {!offerings.length ? (
        <EmptyState
          title="Nothing to sell yet"
          description="Once you have services set up, each one can be marked taxable or not, and an invoice works its tax out from the taxable lines only."
        />
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, overflow: "hidden" }}>
          {offerings.map((o) => (
            <label key={o.offering_id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: "1px solid #F1F5F9", cursor: "pointer", opacity: o.is_active ? 1 : 0.6 }}>
              <input type="checkbox" checked={o.is_taxable} onChange={() => toggleOffering(o)} />
              <span style={{ fontSize: 12, color: "#0B1C24", fontWeight: o.is_taxable ? 600 : 400 }}>{o.name}</span>
              {!o.is_active && <span style={{ fontSize: 10, color: "#94A3B8" }}>(not offered right now)</span>}
            </label>
          ))}
        </div>
      )}

      {showAdd && <RateForm post={post} onClose={() => setShowAdd(false)} onSaved={(msg) => { setShowAdd(false); setNotice(msg); reload(); }} />}
    </StellaShell>
  );
}

function RateForm({ post, onClose, onSaved }: {
  post: <T>(p: string, b?: unknown) => Promise<T>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [percent, setPercent] = useState("");
  const [freq, setFreq] = useState("quarterly");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <IadmModal
      open onClose={onClose} product="stella"
      eyebrow="Sales tax" title="Add a rate"
      subtitle="What you charge, and who you hand it to."
      size="confirm"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton variant="accent" product="stella" disabled={saving || !name.trim() || !jurisdiction.trim() || !percent} onClick={async () => {
            setSaving(true); setErr(null);
            try {
              await post("/ledger/tax-rates", {
                name, jurisdiction, rate_percent: Number(percent), filing_frequency: freq,
              });
              onSaved(`${name} added at ${percent}%.`);
            } catch (e) { setErr(e instanceof Error ? e.message : "Could not add that rate."); }
            finally { setSaving(false); }
          }}>{saving ? "Adding…" : "Add it"}</IadmButton>
        </div>
      }
    >
      {err && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>}
      <label style={label}>Call it</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, marginBottom: 12 }} placeholder="Ohio state + Franklin County" />
      <label style={label}>You file it to</label>
      <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={{ ...input, marginBottom: 12 }} placeholder="OH — Franklin" />
      <label style={label}>Percent</label>
      <input value={percent} inputMode="decimal" onChange={(e) => setPercent(e.target.value)} style={{ ...input, marginBottom: 12 }} placeholder="7.5" />
      <label style={label}>How often you file</label>
      <select value={freq} onChange={(e) => setFreq(e.target.value)} style={input}>
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly</option>
        <option value="annual">Once a year</option>
      </select>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 12, lineHeight: 1.6 }}>
        Tax you collect is money you are holding for the state, so it lands on your Balance Sheet as
        something you owe rather than in your income.
      </div>
    </IadmModal>
  );
}

export default StellaSalesTaxPage;
