// StellaVendorsPage — Ledger → Vendors & Customers.
//
// Counterparties: vendors, subcontractors, customers, and employees, with
// W-9 / 1099 / TIN tracking. Customers resolve from lumen.contact. Reads
// GET /ledger/vendors on stella-api (over stella.counterparty).
//
// Walkthrough items 10/11 (Brandon, 2026-08-13): "Add vendor or customer"
// creates via POST /ledger/vendors; row click opens the Counterparty 360
// modal (IadmModal "info", the TransactionDetailModal chrome) — editable
// fields PATCH /ledger/vendors/:id, totals + recent activity come from
// GET /ledger/vendors/:id/summary.
//
// NOTE — type values are the stella.counterparty column values (migration
// 154): 'vendor' | 'sub' | 'customer' | 'employee'. The UI label for 'sub'
// is "Subcontractor"; an earlier pass keyed the pills on 'subcontractor',
// which matched nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, FilterBar, type Column } from "../../components/oliver/ui";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

// Field names match the API payload (stella.counterparty columns) — the
// exhaustive UI test caught this page reading a nonexistent `name`/`kind`.
interface Counterparty {
  counterparty_id: string;
  display_name: string;
  type: string | null; // vendor | sub | customer | employee
  w9_on_file: boolean | null;
  is_1099: boolean | null;
  tin: string | null;
  email: string | null;
  phone: string | null;
  source?: string | null;
}

const KIND_PILL: Record<string, { bg: string; color: string; label: string }> = {
  vendor: { bg: "#E0E7FF", color: "#3730A3", label: "Vendor" },
  customer: { bg: "#D1FAE5", color: "#047857", label: "Customer" },
  sub: { bg: "#FEF3C7", color: "#92400E", label: "Subcontractor" },
  employee: { bg: "#F3E8FF", color: "#6B21A8", label: "Employee" },
};

const TYPE_OPTIONS = [
  { value: "vendor", label: "Vendor" },
  { value: "sub", label: "Subcontractor" },
  { value: "customer", label: "Customer" },
  { value: "employee", label: "Employee" },
];

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "vendor", label: "Vendors" },
  { key: "customer", label: "Customers" },
  { key: "sub", label: "Subcontractors" },
  { key: "employee", label: "Employees" },
];

function TypePill({ type }: { type: string | null }) {
  const p = KIND_PILL[type || "vendor"] || KIND_PILL.vendor;
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
      {p.label}
    </span>
  );
}

export function StellaVendorsPage() {
  const { get, ready } = useStellaApi();
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Counterparty | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<Counterparty[]>("/ledger/vendors");
      setRows(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== "all") out = out.filter((r) => (r.type || "vendor") === filter);
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => (r.display_name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q));
    return out;
  }, [rows, filter, search]);

  const columns: Column<Counterparty>[] = [
    {
      key: "display_name",
      header: "Name",
      sortable: true,
      sortAccessor: (r) => (r.display_name || "").toLowerCase(),
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.display_name}</div>
          {r.email && <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.email}</div>}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => <TypePill type={r.type} />,
    },
    {
      key: "w9_on_file",
      header: "W-9",
      align: "center",
      render: (r) =>
        r.w9_on_file ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#047857" }}>On file</span>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>
        ),
    },
    {
      key: "is_1099",
      header: "1099",
      align: "center",
      render: (r) =>
        r.is_1099 ? (
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700 }}>
            1099
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>
        ),
    },
    {
      key: "tin",
      header: "TIN",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A", fontVariantNumeric: "tabular-nums" }}>{r.tin ? `•••••${String(r.tin).slice(-4)}` : "—"}</span>,
    },
  ];

  const addButton = (
    <button
      onClick={() => setShowCreate(true)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 13px",
        fontSize: 12,
        fontWeight: 600,
        color: STELLA_INDIGO,
        background: "#fff",
        border: `1px solid ${STELLA_INDIGO}`,
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      <Plus size={13} /> Add vendor or customer
    </button>
  );

  return (
    <StellaShell
      title="Vendors & Customers"
      subtitle="Everyone you pay and everyone who pays you — with W-9, 1099, and TIN tracking."
      showRecord
      actions={addButton}
      error={error}
      loading={loading && !rows.length}
    >
      {!rows.length && !loading ? (
        <EmptyState
          title="No counterparties yet"
          description="Add your first vendor or customer with the button above. Vendors and subcontractors are also created as you categorize spend; customers resolve from your contacts."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name or email…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.counterparty_id}
            onRowClick={(r) => setDetail(r)}
            emptyMessage="No counterparties match these filters."
          />
        </>
      )}

      {showCreate && (
        <AddCounterpartyModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
      {detail && (
        <CounterpartyDetailModal
          counterparty={detail}
          onClose={(changed) => {
            setDetail(null);
            if (changed) reload();
          }}
        />
      )}
    </StellaShell>
  );
}

// ── Add vendor or customer (create modal) ────────────────────────────────────
// Mirrors the RecordTransactionModal chrome — small centered card, house
// field styles. POSTs /ledger/vendors.
function AddCounterpartyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { post } = useStellaApi();
  const [name, setName] = useState("");
  const [type, setType] = useState("vendor");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [w9, setW9] = useState(false);
  const [is1099, setIs1099] = useState(false);
  const [tin, setTin] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim().length > 0;

  async function submit() {
    if (!valid || saving) return;
    setErr(null);
    setSaving(true);
    try {
      await post("/ledger/vendors", {
        display_name: name.trim(),
        type,
        email: email.trim() || null,
        phone: phone.trim() || null,
        w9_on_file: w9,
        is_1099: is1099,
        tin: tin.trim() || null,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add the counterparty. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 460, maxWidth: "calc(100vw - 32px)", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${STELLA_LAVENDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>Add vendor or customer</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label>
            <span style={mLabel}>Name</span>
            <input style={mInput} placeholder="e.g. SiteOne Landscape Supply" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            <span style={mLabel}>Type</span>
            <select style={mInput} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <span style={mLabel}>Email</span>
              <input type="email" style={mInput} placeholder="Optional" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              <span style={mLabel}>Phone</span>
              <input style={mInput} placeholder="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={w9} onChange={(e) => setW9(e.target.checked)} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>W-9 on file</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={is1099} onChange={(e) => setIs1099(e.target.checked)} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>1099 contractor</span>
            </label>
          </div>
          <label>
            <span style={mLabel}>TIN</span>
            <input style={mInput} placeholder="Optional — EIN or SSN for 1099 filing" value={tin} onChange={(e) => setTin(e.target.value)} />
          </label>
          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} disabled={saving} style={ghostBtn}>Cancel</button>
            <button
              onClick={submit}
              disabled={saving || !valid}
              style={{ ...ghostBtn, background: STELLA_INDIGO, color: "#fff", border: `1px solid ${STELLA_INDIGO}`, opacity: saving || !valid ? 0.6 : 1 }}
            >
              {saving ? "Adding…" : "Add counterparty"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Counterparty 360 (detail modal) ──────────────────────────────────────────

/** GET /ledger/vendors/:id/summary payload (after the {data} unwrap). */
interface CounterpartySummary {
  counterparty: Counterparty;
  totals: { ytd_paid: number; ytd_received: number; txn_count: number };
  recent: RecentTxn[];
}

interface RecentTxn {
  transaction_id: string;
  posted_date: string | null;
  amount_signed: number | string;
  coa_code: string | null;
  coa_account_name: string | null;
}

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

/** The editable slice of a counterparty — dirty checks compare against this. */
function editableOf(c: Counterparty) {
  return {
    display_name: c.display_name || "",
    type: c.type || "vendor",
    email: c.email || "",
    phone: c.phone || "",
    w9_on_file: !!c.w9_on_file,
    is_1099: !!c.is_1099,
    tin: c.tin || "",
  };
}

// Counterparty 360 — row-click detail in the IadmModal standard ("info" size,
// STELLA accent; the TransactionDetailModal chrome). Editable fields PATCH
// /ledger/vendors/:id; totals + recent activity from /vendors/:id/summary.
// Save stays in the modal and flips to "Saved ✓" when clean (the house
// saved-state lesson from the transaction modal walkthrough).
function CounterpartyDetailModal({
  counterparty,
  onClose,
}: {
  counterparty: Counterparty;
  onClose: (changed: boolean) => void;
}) {
  const { get, patch, ready } = useStellaApi();
  const id = counterparty.counterparty_id;

  const [summary, setSummary] = useState<CounterpartySummary | null>(null);
  const [summaryErr, setSummaryErr] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<CounterpartySummary>(`/ledger/vendors/${id}/summary`)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setSummaryErr(true); });
    return () => { cancelled = true; };
  }, [get, ready, id]);

  // Editable state, seeded from the row; `base` is the last-saved snapshot.
  const [base, setBase] = useState(() => editableOf(counterparty));
  const [form, setForm] = useState(() => editableOf(counterparty));
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const changedRef = useRef(false);

  const edit = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSavedNote(null);
  };

  const dirty = (Object.keys(base) as (keyof typeof base)[]).some((k) => base[k] !== form[k]);
  const nameValid = form.display_name.trim().length > 0;

  const close = () => onClose(changedRef.current);

  async function save() {
    if (!dirty || !nameValid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await patch(`/ledger/vendors/${id}`, {
        display_name: form.display_name.trim(),
        type: form.type,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        w9_on_file: form.w9_on_file,
        is_1099: form.is_1099,
        tin: form.tin.trim() || null,
      });
      changedRef.current = true;
      setBase({ ...form });
      setSavedNote("Changes saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const is1099Kind = form.type === "vendor" || form.type === "sub";
  const totals = summary?.totals;
  const typeLabel = (KIND_PILL[base.type] || KIND_PILL.vendor).label;

  return (
    <IadmModal
      open
      onClose={close}
      product="stella"
      size="info"
      title={base.display_name}
      subtitle={`${typeLabel}${base.email ? ` · ${base.email}` : ""}`}
      footer={
        <>
          <IadmButton variant="primary" onClick={close} disabled={busy}>Close</IadmButton>
          <IadmButton variant="accent" product="stella" onClick={save} disabled={busy || !dirty || !nameValid}>
            {busy ? "Saving…" : !dirty && savedNote ? "Saved ✓" : "Save changes"}
          </IadmButton>
        </>
      }
    >
      <div style={{ padding: "20px 24px", display: "grid", gap: 16, maxWidth: 760 }}>
        {/* Headline strip — type pill + source */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <TypePill type={form.type} />
            {form.is_1099 && (
              <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 700 }}>
                1099
              </span>
            )}
          </div>
          {counterparty.source && (
            <span style={{ fontSize: 11, color: "#94A3B8", textTransform: "capitalize" }}>Source: {counterparty.source}</span>
          )}
        </div>

        {/* Totals tiles — YTD received / YTD paid / transactions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { label: "YTD received", value: totals ? fmtMoney(totals.ytd_received) : "…", color: totals && totals.ytd_received > 0 ? "#047857" : "#0B1C24" },
            { label: "YTD paid", value: totals ? fmtMoney(totals.ytd_paid) : "…", color: "#0B1C24" },
            { label: "Transactions", value: totals ? String(totals.txn_count) : "…", color: "#0B1C24" },
          ].map((t) => (
            <div key={t.label} style={{ border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{t.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: t.color, fontVariantNumeric: "tabular-nums" }}>{t.value}</div>
            </div>
          ))}
        </div>
        {summaryErr && (
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Totals and recent activity could not be loaded.</div>
        )}

        {/* Editable fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label>
            <span style={fLabel}>Name</span>
            <input style={fInput} value={form.display_name} onChange={(e) => edit("display_name", e.target.value)} />
          </label>
          <label>
            <span style={fLabel}>Type</span>
            <select style={fInput} value={form.type} onChange={(e) => edit("type", e.target.value)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={fLabel}>Email</span>
            <input type="email" style={fInput} placeholder="—" value={form.email} onChange={(e) => edit("email", e.target.value)} />
          </label>
          <label>
            <span style={fLabel}>Phone</span>
            <input style={fInput} placeholder="—" value={form.phone} onChange={(e) => edit("phone", e.target.value)} />
          </label>
          <label>
            <span style={fLabel}>TIN</span>
            <input style={fInput} placeholder="EIN or SSN for 1099 filing" value={form.tin} onChange={(e) => edit("tin", e.target.value)} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18, paddingBottom: 7 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
              <input type="checkbox" checked={form.w9_on_file} onChange={(e) => edit("w9_on_file", e.target.checked)} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>W-9 on file</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_1099} onChange={(e) => edit("is_1099", e.target.checked)} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>1099 contractor</span>
            </label>
          </div>
        </div>

        {/* 1099 status strip — vendors and subcontractors only */}
        {is1099Kind && (
          <div
            style={{
              border: `1px solid ${form.is_1099 ? (form.w9_on_file && form.tin.trim() ? "#A7F3D0" : "#FDE68A") : STELLA_LAVENDER}`,
              background: form.is_1099 ? (form.w9_on_file && form.tin.trim() ? "#ECFDF5" : "#FFFBEB") : "#fff",
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: form.is_1099 ? (form.w9_on_file && form.tin.trim() ? "#047857" : "#92400E") : "#0B1C24" }}>
              {form.is_1099
                ? form.w9_on_file && form.tin.trim()
                  ? "1099 ready — W-9 and TIN on file for year-end 1099-NEC filing."
                  : `1099 contractor — still missing ${[!form.w9_on_file && "a W-9", !form.tin.trim() && "a TIN"].filter(Boolean).join(" and ")}. Collect before year-end filing.`
                : "Not flagged for 1099."}
            </div>
            {!form.is_1099 && (
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2, lineHeight: 1.45 }}>
                Flag as a 1099 contractor if you pay them $600+ per year for services — they'll appear in the year-end 1099 report.
              </div>
            )}
          </div>
        )}

        {/* Recent transactions */}
        <div>
          <div style={{ ...fLabel, marginBottom: 8 }}>Recent transactions</div>
          {!summary && !summaryErr ? (
            <div style={{ fontSize: 12, color: "#5A7A8A" }}>Loading…</div>
          ) : !summary?.recent?.length ? (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>No transactions with this counterparty yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Account", "Date", "Amount"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 2 ? "right" : "left",
                        padding: "6px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#5A7A8A",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        borderBottom: `1px solid ${STELLA_LAVENDER}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((t) => {
                  const amt = toNum(t.amount_signed);
                  return (
                    <tr key={t.transaction_id}>
                      <td style={{ padding: "7px 8px", color: "#0B1C24", borderBottom: "1px solid #F1F5F9" }}>
                        {t.coa_account_name ? (t.coa_code ? `${t.coa_code} — ${t.coa_account_name}` : t.coa_account_name) : "Uncategorized"}
                      </td>
                      <td style={{ padding: "7px 8px", color: "#5A7A8A", borderBottom: "1px solid #F1F5F9" }}>{fmtDate(t.posted_date)}</td>
                      <td
                        style={{
                          padding: "7px 8px",
                          textAlign: "right",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          color: amt >= 0 ? "#047857" : "#0B1C24",
                          borderBottom: "1px solid #F1F5F9",
                        }}
                      >
                        {amt >= 0 ? "+" : "−"}{fmtMoney(Math.abs(amt))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {savedNote && !err && (
          <div style={{ padding: 10, fontSize: 12, background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 6 }}>
            ✓ {savedNote}
          </div>
        )}
        {err && (
          <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
            {err}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

const fLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 };
const fInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid #E8E9FA", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const mLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const mInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid #E8E9FA", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const ghostBtn: React.CSSProperties = { padding: "7px 13px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #E8E9FA", background: "#fff", color: "#0B1C24", cursor: "pointer" };
