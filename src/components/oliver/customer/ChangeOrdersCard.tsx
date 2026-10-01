/**
 * ChangeOrdersCard — the job modal's change orders (on-site flow v1, Phase C,
 * G5, 1 Oct 2026). Sits under the job's line items.
 *
 * Lists every change order on the job from GET /jobs/:id/change-orders: the
 * reason, the lines added and taken off, the change in price, the status in
 * plain words, and "Signed by {name} on {date}" once the customer signed.
 * "New change order" opens an editor with the same line editor the job's line
 * items use (catalogue or custom lines) plus a tick list of the job's current
 * lines to take off, and posts to POST /jobs/:id/change-orders — the office
 * route of the same API the crew app uses. A saved change order is a draft;
 * "Open for the customer to sign" (POST …/:coId/present) lets the customer
 * sign it from their link or on the crew's tablet, and only then does it
 * change the job's lines (the API applies it on accept).
 *
 * The lines a change order may take off are the job's AGREED lines from the
 * same GET (`agreed_lines`) — for a job agreed by quote those are the quote's
 * lines, not the job's own line items — falling back to the job's saved lines
 * only when the API sends none.
 *
 * Pure rules live in lib/onsiteJob.ts (test/onsite-job.test.mjs).
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui";
import { CatalogLineItemPicker, type LineItem } from "../CatalogLineItemPicker";
import {
  changeOrderBody, changeOrderDelta, changeOrderError, changeOrderProblem, changeOrderSavedNote,
  changeOrderSignedLine, changeOrderStatusLabel, changeOrderStatusTone, changeOrdersPath,
  deltaLabel, money, presentChangeOrderPath, PRESENTED_NOTE, readAgreedLines, readChangeOrders,
  type ChangeOrderRow, type JobLine,
} from "../../../lib/onsiteJob";

export function ChangeOrdersCard({
  jobId, api, jobLines, disabled, onChanged,
}: {
  jobId: string;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
  };
  /** The job's saved lines — what a change order can take off when the API sends no agreed lines. */
  jobLines: LineItem[];
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ChangeOrderRow[] | null>(null);
  const [agreed, setAgreed] = useState<JobLine[]>([]);
  const [presenting, setPresenting] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [adds, setAdds] = useState<LineItem[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await api.get<unknown>(changeOrdersPath(jobId));
      setRows(readChangeOrders(r));
      setAgreed(readAgreedLines(r));
    } catch (e) {
      setRows([]);
      setLoadErr(changeOrderError("load", e));
    }
  }, [api, jobId]);

  useEffect(() => { void load(); }, [load]);

  const removable: JobLine[] = agreed.length ? agreed : jobLines.filter((l) => !!l.id);
  const removed = removable.filter((l) => removeIds.includes(l.id as string));
  const delta = changeOrderDelta(adds, removed);

  function openEditor() {
    setReason(""); setAdds([]); setRemoveIds([]); setProblem(null); setNote(null);
    setEditing(true);
  }

  async function save() {
    const p = changeOrderProblem(reason, adds, removeIds);
    if (p) { setProblem(p); return; }
    setSaving(true); setProblem(null);
    try {
      const resp = await api.post<unknown>(changeOrdersPath(jobId), changeOrderBody(reason, adds, removeIds));
      setEditing(false);
      setNote(changeOrderSavedNote(resp));
      await load();
      onChanged?.();
    } catch (e) {
      setProblem(changeOrderError("save", e));
    } finally {
      setSaving(false);
    }
  }

  async function present(row: ChangeOrderRow) {
    setPresenting(row.id); setNote(null); setLoadErr(null);
    try {
      await api.post<unknown>(presentChangeOrderPath(jobId, row.id), {});
      setNote(PRESENTED_NOTE);
      await load();
    } catch (e) {
      setLoadErr(changeOrderError("present", e));
    } finally {
      setPresenting(null);
    }
  }

  async function copyLink(row: ChangeOrderRow) {
    if (!row.customerLink) return;
    try {
      await navigator.clipboard.writeText(row.customerLink);
      setCopied(row.id);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }} data-testid="change-orders">
      <div className="card-hdr">
        <div>
          <div className="card-ttl">Change orders</div>
          <div className="card-sub">
            Work added or taken off after the price was agreed. The customer signs each one before it changes the job.
          </div>
        </div>
        {!editing && !disabled && (
          <Button variant="secondary" onClick={openEditor}>New change order</Button>
        )}
      </div>

      {note && (
        <div role="status" style={{ marginBottom: 10, background: "#DCFCE7", border: "1px solid #BBF7D0", color: "#166534", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{note}</div>
      )}
      {loadErr && (
        <div role="alert" style={{ marginBottom: 10, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{loadErr}</div>
      )}

      {editing && (
        <div style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: 12, marginBottom: 12, background: "#F8FAFC" }} data-testid="change-order-editor">
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0B1C24", marginBottom: 4 }}>
            Why is the job changing?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="For example: the customer asked for the back fence line as well"
            style={{ width: "100%", border: "1px solid #CBD5E1", borderRadius: 6, padding: "6px 8px", fontSize: 12, background: "#fff" }}
          />

          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", margin: "12px 0 6px" }}>Add to the job</div>
          <CatalogLineItemPicker items={adds} onChange={setAdds} />

          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", margin: "14px 0 6px" }}>Take off the job</div>
          {removable.length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic" }}>The job has no saved lines to take off.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {removable.map((l) => {
                const on = removeIds.includes(l.id as string);
                return (
                  <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#0B1C24" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setRemoveIds((cur) => on ? cur.filter((x) => x !== l.id) : [...cur, l.id as string])}
                    />
                    <span style={{ flex: 1, textDecoration: on ? "line-through" : "none" }}>{l.description || "(no description)"}</span>
                    <span style={{ fontFamily: "monospace", color: "#5A7A8A" }}>{l.quantity} × {money(Number(l.unit_price))}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 12, fontSize: 12 }} data-testid="change-order-preview">
            <span style={{ color: "#5A7A8A" }}>Change before tax: <strong style={{ color: "#0B1C24", fontFamily: "monospace" }}>{deltaLabel(delta)}</strong></span>
          </div>

          {problem && (
            <div role="alert" style={{ marginTop: 10, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{problem}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Button variant="ghost" onClick={() => { setEditing(false); setProblem(null); }} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save change order"}</Button>
          </div>
        </div>
      )}

      {rows === null ? (
        <div style={{ fontSize: 11, color: "#5A7A8A", padding: "8px 0" }}>Loading change orders…</div>
      ) : rows.length === 0 && !loadErr ? (
        <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No change orders on this job.</div>
      ) : (
        rows.map((row) => {
          const tone = changeOrderStatusTone(row.status);
          const signed = changeOrderSignedLine(row);
          return (
            <div key={row.id} style={{ borderTop: "1px solid #F1F5F9", padding: "10px 0" }} data-testid="change-order-row">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.fg }}>
                  {changeOrderStatusLabel(row.status)}
                </span>
                <span style={{ flex: 1, minWidth: 160, fontSize: 12, color: "#0B1C24", fontWeight: 600 }}>{row.reason || "(no reason given)"}</span>
                {row.delta !== null && (
                  <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#0B1C24" }}>{deltaLabel(row.delta)}</span>
                )}
              </div>
              {row.lines.length > 0 && (
                <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
                  {row.lines.map((l, i) => (
                    <li key={i} style={{ display: "flex", gap: 8, fontSize: 11, color: l.kind === "remove" ? "#991B1B" : "#166534", padding: "2px 0" }}>
                      <span style={{ width: 70, flexShrink: 0 }}>{l.kind === "remove" ? "Taken off" : "Added"}</span>
                      <span style={{ flex: 1, color: "#0B1C24", textDecoration: l.kind === "remove" ? "line-through" : "none" }}>{l.description}</span>
                      {l.quantity !== null && l.unitPrice !== null && (
                        <span style={{ fontFamily: "monospace", color: "#5A7A8A" }}>{l.quantity} × {money(l.unitPrice)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4, fontSize: 11, color: "#5A7A8A" }}>
                {signed && <span data-testid="change-order-signed" style={{ color: "#166534" }}>{signed}</span>}
                {!signed && row.status === "declined" && row.decidedAt && (
                  <span>Declined on {new Date(row.decidedAt).toLocaleString()}</span>
                )}
                {row.createdAt && <span>Made {new Date(row.createdAt).toLocaleString()}</span>}
                {row.status === "draft" && !disabled && (
                  <button
                    type="button"
                    onClick={() => { void present(row); }}
                    disabled={presenting !== null}
                    style={{ background: "none", border: "none", padding: 0, color: "#1A7DB5", cursor: "pointer", fontSize: 11, fontWeight: 600, textDecoration: "underline" }}
                  >
                    {presenting === row.id ? "Opening…" : "Open for the customer to sign"}
                  </button>
                )}
                {row.customerLink && row.status === "presented" && (
                  <button
                    type="button"
                    onClick={() => { void copyLink(row); }}
                    style={{ background: "none", border: "none", padding: 0, color: "#1A7DB5", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
                  >
                    {copied === row.id ? "Link copied" : "Copy the customer's signing link"}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
