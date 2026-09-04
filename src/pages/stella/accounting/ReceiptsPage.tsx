// ReceiptsPage — snap or upload a receipt, type what is on it, book it.
//
// ═══ THE PROMISE CHANGED, AND IT CHANGED ON PURPOSE (Ops O-5 step b) ═══
//
// This page used to say "Photograph a receipt and STELLA reads it". The
// accuracy that sentence implies needs a PAID document service, which nobody
// has approved (feedback_poc_free_tier_only), so the page now says what it
// actually does: it stores the file and you type the details. That is receipt
// capture, it satisfies an audit, and it is honest.
//
// The free reader still exists behind STELLA_RECEIPT_OCR and, when an
// environment switches it on, PRE-FILLS the same fields. The page finds out
// from the API (`meta.ocr_enabled`), never from a hardcoded assumption — one
// source of truth for what the server is doing.
//
// MOBILE FIRST for the capture step, because that is where receipts are: the
// camera button uses capture="environment" so a phone opens the back camera
// straight into the form rather than into a file browser.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Camera, Upload, Pencil, Trash2, Paperclip } from "lucide-react";
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
  raw_receipt_ocr_id: string;
  ocr_status: string;
  ocr_engine: string | null;
  ocr_confidence: number | null;
  // what a reader guessed (only ever populated when OCR is switched on)
  parsed_vendor_guess: string | null;
  parsed_total: number | null;
  parsed_date: string | null;
  // what a person typed (migration 191)
  vendor_name: string | null;
  receipt_date: string | null;
  receipt_amount: number | null;
  tax_amount: number | null;
  coa_account_id: string | null;
  coa_code: string | null;
  coa_name: string | null;
  notes: string | null;
  file_name: string | null;
  content_type: string | null;
  capture_mode: string | null;
  // resolved by the API so the page never has to pick
  effective_vendor: string | null;
  effective_amount: number | null;
  effective_date: string | null;
  ready_to_book: boolean;
  promoted_to_transaction_id: string | null;
  error_message: string | null;
  created_at: string;
};

type ListMeta = {
  ocr_engine: string;
  ocr_enabled: boolean;
  storage_blocked_reason: string | null;
  capture_mode_note: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const isPdf = (r: Receipt) => /pdf/i.test(r.content_type || "") || /\.pdf$/i.test(r.file_name || "");

export function StellaReceiptsPage() {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [rows, setRows] = useState<Receipt[] | null>(null);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [booking, setBooking] = useState<Receipt | null>(null);

  // The details typed alongside the file, so one action captures the whole
  // receipt instead of an upload followed by a form nobody goes back to.
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [coaId, setCoaId] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Receipt[]; meta: ListMeta }>("/ledger/receipts")
      .then((r) => { setRows(r.data); setMeta(r.meta); })
      .catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.get<Account[]>("/ledger/coa?active=true")
      .then((a) => setAccounts(a.filter((x) => String(x.type).toLowerCase() === "expense")))
      .catch(setError);
  }, [api]);

  function resetForm() {
    setVendor(""); setDate(today()); setAmount(""); setTax(""); setCoaId(""); setNotes("");
  }

  async function onFile(f: File | null) {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      // Empty strings are omitted, not sent — an empty value must never
      // overwrite something (feedback_2026_06_17_lessons).
      if (vendor.trim()) fd.append("vendor_name", vendor.trim());
      if (date) fd.append("receipt_date", date);
      if (amount.trim()) fd.append("receipt_amount", amount.trim());
      if (tax.trim()) fd.append("tax_amount", tax.trim());
      if (coaId) fd.append("coa_account_id", coaId);
      if (notes.trim()) fd.append("notes", notes.trim());
      const r = await stellaUpload<{ data: Receipt }>(instance, account, "/ledger/receipts", fd, tenantOverride);
      showNotice(r.data.ready_to_book
        ? "Stored — it is ready to book."
        : "Stored. Add the missing details and then book it.");
      resetForm();
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function remove(r: Receipt) {
    if (!window.confirm("Delete this receipt? The image goes with it.")) return;
    try {
      await api.del(`/ledger/receipts/${r.raw_receipt_ocr_id}`);
      showNotice("Receipt deleted.");
      load();
    } catch (e) { setError(e); }
  }

  const unbooked = useMemo(() => (rows || []).filter((r) => !r.promoted_to_transaction_id).length, [rows]);
  const storageBlocked = meta?.storage_blocked_reason || null;

  return (
    <StellaShell
      title="Receipts"
      subtitle="Keep the paper with the books — upload or photograph a receipt, type what is on it, and book it to the right category."
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      {storageBlocked && (
        // Loud, not hidden. A page that silently accepts uploads it cannot
        // store is how a receipt ends up in the ledger with no image behind it.
        <>
          <div style={{
            background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 8,
            padding: "10px 14px", fontSize: 12, color: "#B42318", lineHeight: 1.5,
          }}>
            <strong>Receipts cannot be stored on this server.</strong> {storageBlocked}
          </div>
          <div style={{ height: 16 }} />
        </>
      )}

      <DbCard title="Add a receipt">
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{
            display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}>
            <DbField label="Vendor">
              <DbInput value={vendor} maxLength={300} placeholder="Who you paid"
                onChange={(e) => setVendor(e.target.value)} />
            </DbField>
            <DbField label="Date">
              <DbInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </DbField>
            <DbField label="Total">
              <DbInput inputMode="decimal" value={amount} placeholder="0.00"
                onChange={(e) => setAmount(e.target.value)} />
            </DbField>
            <DbField label="Sales tax" hint="optional">
              <DbInput inputMode="decimal" value={tax} placeholder="0.00"
                onChange={(e) => setTax(e.target.value)} />
            </DbField>
            <DbField label="Category">
              <DbSelect value={coaId} onChange={(e) => setCoaId(e.target.value)}>
                <option value="">— pick an expense account —</option>
                {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
              </DbSelect>
            </DbField>
            <DbField label="Notes" hint="optional">
              <DbInput value={notes} maxLength={2000} placeholder="What it was for"
                onChange={(e) => setNotes(e.target.value)} />
            </DbField>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* capture="environment" opens the back camera on a phone; on a
                desktop the attribute is ignored and this is a file picker. */}
            <label style={captureButton(busy || !!storageBlocked)}>
              <Camera size={14} />
              <span>{busy ? "Saving…" : "Take a photo"}</span>
              <input type="file" accept="image/*" capture="environment" disabled={busy || !!storageBlocked}
                onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }}
                style={{ display: "none" }} />
            </label>
            <label style={captureButton(busy || !!storageBlocked, true)}>
              <Upload size={14} />
              <span>Choose a file</span>
              <input type="file" accept="image/*,.pdf" disabled={busy || !!storageBlocked}
                onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }}
                style={{ display: "none" }} />
            </label>
            <span style={{ flex: 1 }} />
            <Pill tone={meta?.ocr_enabled ? "brand" : "neutral"}>
              {meta?.ocr_enabled ? `reader: ${meta.ocr_engine}` : "you type the details"}
            </Pill>
          </div>

          <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
            {meta?.capture_mode_note
              || "You type the details from the receipt. The file is stored and stays attached to the transaction."}
          </div>
        </div>
      </DbCard>

      <div style={{ height: 16 }} />

      <DbCard title={unbooked ? `Receipts — ${unbooked} still to book` : "Receipts"}>
        {!rows ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "created_at", label: "Added", type: "datetime" },
              { key: "vendor", label: "Vendor" },
              { key: "effective_amount", label: "Total", type: "decimal" },
              { key: "effective_date", label: "Date", type: "date" },
              { key: "category", label: "Category" },
              { key: "state", label: "Status" },
              { key: "action", label: "" },
            ]}
            rows={rows.map((r) => ({
              ...r,
              vendor: r.effective_vendor || <span style={{ color: "#C7D0DB" }}>—</span>,
              category: r.coa_code ? `${r.coa_code} · ${r.coa_name}` : <span style={{ color: "#C7D0DB" }}>—</span>,
              state: r.promoted_to_transaction_id
                ? <Pill tone="good">booked</Pill>
                : r.ready_to_book ? <Pill tone="brand">ready</Pill>
                : <Pill tone="warn">needs details</Pill>,
              action: r.promoted_to_transaction_id ? null : (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <DbButton variant="ghost" onClick={() => setEditing(r)} title="Edit the details">
                    <Pencil size={12} />
                  </DbButton>
                  <DbButton variant="ghost" onClick={() => setBooking(r)}>Book it</DbButton>
                  <DbButton variant="ghost" onClick={() => remove(r)} title="Delete">
                    <Trash2 size={12} />
                  </DbButton>
                </span>
              ),
            })) as never}
            empty={<DbEmpty title="No receipts yet" reason="Add one above — a photo from your phone works." />}
          />
        )}
      </DbCard>

      {editing && (
        <EditModal
          receipt={editing} accounts={accounts}
          onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); showNotice(msg); load(); }}
        />
      )}
      {booking && (
        <BookModal
          receipt={booking} accounts={accounts}
          onClose={() => setBooking(null)}
          onDone={(msg) => { setBooking(null); showNotice(msg); load(); }}
        />
      )}
    </StellaShell>
  );
}

function captureButton(disabled: boolean, ghost = false): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7,
    // 40px tall so it is a comfortable tap target on a phone.
    padding: "10px 16px", minHeight: 40, borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    background: ghost ? "#FFFFFF" : STELLA_INDIGO,
    color: ghost ? STELLA_INDIGO : "#FFFFFF",
    border: `1px solid ${ghost ? STELLA_LAVENDER : STELLA_INDIGO}`,
  };
}

/** The stored file, next to the form. A PDF gets an object, an image an img. */
function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  const src = `${STELLA_API_BASE}/ledger/receipts/${receipt.raw_receipt_ocr_id}/file`;
  const frame: React.CSSProperties = {
    width: "100%", height: 340, border: `1px solid ${STELLA_LAVENDER}`,
    borderRadius: 8, background: "#FAFBFF",
  };
  return (
    <div>
      {isPdf(receipt)
        ? <object data={src} type="application/pdf" style={frame} aria-label="Receipt PDF">
            <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open the PDF</a>
          </object>
        : <img src={src} alt="Receipt"
            style={{ ...frame, height: "auto", maxHeight: 340, objectFit: "contain", display: "block" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
      {receipt.file_name && (
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>{receipt.file_name}</div>
      )}
      {receipt.ocr_confidence != null && (
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
          A reader pre-filled these at {receipt.ocr_confidence}% confidence — check every figure.
        </div>
      )}
    </div>
  );
}

/** Edit the typed fields without booking. */
function EditModal({ receipt, accounts, onClose, onDone }: {
  receipt: Receipt; accounts: Account[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const api = useStellaApi();
  const [vendor, setVendor] = useState(receipt.vendor_name || receipt.parsed_vendor_guess || "");
  const [date, setDate] = useState(receipt.effective_date || today());
  const [amount, setAmount] = useState(receipt.effective_amount != null ? String(receipt.effective_amount) : "");
  const [tax, setTax] = useState(receipt.tax_amount != null ? String(receipt.tax_amount) : "");
  const [coaId, setCoaId] = useState(receipt.coa_account_id || "");
  const [notes, setNotes] = useState(receipt.notes || "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.patch(`/ledger/receipts/${receipt.raw_receipt_ocr_id}`, {
        vendor_name: vendor.trim() || null,
        receipt_date: date || null,
        receipt_amount: amount.trim() === "" ? null : Number(amount),
        tax_amount: tax.trim() === "" ? null : Number(tax),
        coa_account_id: coaId || null,
        notes: notes.trim() || null,
      });
      onDone("Receipt updated.");
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <DbModal title="Edit this receipt" onClose={onClose} width={720}>
      <DbError error={error} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <ReceiptPreview receipt={receipt} />
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <DbField label="Vendor"><DbInput value={vendor} maxLength={300} onChange={(e) => setVendor(e.target.value)} autoFocus /></DbField>
          <DbField label="Date"><DbInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></DbField>
          <DbField label="Total"><DbInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></DbField>
          <DbField label="Sales tax" hint="optional — kept separate so it can be reported"><DbInput inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></DbField>
          <DbField label="Category">
            <DbSelect value={coaId} onChange={(e) => setCoaId(e.target.value)}>
              <option value="">— pick an expense account —</option>
              {accounts.map((a) => <option key={a.coa_account_id} value={a.coa_account_id}>{a.code} · {a.name}</option>)}
            </DbSelect>
          </DbField>
          <DbField label="Notes"><DbInput value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></DbField>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <DbButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</DbButton>
            <DbButton variant="ghost" onClick={onClose}>Cancel</DbButton>
          </div>
        </div>
      </div>
    </DbModal>
  );
}

/** Confirm and book. Nothing reaches the ledger without passing through here. */
function BookModal({ receipt, accounts, onClose, onDone }: {
  receipt: Receipt; accounts: Account[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const api = useStellaApi();
  const [amount, setAmount] = useState(receipt.effective_amount != null ? String(receipt.effective_amount) : "");
  const [date, setDate] = useState(receipt.effective_date || today());
  const [description, setDescription] = useState(receipt.effective_vendor || "");
  const [tax, setTax] = useState(receipt.tax_amount != null ? String(receipt.tax_amount) : "");
  const [coaId, setCoaId] = useState(receipt.coa_account_id || "");
  const [reimbursable, setReimbursable] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const taxTooBig = tax.trim() !== "" && Number(tax) > Number(amount || 0);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post(`/ledger/receipts/${receipt.raw_receipt_ocr_id}/promote`, {
        amount: Number(amount), posted_date: date, description: description.trim() || null,
        tax_amount: tax.trim() === "" ? null : Number(tax),
        coa_account_id: coaId, is_reimbursable: reimbursable,
      });
      onDone(`Booked ${fmtMoney(Number(amount))} to your ledger.`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <DbModal title="Book this receipt" onClose={onClose} width={720}>
      <DbError error={error} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <ReceiptPreview receipt={receipt} />
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <DbField label="Total" hint="check it against the paper before you book">
            <DbInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </DbField>
          <DbField label="Date"><DbInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></DbField>
          <DbField label="Description"><DbInput value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} /></DbField>
          <DbField label="Sales tax" hint={taxTooBig ? "the tax cannot be more than the total" : "optional"}>
            <DbInput inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </DbField>
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
            <DbButton onClick={submit} disabled={busy || !Number(amount) || !coaId || taxTooBig}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Check size={13} /> {busy ? "Booking…" : "Book it"}
              </span>
            </DbButton>
            <DbButton variant="ghost" onClick={onClose}>Cancel</DbButton>
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", display: "flex", gap: 5, alignItems: "center" }}>
            <Paperclip size={11} /> The file stays attached to the transaction.
          </div>
        </div>
      </div>
    </DbModal>
  );
}
