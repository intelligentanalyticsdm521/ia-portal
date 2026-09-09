// OpeningBalances — starting the books in the middle of a business's life.
//
// STELLA pack 1, item 8. A five-year-old company switching from a shoebox or
// from QuickBooks does not start at zero: it has a bank balance, a card balance,
// a loan, money owed to it, and whatever equity it has accumulated. None of that
// is a transaction, so there was nowhere to put it — and the consequence was not
// cosmetic. The Balance Sheet showed assets of nearly nothing, so the one report
// that says whether the books are sound said no, correctly, forever.
//
// FOUR STEPS, in the order a person actually thinks:
//   1. WHEN do the books start (the conversion date)
//   2. WHAT was true then (type it, or drop in a trial balance)
//   3. SHOW ME what will be posted, including the figure I did not know
//   4. POST it — one balanced entry, dated the conversion date
//
// THE BALANCING FIGURE IS SHOWN, NAMED, AND EXPLAINED. An owner knows their bank
// balance and their loan; they do not know their accumulated retained earnings —
// which is exactly the number that makes the two sides meet. Refusing an
// unbalanced trial balance would be technically pure and would stop every real
// conversion at the first screen, so the difference is posted to Retained
// Earnings as a visible line and this page says so before anything is written.
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "../StellaShell";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal,
} from "../dbmanager/DbManagerKit";

type Account = { coa_account_id: string; code: string; name: string; type: string };

type OpeningLine = {
  line_number: number; coa_account_id: string; code: string;
  account_name: string; account_type: string; debit: number; credit: number; memo: string | null;
};

type Existing = {
  journal_entry_id: string; conversion_date: string; memo: string | null;
  period_locked: boolean; lines: OpeningLine[];
  totals: { debits: number; credits: number };
};

type CarryIn = {
  open_ar: { invoices: number; total: number; source: string };
  open_ap: { total: number | null; reason: string };
};

type GetResponse = {
  opening: Existing | null;
  carry_in: CarryIn;
  suggested_accounts: Account[];
  excluded_types: string[];
  retained_earnings_code: string;
};

type PreviewLine = { coa_account_id: string; code: string | null; debit: number; credit: number; memo: string | null };
type Preview = {
  dry_run: true; conversion_date: string;
  lines: PreviewLine[];
  totals: { debits: number; credits: number; balanced: boolean };
  balancing_line: PreviewLine | null;
  balanced_without_balancing_line: boolean;
  carry_in: CarryIn;
  unknown_accounts: { line: number; code: string }[];
  rejected_rows: { row: number; reason: string }[];
  from_file: boolean;
  replaces_existing: boolean;
};

type Row = { coa_account_id: string; side: "debit" | "credit"; amount: string };

const emptyRow = (): Row => ({ coa_account_id: "", side: "debit", amount: "" });

/** 1 January of the current year — where a conversion almost always lands, and
 *  the only default that does not split a tax year in half. */
function defaultConversionDate() {
  return `${new Date().getUTCFullYear()}-01-01`;
}

export function OpeningBalances() {
  const api = useStellaApi();
  const [data, setData] = useState<GetResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();

  const [date, setDate] = useState(defaultConversionDate);
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [includeAr, setIncludeAr] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    setError(null);
    api.get<GetResponse>("/ledger/opening-balance")
      .then((r) => {
        setData(r);
        if (r.opening) setDate(r.opening.conversion_date);
      })
      .catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const accounts = data?.suggested_accounts || [];
  const typedRows = rows.filter((r) => r.coa_account_id && Number(r.amount) > 0);
  const canPreview = !!date && (!!csv || typedRows.length > 0);

  const body = () => ({
    conversion_date: date,
    include_open_ar: includeAr,
    ...(csv
      ? { csv }
      : {
          lines: typedRows.map((r) => ({
            coa_account_id: r.coa_account_id,
            debit: r.side === "debit" ? Number(r.amount) : 0,
            credit: r.side === "credit" ? Number(r.amount) : 0,
          })),
        }),
  });

  async function runPreview() {
    setBusy("preview"); setError(null); setPreview(null);
    try {
      setPreview(await api.post<Preview>("/ledger/opening-balance/preview", body()));
    } catch (e) {
      setError(detail(e));
    } finally { setBusy(null); }
  }

  async function post() {
    setBusy("post"); setError(null);
    try {
      const r = await api.post<{ lines: number; balancing_line: PreviewLine | null }>("/ledger/opening-balance", body());
      showNotice(
        r.balancing_line
          ? `Opening balances posted — ${r.lines} lines, including ${fmtMoney(r.balancing_line.debit || r.balancing_line.credit)} to Retained Earnings to make them balance.`
          : `Opening balances posted — ${r.lines} lines, and they balanced on their own.`,
      );
      setConfirming(false); setPreview(null); setCsv(null); setCsvName(null);
      setRows([emptyRow(), emptyRow()]);
      load();
    } catch (e) {
      setError(detail(e)); setConfirming(false);
    } finally { setBusy(null); }
  }

  async function remove() {
    if (!window.confirm("Remove the opening balances? Your Balance Sheet will drop back to what the register alone shows.")) return;
    setBusy("delete"); setError(null);
    try {
      await api.del("/ledger/opening-balance");
      showNotice("Opening balances removed.");
      load();
    } catch (e) {
      setError(detail(e));
    } finally { setBusy(null); }
  }

  function readFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result || ""));
      setCsvName(f.name);
      setPreview(null);
    };
    reader.readAsText(f);
  }

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  if (!data && !error) return <DbLoading />;

  const existing = data?.opening || null;

  return (
    <>
      <DbNotice text={notice} />
      <DbError error={error} />

      {/* What is already there. Shown FIRST because the commonest visit to this
          page after the first one is "what did I put in here?" */}
      {existing && (
        <DbCard
          title="Your opening balances"
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {existing.period_locked
                ? <Pill tone="warn">In a closed period</Pill>
                : <Pill tone="good">Posted</Pill>}
              <DbButton variant="ghost" onClick={remove} disabled={busy != null || existing.period_locked}>
                {busy === "delete" ? "Removing…" : "Remove"}
              </DbButton>
            </div>
          }
        >
          <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 10 }}>
            <CalendarClock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
            Your books start on <strong>{existing.conversion_date}</strong>. Everything before that date lives in
            these {existing.lines.length} lines; everything after it is in your register.
          </div>
          <DbTable
            columns={[
              { key: "code", label: "Code" },
              { key: "account_name", label: "Account" },
              { key: "debit", label: "Debit" },
              { key: "credit", label: "Credit" },
              { key: "memo", label: "Note" },
            ]}
            rows={existing.lines.map((l) => ({
              code: l.code,
              account_name: l.account_name,
              // Rendered here rather than typed as money in the kit: a zero side
              // must read as an em dash, not as $0.00, or every line looks half
              // filled in.
              debit: l.debit ? fmtMoney(l.debit) : "—",
              credit: l.credit ? fmtMoney(l.credit) : "—",
              memo: l.memo || "—",
            })) as never}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 8, fontSize: 12, fontWeight: 700 }}>
            <span>Debits {fmtMoney(existing.totals.debits)}</span>
            <span>Credits {fmtMoney(existing.totals.credits)}</span>
          </div>
          {existing.period_locked && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
              <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              These are inside a closed period, so they cannot be changed here. Reopen that period under Period Close,
              or correct them with an adjusting entry.
            </div>
          )}
        </DbCard>
      )}

      <DbCard title={existing ? "Replace your opening balances" : "Set your opening balances"}>
        <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 14, lineHeight: 1.55 }}>
          If your business existed before STELLA did, tell it where you stood on the day your books start here.
          Enter what you had — bank and card balances, loans, equipment, money owed to you — and STELLA posts one
          balanced entry dated that day. {existing && <strong>Posting again replaces what is above.</strong>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, alignItems: "start" }}>
          <DbField label="Books start on">
            <DbInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </DbField>
          <div style={{ fontSize: 11, color: "#94A3B8", paddingTop: 22, lineHeight: 1.5 }}>
            Usually the first day of a month, a quarter or your financial year. Anything dated before this is
            history you do not have to re-enter.
          </div>
        </div>

        {/* Either type it, or drop a trial balance in. */}
        <div style={{ marginTop: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: STELLA_INDIGO }}>What you had on that day</div>
          <input
            ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.currentTarget.value = ""; }}
          />
          <DbButton variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy != null}>
            <Upload size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            Import a trial balance
          </DbButton>
          {csvName && (
            <span style={{ fontSize: 11, color: "#5A7A8A" }}>
              {csvName}
              <button
                type="button"
                onClick={() => { setCsv(null); setCsvName(null); setPreview(null); }}
                style={{ marginLeft: 6, background: "transparent", border: 0, color: STELLA_INDIGO, cursor: "pointer", fontSize: 11 }}
              >
                use the form instead
              </button>
            </span>
          )}
        </div>

        {csv ? (
          <div style={{ padding: "10px 12px", background: "#F8FAFC", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, fontSize: 11, color: "#5A7A8A" }}>
            Reading <strong>{csvName}</strong>. It needs a header row with an account <strong>Code</strong> column and either
            <strong> Debit</strong> and <strong>Credit</strong> columns or a single signed <strong>Balance</strong> column.
            Check it below before anything is posted.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px auto", gap: 6 }}>
                <DbSelect value={r.coa_account_id} onChange={(e) => set(i, { coa_account_id: e.target.value })}>
                  <option value="">Select an account…</option>
                  {accounts.map((a) => (
                    <option key={a.coa_account_id} value={a.coa_account_id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </DbSelect>
                <DbSelect value={r.side} onChange={(e) => set(i, { side: e.target.value as Row["side"] })}>
                  <option value="debit">You had / own</option>
                  <option value="credit">You owed / equity</option>
                </DbSelect>
                <DbInput type="number" min="0" step="0.01" placeholder="0.00" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                <DbButton variant="ghost" onClick={() => setRows(rows.filter((_, n) => n !== i))} disabled={rows.length <= 1}>
                  <Trash2 size={12} />
                </DbButton>
              </div>
            ))}
            <div>
              <DbButton variant="ghost" onClick={() => setRows([...rows, emptyRow()])}>
                <Plus size={12} style={{ verticalAlign: -2, marginRight: 4 }} /> Add a line
              </DbButton>
            </div>
            <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.5 }}>
              Only what you own, owe and are worth — accounts of the asset, liability and equity kind. Income and
              expense accounts are not offered on purpose: your past trading is already inside the retained-earnings
              figure below, and entering it twice would double it.
            </div>
          </div>
        )}

        {/* Carry-in. AR is real; AP has no shape yet, and says so. */}
        {data && (
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#334155", cursor: data.carry_in.open_ar.total ? "pointer" : "default" }}>
              <input
                type="checkbox" checked={includeAr}
                disabled={!data.carry_in.open_ar.total}
                onChange={(e) => { setIncludeAr(e.target.checked); setPreview(null); }}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>Carry in what customers still owe you</strong>
                {data.carry_in.open_ar.total
                  ? <> — {data.carry_in.open_ar.invoices} open invoice{data.carry_in.open_ar.invoices === 1 ? "" : "s"} totalling {fmtMoney(data.carry_in.open_ar.total)} dated on or before your start date.</>
                  : <> — nothing to carry in; there are no open invoices dated on or before your start date.</>}
              </span>
            </label>
            <div style={{ fontSize: 11, color: "#94A3B8", paddingLeft: 24, lineHeight: 1.5 }}>
              <strong>What you owe suppliers is not carried in.</strong> {data.carry_in.open_ap.reason}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <DbButton onClick={runPreview} disabled={!canPreview || busy != null}>
            {busy === "preview" ? "Checking…" : "Show me what will be posted"}
          </DbButton>
        </div>
      </DbCard>

      {/* Step 3 — the preview. Nothing has been written at this point. */}
      {preview && (
        <DbCard
          title="What will be posted"
          actions={<Pill tone={preview.balanced_without_balancing_line ? "good" : "brand"}>
            {preview.balanced_without_balancing_line ? "Balances on its own" : "Balanced with a retained-earnings line"}
          </Pill>}
        >
          {preview.rejected_rows.length > 0 && (
            <div style={{ marginBottom: 10, padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 11, color: "#991B1B" }}>
              {preview.rejected_rows.length} row{preview.rejected_rows.length === 1 ? "" : "s"} in your file could not be read and will be left out:
              <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                {preview.rejected_rows.slice(0, 8).map((r) => <li key={r.row}>Row {r.row}: {r.reason}</li>)}
              </ul>
            </div>
          )}
          {preview.unknown_accounts.length > 0 && (
            <div style={{ marginBottom: 10, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
              These account codes are not in your chart of accounts, so they cannot be posted:
              {" "}<strong>{preview.unknown_accounts.map((u) => u.code).join(", ")}</strong>.
              Add them under Chart of Accounts, or correct the codes in your file.
            </div>
          )}

          <DbTable
            columns={[
              { key: "code", label: "Code" },
              { key: "memo", label: "What it is" },
              { key: "debit", label: "Debit" },
              { key: "credit", label: "Credit" },
            ]}
            rows={preview.lines.map((l) => ({
              code: l.code || "—",
              memo: l.memo || "Opening balance",
              debit: l.debit ? fmtMoney(l.debit) : "—",
              credit: l.credit ? fmtMoney(l.credit) : "—",
            })) as never}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, marginTop: 8, fontSize: 12, fontWeight: 700 }}>
            <span>Debits {fmtMoney(preview.totals.debits)}</span>
            <span>Credits {fmtMoney(preview.totals.credits)}</span>
          </div>

          {preview.balancing_line && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "#EEF0FB", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, fontSize: 12, color: "#334155", lineHeight: 1.55 }}>
              <strong>The last line is the figure you did not have to know.</strong> Your accounts are out by{" "}
              {fmtMoney(preview.balancing_line.debit || preview.balancing_line.credit)}, and that difference IS your
              accumulated profit to date — so it goes to <strong>Retained Earnings</strong>. That is what an accountant
              would do, and it is why the entry balances.
            </div>
          )}
          {preview.replaces_existing && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
              Posting this REPLACES the opening balances you already have. Two sets would double every balance,
              so the old one is removed in the same step.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <DbButton variant="ghost" onClick={() => setPreview(null)} disabled={busy != null}>Back</DbButton>
            <DbButton
              variant="primary"
              onClick={() => setConfirming(true)}
              disabled={busy != null || preview.unknown_accounts.length > 0}
            >
              Post these opening balances
            </DbButton>
          </div>
        </DbCard>
      )}

      {confirming && preview && (
        <DbModal title="Post opening balances" onClose={() => setConfirming(false)}>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
            <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 5, color: "#047857" }} />
            {preview.lines.length} lines, {fmtMoney(preview.totals.debits)} each side, dated{" "}
            <strong>{preview.conversion_date}</strong>.
            <div style={{ marginTop: 8, color: "#5A7A8A" }}>
              This is one journal entry. You can remove it from this page afterwards, right up until the period it
              sits in is closed.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <DbButton variant="ghost" onClick={() => setConfirming(false)} disabled={busy != null}>Cancel</DbButton>
            <DbButton variant="primary" onClick={post} disabled={busy != null}>
              {busy === "post" ? "Posting…" : "Post them"}
            </DbButton>
          </div>
        </DbModal>
      )}
    </>
  );
}

/** The API's plain-sentence `details` when it has one — never the raw error. */
function detail(e: unknown) {
  const d = (e as { details?: string })?.details;
  return d ? { message: d } : e;
}
