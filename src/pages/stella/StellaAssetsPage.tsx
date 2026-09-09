// StellaAssetsPage — Fixed assets and depreciation. STELLA pack 2, item 8.
//
// A business that buys a $30,000 truck either put the whole thing through one
// month (wrong, and that month looks catastrophic) or left it out of its books
// entirely — because nothing here could record what a business OWNS and spread
// its cost over the years it is used. The two accounts that do that work,
// Accumulated Depreciation and Depreciation Expense, have been in the standard
// chart since day one and had never been posted to.
//
// STRAIGHT LINE ONLY, and the page says so. MACRS is the schedule an accountant
// files from and it changes with the tax code; getting it subtly wrong is worse
// than not offering it. An asset can still be RECORDED with another method —
// it is simply left out of the run, and the page says which and why.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Play } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, type Column } from "../../components/oliver/ui";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

interface Asset {
  equipment_id: string;
  name: string;
  type: string | null;
  serial: string | null;
  purchase_date: string | null;
  in_service_date: string | null;
  purchase_cost: number | null;
  salvage_value: number | null;
  useful_life_months: number | null;
  depreciation_method: string | null;
  disposed_on: string | null;
  accumulated_depreciation: number;
  monthly_depreciation: number;
  book_value: number | null;
  periods_posted: number;
  last_period_posted: string | null;
  schedule_note: string | null;
}
interface ScheduleRow { period_month: string; posted_date: string; amount: number; posted: boolean; accumulated_after: number; book_value_after: number }
interface AssetDetail extends Asset { schedule: ScheduleRow[]; entries: { depreciation_entry_id: string; period_month: string; amount: number }[] }

const label = { fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 } as const;
const input = { width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6, color: "#0B1C24", background: "#fff" } as const;
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return y && m && day ? new Date(y, m - 1, day).toLocaleDateString() : String(d).slice(0, 10);
}

export function StellaAssetsPage() {
  const { get, post, ready } = useStellaApi();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runThrough, setRunThrough] = useState(thisMonth());
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ message?: string; refused?: unknown[]; skipped?: { name: string; reason: string }[] } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setAssets(await get<Asset[]>("/ledger/assets") || []); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const totals = useMemo(() => ({
    cost: assets.reduce((s, a) => s + Number(a.purchase_cost || 0), 0),
    accumulated: assets.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0),
    book: assets.reduce((s, a) => s + Number(a.book_value || 0), 0),
  }), [assets]);

  async function runDepreciation() {
    setRunning(true); setRunResult(null); setError(null);
    try {
      const r = await post<{ message: string; refused: unknown[]; skipped: { name: string; reason: string }[] }>(
        "/ledger/assets/depreciation-run", { through: runThrough });
      setRunResult(r);
      setNotice(r.message);
      reload();
    } catch (e) { setError(e); }
    finally { setRunning(false); }
  }

  const columns: Column<Asset>[] = [
    {
      key: "name", header: "Asset", sortable: true, sortAccessor: (a) => a.name.toLowerCase(),
      render: (a) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{a.name}</div>
          <div style={{ fontSize: 10, color: "#94A3B8" }}>
            {[a.type, a.serial, a.disposed_on ? `disposed ${fmtDate(a.disposed_on)}` : null].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      ),
    },
    { key: "in_service_date", header: "In service", render: (a) => <span style={{ fontSize: 11 }}>{fmtDate(a.in_service_date || a.purchase_date)}</span> },
    { key: "purchase_cost", header: "Cost", align: "right", sortable: true, sortAccessor: (a) => Number(a.purchase_cost || 0), render: (a) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{a.purchase_cost == null ? "—" : fmtMoney(a.purchase_cost)}</span> },
    {
      key: "monthly_depreciation", header: "Per month", align: "right",
      render: (a) => a.monthly_depreciation
        ? <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(a.monthly_depreciation)}</span>
        : <span title={a.schedule_note || ""} style={{ fontSize: 11, color: "#B4531F" }}>needs details</span>,
    },
    { key: "accumulated_depreciation", header: "Written off", align: "right", render: (a) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "#5A7A8A" }}>{fmtMoney(a.accumulated_depreciation)}</span> },
    { key: "book_value", header: "Worth now", align: "right", sortable: true, sortAccessor: (a) => Number(a.book_value || 0), render: (a) => <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{a.book_value == null ? "—" : fmtMoney(a.book_value)}</span> },
  ];

  const actions = (
    <button onClick={() => setShowCreate(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: STELLA_INDIGO, background: "#fff", border: `1px solid ${STELLA_INDIGO}`, borderRadius: 6, cursor: "pointer" }}>
      <Plus size={13} /> Add an asset
    </button>
  );

  return (
    <StellaShell
      title="Assets"
      subtitle="What the business owns, and the slice of its cost that belongs to each month."
      actions={actions}
      error={error}
      loading={loading && !assets.length}
    >
      {notice && (
        <div style={{ padding: "9px 12px", marginBottom: 12, fontSize: 12, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", borderRadius: 8 }}>{notice}</div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Card title="What it all cost" value={fmtMoney(totals.cost)} note="Everything on this page, at what you paid" />
        <Card title="Written off so far" value={fmtMoney(totals.accumulated)} note="Posted to your books, month by month" />
        <Card title="Worth on your books" value={fmtMoney(totals.book)} note="Cost less what has actually been posted" strong />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={label}>Bring depreciation up to</label>
            <input type="month" value={runThrough} onChange={(e) => setRunThrough(e.target.value)} style={{ ...input, width: 160 }} />
          </div>
          <IadmButton variant="accent" product="stella" onClick={runDepreciation} disabled={running || !assets.length} icon={<Play size={12} />}>
            {running ? "Posting…" : "Post depreciation"}
          </IadmButton>
          <div style={{ fontSize: 11, color: "#5A7A8A", flex: "1 1 300px", lineHeight: 1.5 }}>
            Posts every month that is due and skips every month already posted, so pressing it
            twice changes nothing. A closed month is refused and named rather than quietly missed.
          </div>
        </div>
        {runResult && Array.isArray(runResult.skipped) && runResult.skipped.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#B4531F" }}>
            {runResult.skipped.map((s, i) => <div key={i}>· {s.name}: {s.reason}</div>)}
          </div>
        )}
        {runResult && Array.isArray(runResult.refused) && runResult.refused.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#991B1B" }}>
            {runResult.refused.length} month(s) fell inside a closed period and were not posted. Reopen the
            month under Settings → Period Close if you meant to.
          </div>
        )}
      </div>

      {!assets.length && !loading ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Add a vehicle, a machine or a tool that will last more than a year. Tell us what it cost, when it went into service and how long you expect to use it, and its cost is spread across those months instead of landing in one."
        />
      ) : (
        <DataTable
          rows={assets}
          columns={columns}
          rowKey={(a) => a.equipment_id}
          onRowClick={async (a) => { try { setDetail(await get<AssetDetail>(`/ledger/assets/${a.equipment_id}`)); } catch (e) { setError(e); } }}
          emptyMessage="No assets recorded."
        />
      )}

      {showCreate && (
        <AssetForm onClose={() => setShowCreate(false)} post={post}
          onSaved={(msg) => { setShowCreate(false); setNotice(msg); reload(); }} />
      )}
      {detail && <AssetDetailModal asset={detail} onClose={() => setDetail(null)} />}
    </StellaShell>
  );
}

function Card({ title, value, note, strong }: { title: string; value: string; note: string; strong?: boolean }) {
  return (
    <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "#5A7A8A" }}>{title}</div>
      <div style={{ fontSize: strong ? 24 : 20, fontWeight: 700, color: "#0B1C24", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#94A3B8" }}>{note}</div>
    </div>
  );
}

function AssetForm({ onClose, onSaved, post }: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  post: <T>(path: string, body?: unknown) => Promise<T>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("vehicle");
  const [serial, setSerial] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [inService, setInService] = useState(today());
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("0");
  const [life, setLife] = useState("60");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const monthly = Number(cost) && Number(life) ? (Number(cost) - Number(salvage || 0)) / Number(life) : 0;

  async function save() {
    setSaving(true); setErr(null);
    try {
      await post("/ledger/assets", {
        name, type, serial: serial || null,
        purchase_date: purchaseDate, in_service_date: inService,
        purchase_cost: Number(cost) || null,
        salvage_value: Number(salvage) || 0,
        useful_life_months: Number(life) || null,
        depreciation_method: "straight_line",
      });
      onSaved(`${name} added. Its cost is spread over ${life} months from ${fmtDate(inService)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that asset.");
    } finally { setSaving(false); }
  }

  return (
    <IadmModal
      open onClose={onClose} product="stella"
      eyebrow="Fixed assets" title="Add an asset"
      subtitle="Something the business owns and will use for more than a year."
      size="info"
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#5A7A8A" }}>
            {monthly > 0 ? <>About <strong>{fmtMoney(monthly)}</strong> a month</> : "Fill in the cost and the life to see the monthly figure"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
            <IadmButton variant="accent" product="stella" onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Add it"}</IadmButton>
          </div>
        </div>
      }
    >
      {err && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={label}>What is it</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="2024 F-250" />
        </div>
        <div>
          <label style={label}>Kind</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
            <option value="vehicle">Vehicle</option>
            <option value="machine">Machine</option>
            <option value="tool">Tool</option>
            <option value="equipment">Other equipment</option>
          </select>
        </div>
        <div>
          <label style={label}>Serial / VIN</label>
          <input value={serial} onChange={(e) => setSerial(e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>Bought on</label>
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>Started using it</label>
          <input type="date" value={inService} onChange={(e) => setInService(e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>What it cost</label>
          <input value={cost} inputMode="decimal" onChange={(e) => setCost(e.target.value)} style={{ ...input, textAlign: "right" }} placeholder="0.00" />
        </div>
        <div>
          <label style={label}>Worth at the end</label>
          <input value={salvage} inputMode="decimal" onChange={(e) => setSalvage(e.target.value)} style={{ ...input, textAlign: "right" }} />
        </div>
        <div>
          <label style={label}>Months you will use it</label>
          <input value={life} inputMode="numeric" onChange={(e) => setLife(e.target.value)} style={{ ...input, textAlign: "right" }} />
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 11, color: "#5A7A8A", lineHeight: 1.6 }}>
        STELLA spreads the cost evenly across those months — straight line. If your accountant
        depreciates this on a tax schedule instead, record it here for the register and keep filing
        from their figures; the monthly posting is a bookkeeping estimate, not a tax return.
      </div>
    </IadmModal>
  );
}

function AssetDetailModal({ asset, onClose }: { asset: AssetDetail; onClose: () => void }) {
  return (
    <IadmModal
      open onClose={onClose} product="stella"
      eyebrow={asset.type || "Asset"} title={asset.name}
      subtitle={`In service ${fmtDate(asset.in_service_date || asset.purchase_date)}${asset.disposed_on ? ` · disposed of ${fmtDate(asset.disposed_on)}` : ""}`}
      size="info"
      footer={<div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}><IadmButton variant="ghost" onClick={onClose}>Close</IadmButton></div>}
    >
      <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
        <Fig label="Cost" value={asset.purchase_cost == null ? "—" : fmtMoney(asset.purchase_cost)} />
        <Fig label="Written off" value={fmtMoney(asset.accumulated_depreciation)} />
        <Fig label="Worth now" value={asset.book_value == null ? "—" : fmtMoney(asset.book_value)} strong />
        <Fig label="Months posted" value={`${asset.periods_posted}${asset.useful_life_months ? ` of ${asset.useful_life_months}` : ""}`} />
      </div>
      {asset.schedule_note && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA", borderRadius: 8 }}>
          {asset.schedule_note}
        </div>
      )}
      {asset.schedule.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0B1C24", marginBottom: 6 }}>Month by month</div>
          <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #F1F5F9", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: "#5A7A8A" }}>Month</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 10, color: "#5A7A8A" }}>Amount</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 10, color: "#5A7A8A" }}>Worth after</th>
                  <th style={{ textAlign: "center", padding: "6px 10px", fontSize: 10, color: "#5A7A8A" }}>Posted</th>
                </tr>
              </thead>
              <tbody>
                {asset.schedule.map((s) => (
                  <tr key={s.period_month} style={{ borderTop: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "5px 10px", fontSize: 12 }}>{s.period_month}</td>
                    <td style={{ padding: "5px 10px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(s.amount)}</td>
                    <td style={{ padding: "5px 10px", fontSize: 12, textAlign: "right", color: "#5A7A8A", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(s.book_value_after)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "center", fontSize: 11, color: s.posted ? "#047857" : "#94A3B8" }}>{s.posted ? "yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </IadmModal>
  );
}

function Fig({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#94A3B8" }}>{l}</div>
      <div style={{ fontSize: strong ? 18 : 15, fontWeight: strong ? 700 : 600, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

export default StellaAssetsPage;
