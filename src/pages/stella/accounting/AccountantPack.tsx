// AccountantPack — the year-end hand-off, from the Reports page.
//
// Ops O-5 step (b), the last row of the §3.6 "bookkeeper replaced" table.
// A CPA asks for the same three things every time — the general ledger, the
// trial balance, and the transaction list — so this is one button that
// produces all three for a period, plus a summary sheet that says whether the
// period is closed.
//
// THE PREVIEW IS THE GUARD MADE VISIBLE. Before offering the download, the
// page asks the server for the totals; if the period does not foot, the server
// refuses and this shows why. Handing an accountant a set of books that cannot
// be footed costs them billable hours and costs us the relationship, so
// "nothing to download" is the right answer to an unbalanced period.
import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, AlertTriangle, Lock, Unlock } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import { useEffectiveTenantId } from "../../../lib/tenantContext";
import { markPackDownloaded } from "../stellaSetupSteps";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { STELLA_API_BASE, getStellaAuthHeaders } from "../../../lib/stellaApi";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "../StellaShell";
import { DbCard, DbError, DbButton, DbSelect, DbField, DbTable, DbEmpty, Pill } from "../dbmanager/DbManagerKit";
// The Reports page's cash/accrual choice (AccountingReports.tsx, where this
// type used to live, went with the ten-tab page — D-177).
type Basis = "cash" | "accrual";

type TrialRow = {
  account_code: string; account_name: string; account_type: string;
  debit: number; credit: number; period_state: string;
};

type PackMeta = {
  from: string; to: string; basis: string;
  journal_lines: number; accounts: number; transactions: number;
  total_debit: number; total_credit: number; difference: number; balanced: boolean;
  closed_periods: string[]; period_state: string;
};

/** Jan 1 → Dec 31 of a year, and the current year-to-date. */
function yearRange(y: number) { return { from: `${y}-01-01`, to: `${y}-12-31` }; }

export function AccountantPack() {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();
  // Overview → Finish setup ticks "Accountant pack" once a download has gone
  // through on this browser (the export route keeps no record of downloads).
  const businessId = useEffectiveTenantId();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [basis, setBasis] = useState<Basis>("cash");
  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [rows, setRows] = useState<TrialRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const range = yearRange(year);

  const load = useCallback(() => {
    if (!api.ready) return;
    setLoading(true); setError(null); setMeta(null); setRows(null);
    const { from, to } = yearRange(year);
    api.get<{ meta: PackMeta; trial_balance: TrialRow[] }>(
      `/ledger/export/accountant?from=${from}&to=${to}&basis=${basis}&preview=1`,
    )
      .then((r) => { setMeta(r.meta); setRows(r.trial_balance); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [api, year, basis]);
  useEffect(() => { load(); }, [load]);

  async function download(format: "csv" | "xlsx", section?: string) {
    setDownloading(`${format}:${section || "all"}`); setError(null);
    try {
      const headers = await getStellaAuthHeaders(instance, account!, tenantOverride);
      const qs = new URLSearchParams({ from: range.from, to: range.to, basis, format });
      if (section) qs.set("section", section);
      const res = await fetch(`${STELLA_API_BASE}/ledger/export/accountant?${qs}`, { headers });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Export failed (${res.status})`;
        try {
          const j = JSON.parse(text);
          msg = j.details ? `${j.error} — ${j.details}` : j.error || msg;
        } catch { /* non-JSON error body */ }
        throw new Error(msg);
      }
      const cd = res.headers.get("content-disposition") || "";
      const named = /filename="([^"]+)"/.exec(cd)?.[1];
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named || `stella-accountant-${range.from}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      try { markPackDownloaded(window.localStorage, businessId, Date.now()); } catch { /* storage blocked */ }
    } catch (e) { setError(e); } finally { setDownloading(null); }
  }

  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3, thisYear - 4];
  const closed = meta?.period_state === "closed";

  return (
    <>
      <DbError error={error} />

      <DbCard title="Send it to your accountant">
        <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 14, lineHeight: 1.6 }}>
          Everything a CPA asks for, for one year: the <strong>general ledger</strong> (every journal line by
          account), the <strong>trial balance</strong>, and the <strong>transaction list</strong>. The Excel
          version is one workbook with all three plus a summary sheet — the format most accountants want.
          Every row says whether its period is closed, so they know which numbers can still move.
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
          <DbField label="Year">
            <DbSelect value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </DbSelect>
          </DbField>
          <DbField label="Basis" hint={basis === "cash" ? "when the money moved" : "when it was earned or owed"}>
            <DbSelect value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
              <option value="cash">Cash</option>
              <option value="accrual">Accrual</option>
            </DbSelect>
          </DbField>
          <DbButton onClick={() => download("xlsx")} disabled={!!downloading || loading || !meta}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileSpreadsheet size={14} />
              {downloading === "xlsx:all" ? "Building…" : "Download Excel pack"}
            </span>
          </DbButton>
          <DbButton variant="ghost" onClick={() => download("csv", "general_ledger")} disabled={!!downloading || loading || !meta}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={13} /> GL (CSV)</span>
          </DbButton>
          <DbButton variant="ghost" onClick={() => download("csv", "trial_balance")} disabled={!!downloading || loading || !meta}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={13} /> Trial balance (CSV)</span>
          </DbButton>
          <DbButton variant="ghost" onClick={() => download("csv", "transactions")} disabled={!!downloading || loading || !meta}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={13} /> Transactions (CSV)</span>
          </DbButton>
        </div>

        {loading && <div style={{ fontSize: 12, color: STELLA_INDIGO }}>Checking the numbers…</div>}

        {meta && (
          <div style={{
            display: "flex", gap: 24, flexWrap: "wrap", padding: "12px 16px", borderRadius: 8,
            background: meta.balanced ? "#ECFDF3" : "#FEF3F2",
            border: `1px solid ${meta.balanced ? "#A6F4C5" : "#FDA29B"}`,
          }}>
            <Fact label="Journal lines" value={String(meta.journal_lines)} />
            <Fact label="Accounts" value={String(meta.accounts)} />
            <Fact label="Transactions" value={String(meta.transactions)} />
            <Fact label="Total debits" value={fmtMoney(meta.total_debit)} />
            <Fact label="Total credits" value={fmtMoney(meta.total_credit)} />
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {closed
                ? <Pill tone="good"><span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Lock size={10} /> period closed</span></Pill>
                : <Pill tone="warn"><span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Unlock size={10} /> still open</span></Pill>}
              {meta.balanced
                ? <Pill tone="good">balances</Pill>
                : <Pill tone="bad">out by {fmtMoney(meta.difference)}</Pill>}
            </div>
          </div>
        )}

        {meta && !closed && (
          <div style={{ fontSize: 11, color: "#93370D", marginTop: 10, lineHeight: 1.5 }}>
            Some of this year is not closed yet, so these numbers can still change. Close the periods first
            (Accounting → Period Close) if your accountant needs a final set.
          </div>
        )}

        {meta && meta.closed_periods.length > 0 && (
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
            Closed inside this window: {meta.closed_periods.join(", ")}
          </div>
        )}

        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 12, lineHeight: 1.6 }}>
          Tax filing, payroll tax and sales-tax remittance stay with your CPA — STELLA gives them the books,
          not the return. Invoice history brought in from another system is held out of these numbers until you
          explicitly bring it into your books, so the switch-over month is not counted twice.
        </div>
      </DbCard>

      <div style={{ height: 16 }} />

      <DbCard title={`Trial balance — ${range.from} to ${range.to}`}>
        {!meta && !loading && !error && (
          <div style={{ fontSize: 12, color: "#5A7A8A" }}>Pick a year above.</div>
        )}
        {meta && !meta.balanced && (
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", marginBottom: 12,
            borderRadius: 8, background: "#FEF3F2", border: "1px solid #FDA29B", fontSize: 12, color: "#B42318", lineHeight: 1.5,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              This period does not foot — debits and credits are {fmtMoney(Math.abs(meta.difference))} apart.
              STELLA will not hand an accountant books that do not balance, so the download is refused until
              this is fixed.
            </span>
          </div>
        )}
        {rows && (
          <DbTable
            columns={[
              { key: "account_code", label: "Code" },
              { key: "account_name", label: "Account" },
              { key: "account_type", label: "Type" },
              { key: "debit", label: "Debit", type: "decimal" },
              { key: "credit", label: "Credit", type: "decimal" },
              { key: "state", label: "Period" },
            ]}
            rows={rows.map((r) => ({
              ...r,
              state: r.period_state === "closed" ? <Pill tone="good">closed</Pill>
                : r.period_state === "mixed" ? <Pill tone="warn">part closed</Pill>
                : <Pill tone="neutral">open</Pill>,
            })) as never}
            empty={<DbEmpty title="Nothing posted in this year" reason="There are no journal entries in that window." />}
          />
        )}
        {rows && rows.length > 0 && meta && (
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 32, marginTop: 10, paddingTop: 10,
            borderTop: `1px solid ${STELLA_LAVENDER}`, fontSize: 13, fontWeight: 700, color: "#0B1C24",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span>TOTAL</span>
            <span>{fmtMoney(meta.total_debit)}</span>
            <span>{fmtMoney(meta.total_credit)}</span>
          </div>
        )}
      </DbCard>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
