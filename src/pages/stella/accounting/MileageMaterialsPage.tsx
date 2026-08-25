// MileageMaterialsPage — replaces the two-tab P3 scaffold in
// StellaLedgerShellPages that has been saying "Data lands P3" since July.
//
// Both tabs write real rows AND post to the ledger, so the deduction and the
// job cost actually appear in the P&L. A mileage form that never reaches a
// report is a form, not a feature.
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Car, Package } from "lucide-react";
import { StellaShell, StellaTabs, STELLA_INDIGO, fmtMoney } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal,
} from "../dbmanager/DbManagerKit";

type Mileage = {
  mileage_entry_id: string; trip_date: string; miles: number; purpose: string | null;
  deduction_rate: number; deduction_amount: number; entry_source: string; job_number?: string | null;
};
type Material = {
  materials_log_id: string; log_date: string; description: string | null;
  quantity: number; unit_cost: number; total_cost: number; supplier_name: string | null; job_number?: string | null;
};

export function StellaMileageMaterialsPage() {
  const [tab, setTab] = useState("mileage");
  return (
    <StellaShell
      title="Mileage & Materials"
      subtitle="Job-cost capture — business miles at the IRS rate, and materials that feed per-job margin."
    >
      <StellaTabs
        tabs={[{ key: "mileage", label: "Mileage" }, { key: "materials", label: "Materials" }]}
        active={tab} onChange={setTab}
      />
      {tab === "mileage" ? <MileageTab /> : <MaterialsTab />}
    </StellaShell>
  );
}

function MileageTab() {
  const api = useStellaApi();
  const [rows, setRows] = useState<Mileage[] | null>(null);
  const [meta, setMeta] = useState<{ totals: { miles: number; deduction: number }; current_rate: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ trip_date: new Date().toISOString().slice(0, 10), miles: "", purpose: "" });

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Mileage[]; meta: typeof meta }>("/ledger/mileage")
      .then((r) => { setRows(r.data); setMeta(r.meta); }).catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ deduction_amount: number; deduction_rate: number }>("/ledger/mileage", {
        trip_date: form.trip_date, miles: Number(form.miles), purpose: form.purpose.trim() || null,
      });
      showNotice(`Logged — ${fmtMoney(r.deduction_amount)} deduction at ${r.deduction_rate}/mile.`);
      setAdding(false); setForm({ trip_date: new Date().toISOString().slice(0, 10), miles: "", purpose: "" });
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function remove(m: Mileage) {
    if (!window.confirm("Delete this trip? Its deduction will come out of your P&L too.")) return;
    setBusy(true);
    try { await api.del(`/ledger/mileage/${m.mileage_entry_id}`); showNotice("Trip deleted."); load(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <>
      <DbNotice text={notice} />
      <DbError error={error} />
      <DbCard
        title="Business trips"
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {meta && <span style={{ fontSize: 11, color: "#5A7A8A" }}>
              {meta.totals.miles.toLocaleString()} miles · {fmtMoney(meta.totals.deduction)} deduction · IRS rate {meta.current_rate}/mile
            </span>}
            <DbButton onClick={() => setAdding(true)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Log a trip</span>
            </DbButton>
          </div>
        }
      >
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
          STELLA applies the IRS standard rate for the year of the trip and books the deduction straight into your
          P&amp;L — no cash leaves your bank, so it credits owner's equity.
        </div>
        {!rows ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "trip_date", label: "Date", type: "date" },
              { key: "miles", label: "Miles", type: "decimal" },
              { key: "purpose", label: "Purpose" },
              { key: "deduction_rate", label: "Rate" },
              { key: "deduction_amount", label: "Deduction", type: "decimal" },
              { key: "action", label: "" },
            ]}
            rows={rows.map((m) => ({
              ...m,
              deduction_rate: <span style={{ fontVariantNumeric: "tabular-nums" }}>{m.deduction_rate}</span>,
              action: <DbButton variant="danger" onClick={() => remove(m)} disabled={busy}><Trash2 size={12} /></DbButton>,
            })) as never}
            empty={<DbEmpty title="No trips logged" reason="Every business mile is a deduction — log them as you go and STELLA does the maths." />}
          />
        )}
      </DbCard>

      {adding && (
        <DbModal title="Log a trip" onClose={() => setAdding(false)} width={420}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Date"><DbInput type="date" value={form.trip_date} onChange={(e) => setForm({ ...form, trip_date: e.target.value })} /></DbField>
            <DbField label="Miles" hint={meta ? `Deduction at ${meta.current_rate}/mile` : undefined}>
              <DbInput inputMode="decimal" autoFocus value={form.miles} onChange={(e) => setForm({ ...form, miles: e.target.value })} />
            </DbField>
            <DbField label="Purpose" hint="What was the trip for? Keep it specific — this is your audit trail.">
              <DbInput value={form.purpose} maxLength={400} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </DbField>
            {Number(form.miles) > 0 && meta && (
              <div style={{ fontSize: 12, color: STELLA_INDIGO, fontWeight: 600 }}>
                <Car size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                Deduction: {fmtMoney(Number(form.miles) * meta.current_rate)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={add} disabled={busy || !(Number(form.miles) > 0)}>{busy ? "Saving…" : "Log it"}</DbButton>
              <DbButton variant="ghost" onClick={() => setAdding(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </>
  );
}

function MaterialsTab() {
  const api = useStellaApi();
  const [rows, setRows] = useState<Material[] | null>(null);
  const [meta, setMeta] = useState<{ total_cost: number; count: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ log_date: new Date().toISOString().slice(0, 10), description: "", quantity: "1", unit_cost: "" });

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Material[]; meta: typeof meta }>("/ledger/materials")
      .then((r) => { setRows(r.data); setMeta(r.meta); }).catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ total_cost: number }>("/ledger/materials", {
        log_date: form.log_date, description: form.description.trim() || null,
        quantity: Number(form.quantity), unit_cost: Number(form.unit_cost),
      });
      showNotice(`Logged — ${fmtMoney(r.total_cost)} of job materials.`);
      setAdding(false); setForm({ log_date: new Date().toISOString().slice(0, 10), description: "", quantity: "1", unit_cost: "" });
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function remove(m: Material) {
    if (!window.confirm("Delete this materials line? Its cost will come out of your P&L too.")) return;
    setBusy(true);
    try { await api.del(`/ledger/materials/${m.materials_log_id}`); showNotice("Line deleted."); load(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  const preview = Number(form.quantity) * Number(form.unit_cost);

  return (
    <>
      <DbNotice text={notice} />
      <DbError error={error} />
      <DbCard
        title="Job materials"
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {meta && <span style={{ fontSize: 11, color: "#5A7A8A" }}>{meta.count} lines · {fmtMoney(meta.total_cost)}</span>}
            <DbButton onClick={() => setAdding(true)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Add materials</span>
            </DbButton>
          </div>
        }
      >
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
          Materials bought for a job. These post to Job Materials in your P&amp;L and feed per-job margin in Unit Economics.
        </div>
        {!rows ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "log_date", label: "Date", type: "date" },
              { key: "description", label: "What" },
              { key: "supplier_name", label: "Supplier" },
              { key: "quantity", label: "Qty", type: "decimal" },
              { key: "unit_cost", label: "Unit", type: "decimal" },
              { key: "total_cost", label: "Total", type: "decimal" },
              { key: "action", label: "" },
            ]}
            rows={rows.map((m) => ({
              ...m,
              action: <DbButton variant="danger" onClick={() => remove(m)} disabled={busy}><Trash2 size={12} /></DbButton>,
            })) as never}
            empty={<DbEmpty title="No materials logged" reason="Add what you bought for a job and it flows into that job's margin." />}
          />
        )}
      </DbCard>

      {adding && (
        <DbModal title="Add materials" onClose={() => setAdding(false)} width={460}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Date"><DbInput type="date" value={form.log_date} onChange={(e) => setForm({ ...form, log_date: e.target.value })} /></DbField>
            <DbField label="What did you buy?">
              <DbInput autoFocus value={form.description} maxLength={400} placeholder="e.g. Mulch, 40 bags"
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </DbField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DbField label="Quantity"><DbInput inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></DbField>
              <DbField label="Unit cost"><DbInput inputMode="decimal" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></DbField>
            </div>
            {preview > 0 && (
              <div style={{ fontSize: 12, color: STELLA_INDIGO, fontWeight: 600 }}>
                <Package size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                Total: {fmtMoney(preview)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={add} disabled={busy || !(preview >= 0) || !form.unit_cost || !(Number(form.quantity) > 0)}>
                {busy ? "Saving…" : "Add"}
              </DbButton>
              <DbButton variant="ghost" onClick={() => setAdding(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </>
  );
}
