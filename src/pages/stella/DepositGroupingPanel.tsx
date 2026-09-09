// DepositGroupingPanel — several payments, one bank line. STELLA pack 2, item 5.
//
// The single commonest reason a real bank reconciliation refuses to balance:
// three cheques and a cash payment go to the bank together and land on the
// statement as ONE line for $1,842.17, while the books hold four rows that add
// up to it. Nothing matches, the owner cannot see why, and the reconciliation is
// abandoned half-done.
//
// The fix every accounting package uses: money arrives into UNDEPOSITED FUNDS
// and a deposit moves the batch into the bank in one entry. Each payment keeps
// its own row and its own customer; the bank side becomes one row that matches
// the statement.
//
// This panel is only ever shown when there IS money waiting — an empty
// "group your deposits" box on a business that takes cards is furniture.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

interface Undeposited {
  transaction_id: string;
  posted_date: string;
  amount: number;
  memo: string | null;
  description: string | null;
  counterparty_name: string | null;
}
// The chart-of-accounts shape as the register page already holds it — `code`
// is nullable there, and re-declaring it non-null here would be this file
// insisting on something the API does not promise.
interface Account { coa_account_id: string; code: string | null; name: string }

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return y && m && day ? new Date(y, m - 1, day).toLocaleDateString() : String(d).slice(0, 10);
}

export function DepositGroupingPanel({ accounts, onDeposited }: {
  accounts: Account[];
  onDeposited: (msg: string) => void;
}) {
  const { get, post, ready } = useStellaApi();
  const [rows, setRows] = useState<Undeposited[]>([]);
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bankAccounts = useMemo(
    () => accounts.filter((a) => ["1000", "1010"].includes(String(a.code))),
    [accounts],
  );

  const reload = useCallback(async () => {
    try {
      const r = await get<Undeposited[]>("/ledger/undeposited");
      setRows(r || []);
    } catch { /* the panel simply does not appear */ }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);
  useEffect(() => { if (!bank && bankAccounts.length) setBank(bankAccounts[0].coa_account_id); }, [bank, bankAccounts]);

  if (!rows.length) return null;

  const pickedTotal = rows.filter((r) => picked.has(r.transaction_id)).reduce((s, r) => s + Number(r.amount), 0);

  async function group() {
    setBusy(true); setErr(null);
    try {
      const r = await post<{ total: number; payments: number; message: string }>("/ledger/deposits", {
        deposit_date: depositDate,
        settlement_coa_account_id: bank || null,
        transaction_ids: [...picked],
        reference: reference || null,
      });
      setOpen(false);
      setPicked(new Set());
      onDeposited(r.message);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not group those payments.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 10,
          padding: "12px 16px", marginBottom: 14, flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Landmark size={16} color={STELLA_INDIGO} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>
              {fmtMoney(total)} taken in and not banked yet
            </div>
            <div style={{ fontSize: 11, color: "#5A7A8A" }}>
              {rows.length} payment{rows.length === 1 ? "" : "s"} waiting. Group the ones that went to the bank
              together and your statement line has one row to match instead of {rows.length}.
            </div>
          </div>
        </div>
        <button
          onClick={() => { setPicked(new Set(rows.map((r) => r.transaction_id))); setOpen(true); }}
          style={{ padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#fff", background: STELLA_INDIGO, border: 0, borderRadius: 6, cursor: "pointer" }}
        >
          Group into a deposit
        </button>
      </div>

      {open && (
        <IadmModal
          open onClose={() => setOpen(false)} product="stella"
          eyebrow="Banking" title="Group these into one deposit"
          subtitle="Tick the payments that went to the bank together on the same slip."
          size="info"
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>
                {picked.size} payment{picked.size === 1 ? "" : "s"} · {fmtMoney(pickedTotal)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <IadmButton variant="ghost" onClick={() => setOpen(false)}>Cancel</IadmButton>
                <IadmButton variant="accent" product="stella" onClick={group} disabled={busy || picked.size === 0}>
                  {busy ? "Banking…" : "That is the deposit"}
                </IadmButton>
              </div>
            </div>
          }
        >
          {err && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8 }}>{err}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 }}>Banked on</label>
              <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)}
                style={{ width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 }}>Into</label>
              <select value={bank} onChange={(e) => setBank(e.target.value)}
                style={{ width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6, background: "#fff" }}>
                {bankAccounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", display: "block", marginBottom: 4 }}>Slip reference</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)}
                style={{ width: "100%", padding: "7px 9px", fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 6 }} />
            </div>
          </div>

          <div style={{ border: "1px solid #F1F5F9", borderRadius: 8, maxHeight: 320, overflow: "auto" }}>
            {rows.map((r) => (
              <label key={r.transaction_id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid #F1F5F9", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={picked.has(r.transaction_id)}
                  onChange={() => setPicked((p) => {
                    const next = new Set(p);
                    if (next.has(r.transaction_id)) next.delete(r.transaction_id); else next.add(r.transaction_id);
                    return next;
                  })}
                />
                <span style={{ flex: 1, fontSize: 12, color: "#0B1C24" }}>
                  {r.counterparty_name || r.description || r.memo || "Payment"}
                  <span style={{ color: "#94A3B8" }}> · {fmtDate(r.posted_date)}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.amount)}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 12, lineHeight: 1.6 }}>
            Each payment keeps its own line and its own customer. What changes is the bank side: one
            entry for the whole slip, so the line on your statement has exactly one row to reconcile
            against. Got it wrong? Open the deposit and break it up again.
          </div>
        </IadmModal>
      )}
    </>
  );
}

export default DepositGroupingPanel;
