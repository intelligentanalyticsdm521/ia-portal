// ReceiptsPage — snap a receipt, confirm what STELLA read, book it.
//
// The review step is NOT optional. OCR is confidently wrong often enough that
// auto-posting what it read would put invented numbers in someone's books, so
// STELLA proposes and a human confirms. The pre-filled fields are a
// convenience, never an authority — which is why the amount is editable and
// promoting without one is refused rather than guessed.
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { stellaUpload, STELLA_API_BASE } from "../../../lib/stellaApi";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbTable,
  DbEmpty, DbNotice, useNotice, Pill, DbModal,
} from "../dbmanager/DbManagerKit";

type Account = { coa_account_id: string; code: string; name: string; type: string };
type Receipt = {
  raw_receipt_ocr_id: string; ocr_status: string; ocr_engine: string | null; ocr_confidence: number | null;
  parsed_vendor_guess: string | null; parsed_total: number | null; parsed_date: string | null;
  promoted_to_transaction_id: string | null; error_message: string | null; created_at: string;
};

export function StellaReceiptsPage() {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [rows, setRows] = useState<Receipt[] | null>(null);
  const [engine, setEngine] = useState<string>("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Receipt | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Receipt[]; meta: { ocr_engine: string } }>("/ledger/receipts")
      .then((r) => { setRows(r.data); setEngine(r.meta.ocr_engine); })
      .catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.get<Account[]>("/ledger/coa?active=true")
      .then((a) => setAccounts(a.filter((x) => String(x.type).toLowerCase() === "expense")))
      .catch(setError);
  }, [api]);

  async function onFile(f: File | null) {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await stellaUpload<{ data: Receipt }>(instance, account, "/ledger/receipts", fd, tenantOverride);
      showNotice(r.data.parsed_total
        ? `Read ${fmtMoney(r.data.parsed_total)} — check it before booking.`
        : "Stored. STELLA couldn't read a total, so type it in.");
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <StellaShell
      title="Receipts"
      subtitle="Photograph a receipt and STELLA reads it — you confirm the numbers before anything reaches your books."
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard title="Add a receipt">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept="image/*,.pdf" disabled={busy}
            onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }}
            style={{ fontSize: 12 }} />
          {busy && <span style={{ fontSize: 12, color: STELLA_INDIGO }}>Reading…</span>}
          <span style={{ flex: 1 }} />
          <Pill tone={engine === "manual" ? "neutral" : "brand"}>
            {engine === "manual" ? "manual entry" : `reader: ${engine}`}
          </Pill>
        </div>
        {engine === "manual" && (
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 10, lineHeight: 1.5 }}>
            Automatic reading isn't available on this server, so receipts are stored and you fill in the details.
            The image stays attached to the transaction either way.
          </div>
        )}
      </DbCard>

      <div style={{ height: 16 }} />

      <DbCard title="Receipts">
        {!rows ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "created_at", label: "Added", type: "datetime" },
              { key: "vendor", label: "Vendor" },
              { key: "parsed_total", label: "Total", type: "decimal" },
              { key: "parsed_date", label: "Date", type: "date" },
              { key: "state", label: "Status" },
              { key: "action", label: "" },
            ]}
            rows={rows.map((r) => ({
              ...r,
              vendor: r.parsed_vendor_guess || <span style={{ color: "#C7D0DB" }}>—</span>,
              state: r.promoted_to_transaction_id
                ? <Pill tone="good">booked</Pill>
                : r.ocr_status === "parsed" ? <Pill tone="brand">read — check it</Pill>
                : <Pill tone="warn">needs your input</Pill>,
              action: r.promoted_to_transaction_id ? null : (
                <DbButton variant="ghost" onClick={() => setReview(r)}>Review &amp; book</DbButton>
              ),
            })) as never}
            empty={<DbEmpty title="No receipts yet" reason="Upload one above — a photo from your phone works." />}
          />
        )}
      </DbCard>

      {review && (
        <ReviewModal
          receipt={review} accounts={accounts}
          tenantOverride={tenantOverride}
          onClose={() => setReview(null)}
          onDone={(msg) => { setReview(null); showNotice(msg); load(); }}
        />
      )}
    </StellaShell>
  );
}

function ReviewModal({ receipt, accounts, onClose, onDone }: {
  receipt: Receipt; accounts: Account[]; tenantOverride?: string | null;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const api = useStellaApi();
  const [amount, setAmount] = useState(receipt.parsed_total != null ? String(receipt.parsed_total) : "");
  const [date, setDate] = useState(receipt.parsed_date ? String(receipt.parsed_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(receipt.parsed_vendor_guess || "");
  const [coaId, setCoaId] = useState("");
  const [reimbursable, setReimbursable] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post(`/ledger/receipts/${receipt.raw_receipt_ocr_id}/promote`, {
        amount: Number(amount), posted_date: date, description: description.trim() || null,
        coa_account_id: coaId, is_reimbursable: reimbursable,
      });
      onDone("Booked to your ledger.");
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <DbModal title="Check this receipt" onClose={onClose} width={720}>
      <DbError error={error} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div>
          {/* The image is served through the API, not the private blob URL. */}
          <img
            src={`${STELLA_API_BASE}/ledger/receipts/${receipt.raw_receipt_ocr_id}/image`}
            alt="Receipt"
            style={{ width: "100%", maxHeight: 380, objectFit: "contain", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, background: "#FAFBFF" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {receipt.ocr_confidence != null && (
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
              Read with {receipt.ocr_confidence}% confidence — always worth a glance.
            </div>
          )}
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <DbField label="Amount" hint={receipt.parsed_total ? "Pre-filled from the image — correct it if it's wrong" : "STELLA couldn't read a total"}>
            <DbInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </DbField>
          <DbField label="Date"><DbInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></DbField>
          <DbField label="Description"><DbInput value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} /></DbField>
          <DbField label="Category">
            <DbSelect value={coaId} onChange={(e) => setCoaId(e.target.value)}>
              <option value="">— pick an expense account —</option>
              {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
            </DbSelect>
          </DbField>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#334155" }}>
            <input type="checkbox" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} />
            I paid this personally — the business owes me
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <DbButton onClick={submit} disabled={busy || !Number(amount) || !coaId}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Check size={13} /> {busy ? "Booking…" : "Book it"}
              </span>
            </DbButton>
            <DbButton variant="ghost" onClick={onClose}>Cancel</DbButton>
          </div>
        </div>
      </div>
    </DbModal>
  );
}
