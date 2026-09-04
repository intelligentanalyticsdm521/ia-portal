// BankStatementImport — the BANK's side of a reconciliation.
//
// Ops O-5 step (b). Reconciliation as shipped had only the BOOK side: it
// listed the tenant's own journal entries and let them be ticked cleared. If
// the bank showed something the books had never heard of, the difference had
// nowhere to point.
//
// This is the other half:
//   upload the statement CSV  →  PREVIEW (writes nothing)  →  import
//   →  auto-match by amount and date  →  work the leftovers
//
// THE PREVIEW IS THE POINT. A bank CSV's sign convention is the one thing that
// fails silently — a card export where a positive number is a charge, read as
// a deposit, inverts a month of books without erroring. So the preview shows
// the SIGNED amounts as they would be stored, plus which layout was matched
// and which reading of DD/MM was used, before a single row is written.
//
// Auto-match refuses to guess: a statement line that could pair with more than
// one transaction is reported as ambiguous and left for the person. A
// reconciliation that balances against the wrong invoice is arithmetically
// correct and factually wrong, which is the worst combination.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, Wand2, Link2, PlusCircle, EyeOff } from "lucide-react";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { stellaUpload } from "../../../lib/stellaApi";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import { STELLA_LAVENDER, fmtMoney } from "../StellaShell";
import {
  DbCard, DbError, DbButton, DbSelect, DbField, DbTable, DbEmpty,
  DbNotice, useNotice, Pill, DbModal, DbLoading,
} from "../dbmanager/DbManagerKit";

type Preset = { key: string; label: string; convention: string; day_first: boolean };

type PreviewRow = {
  row: number; posted_date: string; description: string | null;
  amount_signed: number; balance_after: number | null; external_ref: string | null;
  duplicate: boolean;
};

type Preview = {
  dry_run: true;
  account: { coa_account_id: string; code: string; name: string } | null;
  format: {
    preset_key: string; preset_label: string; convention: string;
    day_first: boolean; day_first_source?: string;
    columns: Record<string, string>; headers: string[];
    candidates: { preset_key: string; label: string; score: number }[];
  };
  summary: {
    rows: number; rejected: number; money_in: number; money_out: number; net: number;
    first_date: string | null; last_date: string | null; duplicates: number; would_import: number;
  };
  rows: PreviewRow[];
  rejected: { row: number; reason: string }[];
};

export type StatementLine = {
  bank_statement_line_id: string;
  posted_date: string;
  description: string | null;
  amount_signed: number;
  external_ref: string | null;
  match_status: "unmatched" | "matched" | "ignored";
  matched_transaction_id: string | null;
  match_method: string | null;
  matched_description: string | null;
  matched_date: string | null;
};

type Account = { coa_account_id: string; code: string; name: string; type: string };

/** A stable idempotency key per chosen file. */
const newBatchId = () =>
  (globalThis.crypto?.randomUUID?.() as string) ||
  "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

const CONVENTION_TEXT: Record<string, string> = {
  amount_signed_inflow_positive: "one Amount column, negative means money out",
  amount_signed_outflow_positive: "a card export — a positive number is a charge, so it is stored as money out",
  debit_credit: "separate Debit and Credit columns",
  amount_plus_type: "an Amount column plus a Deposit/Withdrawal type",
};

export function BankStatementImport({ reconciliationId, coaAccountId, accounts, onImported }: {
  reconciliationId: string;
  coaAccountId: string;
  accounts: Account[];
  onImported: () => void;
}) {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetKey, setPresetKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState<string>(newBatchId());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lines, setLines] = useState<StatementLine[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<StatementLine | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!api.ready) return;
    api.get<Preset[]>("/ledger/bank-import/presets").then(setPresets).catch(setError);
  }, [api]);

  const loadLines = useCallback(() => {
    if (!api.ready) return;
    api.get<StatementLine[]>(`/ledger/bank-statement-lines?bank_reconciliation_id=${reconciliationId}`)
      .then(setLines).catch(setError);
  }, [api, reconciliationId]);
  useEffect(() => { loadLines(); }, [loadLines]);

  async function runPreview(f: File) {
    setBusy(true); setError(null); setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("coa_account_id", coaAccountId);
      if (presetKey) fd.append("preset_key", presetKey);
      const r = await stellaUpload<{ data: Preview }>(instance, account, "/ledger/bank-import/preview", fd, tenantOverride);
      setPreview(r.data);
      // A new file is a new import: a fresh batch id, so the preview and the
      // import that follows it share one key and a retry is safe.
      setBatchId(newBatchId());
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function commit() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("coa_account_id", coaAccountId);
      fd.append("batch_id", batchId);
      fd.append("bank_reconciliation_id", reconciliationId);
      if (preview?.format.preset_key) fd.append("preset_key", preview.format.preset_key);
      fd.append("file_name", file.name);
      const r = await stellaUpload<{ data: { summary: { created: number; skipped: number; errored: number } } }>(
        instance, account, "/ledger/bank-import", fd, tenantOverride,
      );
      const s = r.data.summary;
      showNotice(`Imported ${s.created} line${s.created === 1 ? "" : "s"}`
        + (s.skipped ? ` · ${s.skipped} already there` : "")
        + (s.errored ? ` · ${s.errored} could not be read` : ""));
      setPreview(null); setFile(null);
      loadLines(); onImported();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function autoMatch() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ matched: number; ambiguous: number; unmatched: number; message: string }>(
        `/ledger/reconciliations/${reconciliationId}/auto-match`, { date_tolerance_days: 3 },
      );
      showNotice(r.message);
      loadLines(); onImported();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function ignore(l: StatementLine) {
    try {
      await api.post(`/ledger/bank-statement-lines/${l.bank_statement_line_id}/ignore`, {});
      loadLines();
    } catch (e) { setError(e); }
  }

  async function unmatch(l: StatementLine) {
    try {
      await api.post(`/ledger/bank-statement-lines/${l.bank_statement_line_id}/unmatch`, {});
      loadLines(); onImported();
    } catch (e) { setError(e); }
  }

  const unmatched = useMemo(() => (lines || []).filter((l) => l.match_status === "unmatched"), [lines]);
  const visible = useMemo(
    () => (showAll ? (lines || []) : unmatched),
    [showAll, lines, unmatched],
  );

  return (
    <>
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard title="Import a bank statement (CSV)">
        <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 12, lineHeight: 1.5 }}>
          For the accounts a live bank feed cannot reach. Download the statement as CSV from your bank, upload it
          here, and check the preview — <strong>nothing is written until you press Import</strong>. Importing the
          same file twice adds nothing.
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <DbField label="Layout" hint="leave on auto unless the preview reads it wrong">
            <DbSelect value={presetKey} onChange={(e) => setPresetKey(e.target.value)}>
              <option value="">Detect automatically</option>
              {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </DbSelect>
          </DbField>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", minHeight: 38,
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.5 : 1, background: "#FFFFFF", color: "#4C5BD4", border: `1px solid ${STELLA_LAVENDER}`,
          }}>
            <Upload size={14} />
            <span>{file ? file.name : "Choose a CSV"}</span>
            <input type="file" accept=".csv,text/csv,text/plain" disabled={busy} style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                e.target.value = "";
                setFile(f);
                if (f) runPreview(f);
              }} />
          </label>
          {busy && <span style={{ fontSize: 12, color: "#4C5BD4" }}>Reading…</span>}
        </div>

        {preview && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              display: "flex", gap: 20, flexWrap: "wrap", padding: "10px 14px", borderRadius: 8,
              background: "#FAFBFF", border: `1px solid ${STELLA_LAVENDER}`, marginBottom: 12,
            }}>
              <Fact label="Layout" value={preview.format.preset_label} />
              <Fact label="Rows" value={String(preview.summary.rows)} />
              <Fact label="Money in" value={fmtMoney(preview.summary.money_in)} />
              <Fact label="Money out" value={fmtMoney(preview.summary.money_out)} />
              <Fact label="Would import" value={String(preview.summary.would_import)} />
              {preview.summary.duplicates > 0 && <Fact label="Already there" value={String(preview.summary.duplicates)} />}
              {preview.summary.rejected > 0 && <Fact label="Unreadable" value={String(preview.summary.rejected)} />}
            </div>

            <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 10, lineHeight: 1.5 }}>
              Read as <strong>{CONVENTION_TEXT[preview.format.convention] || preview.format.convention}</strong>
              {preview.format.day_first ? ", dates as DD/MM" : ", dates as MM/DD"}
              {preview.format.day_first_source === "proven" && " (proven by the file itself)"}
              {preview.format.day_first_source === "preset" && " (from the layout — check a date below)"}
              . <strong>Check the signs.</strong> If money in and money out are the wrong way round, pick a
              different layout above and upload again.
            </div>

            <DbTable
              columns={[
                { key: "row", label: "Row" },
                { key: "posted_date", label: "Date", type: "date" },
                { key: "description", label: "Description" },
                { key: "amount_signed", label: "Amount", type: "decimal" },
                { key: "state", label: "" },
              ]}
              rows={preview.rows.slice(0, 25).map((r) => ({
                ...r,
                state: r.duplicate ? <Pill tone="neutral">already there</Pill> : null,
              })) as never}
              empty={<DbEmpty title="No rows could be read from that file" />}
            />
            {preview.rows.length > 25 && (
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
                Showing the first 25 of {preview.rows.length}.
              </div>
            )}

            {preview.rejected.length > 0 && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "#FFFAEB", border: "1px solid #FEDF89", fontSize: 11, color: "#93370D", lineHeight: 1.6,
              }}>
                <strong>{preview.rejected.length} row{preview.rejected.length === 1 ? "" : "s"} could not be read</strong>
                {" "}and will be skipped:
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                  {preview.rejected.slice(0, 5).map((r) => <li key={r.row}>Row {r.row} — {r.reason}</li>)}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <DbButton onClick={commit} disabled={busy || preview.summary.would_import === 0}>
                {busy ? "Importing…" : `Import ${preview.summary.would_import} line${preview.summary.would_import === 1 ? "" : "s"}`}
              </DbButton>
              <DbButton variant="ghost" onClick={() => { setPreview(null); setFile(null); }}>Cancel</DbButton>
            </div>
          </div>
        )}
      </DbCard>

      <div style={{ height: 16 }} />

      <DbCard
        title={`What the bank says${unmatched.length ? ` — ${unmatched.length} unexplained` : ""}`}
        actions={
          <span style={{ display: "inline-flex", gap: 6 }}>
            <DbButton variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Unmatched only" : "Show all"}
            </DbButton>
            <DbButton onClick={autoMatch} disabled={busy || !unmatched.length}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Wand2 size={13} /> Match automatically
              </span>
            </DbButton>
          </span>
        }
      >
        {!lines ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "posted_date", label: "Date", type: "date" },
              { key: "description", label: "The bank's description" },
              { key: "amount_signed", label: "Amount", type: "decimal" },
              { key: "state", label: "Status" },
              { key: "action", label: "" },
            ]}
            rows={visible.map((l) => ({
              ...l,
              state: l.match_status === "matched"
                ? <Pill tone="good">{l.match_method === "auto" ? "matched" : l.match_method === "created" ? "booked" : "matched by hand"}</Pill>
                : l.match_status === "ignored" ? <Pill tone="neutral">ignored</Pill>
                : <Pill tone="warn">not in your books</Pill>,
              action: l.match_status === "matched" ? (
                <DbButton variant="ghost" onClick={() => unmatch(l)}>Unmatch</DbButton>
              ) : l.match_status === "ignored" ? null : (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <DbButton variant="ghost" onClick={() => setBooking(l)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <PlusCircle size={11} /> Book it
                    </span>
                  </DbButton>
                  <DbButton variant="ghost" onClick={() => ignore(l)} title="Not something to book">
                    <EyeOff size={11} />
                  </DbButton>
                </span>
              ),
            })) as never}
            empty={<DbEmpty
              title={showAll ? "No statement lines imported yet" : "Nothing unexplained"}
              reason={showAll
                ? "Upload the statement CSV above."
                : "Every line the bank sent is accounted for."} />}
          />
        )}
        <div style={{ marginTop: 10, fontSize: 10, color: "#94A3B8", display: "flex", gap: 5, alignItems: "center" }}>
          <Link2 size={11} />
          Matching pairs a statement line with a transaction of the same amount within three days. A line that
          could pair with more than one is left for you — guessing is how a reconciliation balances against the
          wrong entry.
        </div>
      </DbCard>

      {booking && (
        <BookLineModal
          line={booking}
          accounts={accounts}
          reconciliationId={reconciliationId}
          onClose={() => setBooking(null)}
          onDone={(msg) => { setBooking(null); showNotice(msg); loadLines(); onImported(); }}
        />
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

/** Book a statement line the books have never heard of. */
function BookLineModal({ line, accounts, reconciliationId, onClose, onDone }: {
  line: StatementLine;
  accounts: Account[];
  reconciliationId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const api = useStellaApi();
  const [coaId, setCoaId] = useState("");
  const [description, setDescription] = useState(line.description || "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const isIncome = line.amount_signed > 0;
  // Money in wants a revenue account, money out an expense one. Offering the
  // whole chart here is how "Fuel" ends up with a deposit in it.
  const choices = accounts.filter((a) => {
    const t = String(a.type).toLowerCase();
    return isIncome ? t === "revenue" : t === "expense" || t === "liability";
  });

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post(`/ledger/bank-statement-lines/${line.bank_statement_line_id}/create-transaction`, {
        coa_account_id: coaId,
        description: description.trim() || null,
        bank_reconciliation_id: reconciliationId,
      });
      onDone(`Booked ${fmtMoney(line.amount_signed)} and ticked it cleared.`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <DbModal title="Book this statement line" onClose={onClose} width={520}>
      <DbError error={error} />
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{
          padding: "10px 14px", borderRadius: 8, background: "#FAFBFF",
          border: `1px solid ${STELLA_LAVENDER}`, fontSize: 12, color: "#334155",
        }}>
          <div style={{ fontWeight: 600 }}>{line.description || "(no description on the statement)"}</div>
          <div style={{ marginTop: 4, color: "#5A7A8A" }}>
            {String(line.posted_date).slice(0, 10)} · <strong style={{ color: isIncome ? "#047857" : "#B42318" }}>
              {fmtMoney(line.amount_signed)}
            </strong> · {isIncome ? "money in" : "money out"}
          </div>
        </div>
        <DbField label="Description" hint="what this was, in your words">
          <DbSelectFreeText value={description} onChange={setDescription} />
        </DbField>
        <DbField label="Category" hint={isIncome ? "a revenue account" : "an expense or liability account"}>
          <DbSelect value={coaId} onChange={(e) => setCoaId(e.target.value)}>
            <option value="">— pick an account —</option>
            {choices.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
          </DbSelect>
        </DbField>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <DbButton onClick={submit} disabled={busy || !coaId}>{busy ? "Booking…" : "Book and clear"}</DbButton>
          <DbButton variant="ghost" onClick={onClose}>Cancel</DbButton>
        </div>
        <div style={{ fontSize: 10, color: "#94A3B8" }}>
          The bank account this statement belongs to is the other side of the entry, so the balance sheet moves
          the right account.
        </div>
      </div>
    </DbModal>
  );
}

/** A plain text input; named for symmetry with the DbSelect beside it. */
function DbSelectFreeText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      maxLength={400}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6,
        border: `1px solid ${STELLA_LAVENDER}`, background: "#fff", color: "#0B1C24",
      }}
    />
  );
}
