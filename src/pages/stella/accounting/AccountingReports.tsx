// AccountingReports — Balance Sheet, Trial Balance and General Ledger.
//
// The Balance Sheet is the headline: StellaReportsPage has been telling
// customers it "arrives with accrual accounting in a later STELLA phase" since
// the Ledger shipped. It is here now, on both bases, and it says out loud
// whether it balances.
import { useCallback, useEffect, useState } from "react";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "../StellaShell";
import { DbCard, DbError, DbLoading, DbSelect, DbField, DbInput, DbTable, Pill, DbEmpty } from "../dbmanager/DbManagerKit";
// STELLA pack 1, item 4 — the Balance Sheet export states `balanced` in words,
// because a reader holding the CSV cannot see the badge on this screen.
import { StatementExportBar } from "../StatementExportBar";

export type Basis = "cash" | "accrual";

/**
 * The cash/accrual switch. Prominent on purpose — which basis you are looking
 * at changes every number on the page, and a quiet toggle invites someone to
 * read an accrual sheet thinking it is cash.
 */
export function BasisToggle({ basis, onChange }: { basis: Basis; onChange: (b: Basis) => void }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, overflow: "hidden" }}>
      {(["cash", "accrual"] as Basis[]).map((b) => (
        <button
          key={b} onClick={() => onChange(b)}
          style={{
            padding: "6px 14px", fontSize: 12, fontWeight: b === basis ? 700 : 500, border: 0, cursor: "pointer",
            background: b === basis ? STELLA_INDIGO : "#fff", color: b === basis ? "#fff" : "#5A7A8A",
          }}
        >{b === "cash" ? "Cash basis" : "Accrual basis"}</button>
      ))}
    </div>
  );
}

function BalancedBadge({ ok, difference }: { ok: boolean; difference: number }) {
  return ok
    ? <Pill tone="good">Balanced</Pill>
    : <Pill tone="bad">Out by {fmtMoney(Math.abs(difference))}</Pill>;
}

type Line = { coa_account_id: string | null; code: string; account_name: string; amount: number };
type BalanceSheet = {
  basis: Basis; as_of: string;
  assets: Line[]; liabilities: Line[]; equity: Line[];
  totals: {
    assets: number; liabilities: number; equity: number; liabilities_and_equity: number;
    net_income: number; difference: number; balanced: boolean;
  };
};

export function BalanceSheetReport({ basis, onBasis }: { basis: Basis; onBasis: (b: Basis) => void }) {
  const api = useStellaApi();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!api.ready) return;
    setData(null); setError(null);
    api.get<BalanceSheet>(`/ledger/balance-sheet?basis=${basis}&as_of=${asOf}`).then(setData).catch(setError);
  }, [api, basis, asOf]);

  const Section = ({ title, lines, total }: { title: string; lines: Line[]; total: number }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: STELLA_INDIGO, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        {title}
      </div>
      {lines.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94A3B8", padding: "6px 0" }}>Nothing here yet.</div>
      ) : lines.map((l) => (
        <div key={`${l.code}-${l.account_name}`} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: "1px solid #F1F5F9" }}>
          <span style={{ color: "#334155" }}>
            <span style={{ color: "#94A3B8", fontFamily: "ui-monospace, monospace", fontSize: 11, marginRight: 8 }}>{l.code}</span>
            {l.account_name}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: l.amount < 0 ? "#B42318" : "#0B1C24" }}>{fmtMoney(l.amount)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>
        <span>Total {title.toLowerCase()}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(total)}</span>
      </div>
    </div>
  );

  return (
    <DbCard
      title="Balance Sheet"
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <BasisToggle basis={basis} onChange={onBasis} />
          <div style={{ width: 150 }}>
            <DbField label="As of"><DbInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></DbField>
          </div>
          <StatementExportBar
            path={`/ledger/balance-sheet?basis=${basis}&as_of=${asOf}`}
            fileBase={`balance-sheet-${asOf}`}
            disabled={!data}
          />
        </div>
      }
    >
      <DbError error={error} />
      {!data ? <DbLoading /> : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#5A7A8A" }}>
              What the business owns, owes and is worth as at {new Date(`${data.as_of}T00:00:00`).toLocaleDateString()},
              on {data.basis === "accrual" ? "an" : "a"} <strong>{data.basis}</strong> basis.
            </div>
            <BalancedBadge ok={data.totals.balanced} difference={data.totals.difference} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            <div><Section title="Assets" lines={data.assets} total={data.totals.assets} /></div>
            <div>
              <Section title="Liabilities" lines={data.liabilities} total={data.totals.liabilities} />
              <Section title="Equity" lines={data.equity} total={data.totals.equity} />
            </div>
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 8, padding: "12px 14px",
            background: "#FAFBFF", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8,
            fontSize: 13, fontWeight: 700, color: "#0B1C24",
          }}>
            <span>Assets</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(data.totals.assets)}</span>
            <span style={{ color: "#94A3B8" }}>vs</span>
            <span>Liabilities + Equity</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(data.totals.liabilities_and_equity)}</span>
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8, lineHeight: 1.5 }}>
            Equity includes <strong>Retained Earnings (current)</strong> of {fmtMoney(data.totals.net_income)} — this period's
            income less expenses, rolled in. That is what lets the sheet balance without a year-end close having been run.
          </div>
        </>
      )}
    </DbCard>
  );
}

type TrialBalance = {
  basis: Basis;
  lines: { code: string; account_name: string; account_type: string; debit: number; credit: number; balance_debit: number; balance_credit: number }[];
  totals: { debit: number; credit: number; difference: number; balanced: boolean };
};

export function TrialBalanceReport({ basis, onBasis }: { basis: Basis; onBasis: (b: Basis) => void }) {
  const api = useStellaApi();
  const [data, setData] = useState<TrialBalance | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!api.ready) return;
    setData(null); setError(null);
    api.get<TrialBalance>(`/ledger/trial-balance?basis=${basis}`).then(setData).catch(setError);
  }, [api, basis]);

  return (
    <DbCard
      title="Trial Balance"
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <BasisToggle basis={basis} onChange={onBasis} />
          {data && <BalancedBadge ok={data.totals.balanced} difference={data.totals.difference} />}
        </div>
      }
    >
      <DbError error={error} />
      {!data ? <DbLoading /> : (
        <>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
            Every account with a balance, on its natural side. Total debits must equal total credits — if they do not,
            something is wrong with the books, not with the report.
          </div>
          <DbTable
            columns={[
              { key: "code", label: "Code" },
              { key: "account_name", label: "Account" },
              { key: "account_type", label: "Type" },
              { key: "balance_debit", label: "Debit", type: "decimal" },
              { key: "balance_credit", label: "Credit", type: "decimal" },
            ]}
            rows={data.lines as never}
            empty={<DbEmpty title="Nothing posted yet" reason="Record a transaction and it will appear here." />}
          />
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 32, marginTop: 12, paddingTop: 10,
            borderTop: `2px solid ${STELLA_LAVENDER}`, fontSize: 13, fontWeight: 700,
          }}>
            <span>Totals</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(data.totals.debit)}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(data.totals.credit)}</span>
          </div>
        </>
      )}
    </DbCard>
  );
}

type GL = {
  basis: Basis; opening_balance: number | null; closing_balance: number | null;
  lines: {
    entry_date: string; source: string; coa_code: string; account_name: string;
    debit: number; credit: number; entry_memo: string | null; line_memo: string | null;
    counterparty_name: string | null; running_balance: number | null;
  }[];
};

export function GeneralLedgerReport({ basis, onBasis }: { basis: Basis; onBasis: (b: Basis) => void }) {
  const api = useStellaApi();
  const [accounts, setAccounts] = useState<{ coa_account_id: string; code: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [data, setData] = useState<GL | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!api.ready) return;
    api.get<{ coa_account_id: string; code: string; name: string }[]>("/ledger/coa?active=true")
      .then((rows) => {
        setAccounts(rows);
        // Default to the cash account — the one people actually want to read.
        setAccountId((p) => p || rows.find((a) => a.code === "1000")?.coa_account_id || rows[0]?.coa_account_id || "");
      })
      .catch(setError);
  }, [api]);

  const load = useCallback(() => {
    if (!api.ready || !accountId) return;
    setData(null); setError(null);
    api.get<GL>(`/ledger/general-ledger?basis=${basis}&coa_account_id=${accountId}&limit=500`).then(setData).catch(setError);
  }, [api, basis, accountId]);
  useEffect(() => { load(); }, [load]);

  return (
    <DbCard
      title="General Ledger"
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <BasisToggle basis={basis} onChange={onBasis} />
          <div style={{ width: 240 }}>
            <DbField label="Account">
              <DbSelect value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
              </DbSelect>
            </DbField>
          </div>
        </div>
      }
    >
      <DbError error={error} />
      {!data ? <DbLoading /> : (
        <>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12 }}>
            Every line that hit this account, with a running balance — the drill-down behind any number on the
            Balance Sheet or P&amp;L. Closing balance <strong>{fmtMoney(data.closing_balance || 0)}</strong>.
          </div>
          <DbTable
            columns={[
              { key: "entry_date", label: "Date", type: "date" },
              { key: "memo", label: "Description" },
              { key: "source", label: "Source" },
              { key: "debit", label: "Debit", type: "decimal" },
              { key: "credit", label: "Credit", type: "decimal" },
              { key: "running_balance", label: "Balance", type: "decimal" },
            ]}
            rows={data.lines.map((l) => ({
              ...l,
              memo: l.line_memo || l.entry_memo || l.counterparty_name || "—",
              source: <Pill tone={l.source === "manual" || l.source === "adjusting" ? "warn" : "neutral"}>{l.source}</Pill>,
            })) as never}
            empty={<DbEmpty title="No activity on this account" reason="Pick another account, or record a transaction against this one." />}
          />
        </>
      )}
    </DbCard>
  );
}
