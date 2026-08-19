// SparkQuickAddGrid — type a stack of business cards straight into the CRM.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Adding twenty people from an event meant opening the full contact modal
// twenty times, then building a list, then bulk-adding them to it. The modal
// is right for one contact with all their detail; it is the wrong shape for
// twenty rows of name-and-email.
//
// So: a spreadsheet. Tab across the fields, Tab off the last one and a fresh
// row appears, Save all. Nothing to learn — everyone already knows how a
// spreadsheet behaves, which is exactly why this is the shape to copy.
//
// Opened with a listId it also files everyone into that list as they save, so
// "create the list, then add new people to it" is one pass instead of three.
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, AlertTriangle, Check, Users } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

const COLUMNS = [
  { key: "first_name", label: "First name", width: "w-[13%]", placeholder: "Dana" },
  { key: "last_name",  label: "Last name",  width: "w-[13%]", placeholder: "Whitfield" },
  { key: "email",      label: "Email",      width: "w-[24%]", placeholder: "dana@acme.com" },
  { key: "phone",      label: "Phone",      width: "w-[15%]", placeholder: "(555) 010-2233" },
  { key: "company",    label: "Company",    width: "w-[18%]", placeholder: "Acme Supply" },
  { key: "title",      label: "Title",      width: "w-[17%]", placeholder: "Operations Lead" },
] as const;

type ColKey = typeof COLUMNS[number]["key"];

interface BulkRowResult {
  index: number;
  ok: boolean;
  merged?: boolean;
  error?: string;
}
interface BulkCreateResponse {
  data: { created: number; merged: number; failed: number; results: BulkRowResult[] };
}
type RowStatus = "created" | "merged" | "failed";

interface Row {
  key: number;
  values: Record<ColKey, string>;
  status?: RowStatus;
  message?: string;
}

let nextKey = 1;
const blankRow = (): Row => ({
  key: nextKey++,
  values: { first_name: "", last_name: "", email: "", phone: "", company: "", title: "" },
});

const isEmpty = (r: Row) => COLUMNS.every((c) => !r.values[c.key].trim());
/** A row is only saveable if we can actually reach the person. */
const isReachable = (r: Row) => !!(r.values.email.trim() || r.values.phone.trim());

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, everyone saved is also added to this list. */
  listId?: number;
  listName?: string;
  /** Fired after a save that created or merged at least one contact. */
  onSaved?: (summary: { created: number; merged: number }) => void;
}

export function SparkQuickAddGrid({ open, onClose, listId, listName, onSaved }: Props) {
  const { post, ready } = useSparkApi();
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; merged: number; failed: number } | null>(null);

  // Focus is managed by hand because the grid grows: the input we want to
  // focus after "Tab on the last cell" does not exist yet when Tab fires.
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null>(null);

  const cellId = (rowKey: number, col: ColKey) => `${rowKey}:${col}`;

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = inputs.current.get(pendingFocus.current);
    pendingFocus.current = null;
    el?.focus();
    el?.select();
  }, [rows]);

  // Reset whenever the grid is reopened — a previous session's rows and
  // result banners reappearing would look like unsaved work.
  useEffect(() => {
    if (open) {
      setRows([blankRow(), blankRow(), blankRow()]);
      setError(null);
      setSummary(null);
    }
  }, [open]);

  const setCell = useCallback((rowKey: number, col: ColKey, value: string) => {
    setRows((prev) => prev.map((r) => (
      // Editing a row clears its previous result — the badge described the
      // old values and would otherwise sit there contradicting the new ones.
      r.key === rowKey ? { ...r, values: { ...r.values, [col]: value }, status: undefined, message: undefined } : r
    )));
  }, []);

  const addRow = useCallback((focusCol: ColKey = "first_name") => {
    const row = blankRow();
    pendingFocus.current = cellId(row.key, focusCol);
    setRows((prev) => [...prev, row]);
  }, []);

  const removeRow = useCallback((rowKey: number) => {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.key !== rowKey)));
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const lastCol = colIndex === COLUMNS.length - 1;
    const lastRow = rowIndex === rows.length - 1;

    // Tab off the very last cell: grow the grid rather than escaping to the
    // footer buttons. This is the whole interaction — keep typing, never
    // reach for the mouse.
    if (e.key === "Tab" && !e.shiftKey && lastCol && lastRow) {
      e.preventDefault();
      addRow();
      return;
    }
    // Enter behaves like a spreadsheet: commit and move down a row.
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (lastRow) addRow(COLUMNS[colIndex].key);
      else {
        pendingFocus.current = cellId(rows[rowIndex + 1].key, COLUMNS[colIndex].key);
        setRows((prev) => [...prev]);
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  // Paste a block from Excel or Google Sheets and have it land in the grid.
  // Anyone with more than a handful of contacts already has them in a
  // spreadsheet, and retyping what they could paste is busywork.
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return; // ordinary single-value paste
    e.preventDefault();

    const matrix = text
      .replace(/\r\n?/g, "\n")
      .replace(/\n+$/, "")
      .split("\n")
      .map((line) => line.split("\t"));

    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, values: { ...r.values } }));
      matrix.forEach((cells, dr) => {
        const target = rowIndex + dr;
        while (next.length <= target) next.push(blankRow());
        cells.forEach((cell, dc) => {
          const col = COLUMNS[colIndex + dc];
          if (col) next[target].values[col.key] = cell.trim();
        });
        next[target].status = undefined;
        next[target].message = undefined;
      });
      return next;
    });
  }

  const filled = rows.filter((r) => !isEmpty(r));
  const ready_rows = filled.filter(isReachable);
  const unreachable = filled.length - ready_rows.length;

  async function save() {
    if (!ready || saving) return;
    if (!ready_rows.length) {
      setError("Add at least one row with an email address or a phone number.");
      return;
    }
    setSaving(true);
    setError(null);
    setSummary(null);
    try {
      // Only rows with something in them go up, and their grid position rides
      // along so each result can be pinned back to the row that produced it.
      const payload = ready_rows.map((r) => ({
        first_name: r.values.first_name.trim() || undefined,
        last_name: r.values.last_name.trim() || undefined,
        email: r.values.email.trim() || undefined,
        phone: r.values.phone.trim() || undefined,
        company: r.values.company.trim() || undefined,
        title: r.values.title.trim() || undefined,
      }));

      const res = await post("/api/v1/contacts/bulk/create", {
        contacts: payload,
        ...(listId ? { list_id: listId } : {}),
      });
      // useSparkApi already unwraps some envelopes; accept either shape.
      const data = ((res as BulkCreateResponse)?.data ?? res) as BulkCreateResponse["data"];
      const results: BulkRowResult[] = data?.results || [];

      // Successful rows leave the grid; failed rows stay put with the reason,
      // so a typo in row 14 is fixed in place instead of retyped from scratch.
      const failedKeys = new Map<number, string>();
      results.forEach((r) => {
        if (!r.ok) failedKeys.set(ready_rows[r.index].key, r.error || "could not be saved");
      });

      setRows((prev) => {
        const kept = prev
          .filter((r) => isEmpty(r) || failedKeys.has(r.key) || !isReachable(r))
          .map((r) => (failedKeys.has(r.key)
            ? { ...r, status: "failed" as RowStatus, message: failedKeys.get(r.key) }
            : r));
        return kept.length ? kept : [blankRow(), blankRow(), blankRow()];
      });

      setSummary({ created: data?.created || 0, merged: data?.merged || 0, failed: data?.failed || 0 });
      if ((data?.created || 0) + (data?.merged || 0) > 0) {
        onSaved?.({ created: data?.created || 0, merged: data?.merged || 0 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these contacts.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · CONTACTS"
      title="Bulk add contacts"
      subtitle={listName ? `New contacts are added to ${listName}` : "Tab across the fields — Tab on the last one starts a new row"}
      size="info"
      footer={
        <>
          <button
            onClick={() => addRow()}
            className="mr-auto inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={save}
            disabled={saving || !ready_rows.length}
            icon={<Check className="h-3 w-3" />}
          >
            {saving
              ? "Saving…"
              : `Save ${ready_rows.length || ""} contact${ready_rows.length === 1 ? "" : "s"}`.replace("  ", " ")}
          </IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {(error || summary || unreachable > 0) && (
          <div className="flex-shrink-0 space-y-2 px-5 pt-4">
            {error && (
              <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}
            {summary && (
              <div className={`flex items-start gap-2 rounded border p-2.5 text-xs ${
                summary.failed
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}>
                <Users className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                <span>
                  {summary.created > 0 && <><strong>{summary.created}</strong> contact{summary.created === 1 ? "" : "s"} added</>}
                  {summary.created > 0 && summary.merged > 0 && ", "}
                  {summary.merged > 0 && (
                    <><strong>{summary.merged}</strong> already in your CRM{listId ? " — added to the list" : " — details updated"}</>
                  )}
                  {summary.failed > 0 && (
                    <>{(summary.created || summary.merged) ? ". " : ""}
                      <strong>{summary.failed}</strong> row{summary.failed === 1 ? "" : "s"} still need{summary.failed === 1 ? "s" : ""} attention below.</>
                  )}
                </span>
              </div>
            )}
            {unreachable > 0 && !error && (
              <div className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px text-amber-500" />
                <span>
                  {unreachable} row{unreachable === 1 ? "" : "s"} will be skipped — each contact needs an email address or a phone number.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-4">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`${c.width} border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-600`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="w-8 border-b border-slate-200 bg-slate-50" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.key} className={row.status === "failed" ? "bg-red-50/60" : undefined}>
                  {COLUMNS.map((col, colIndex) => (
                    <td key={col.key} className="border-b border-slate-100 p-0">
                      <input
                        ref={(el) => {
                          if (el) inputs.current.set(cellId(row.key, col.key), el);
                          else inputs.current.delete(cellId(row.key, col.key));
                        }}
                        value={row.values[col.key]}
                        onChange={(e) => setCell(row.key, col.key, e.target.value)}
                        onKeyDown={(e) => onKeyDown(e, rowIndex, colIndex)}
                        onPaste={(e) => onPaste(e, rowIndex, colIndex)}
                        placeholder={rowIndex === 0 ? col.placeholder : ""}
                        type={col.key === "email" ? "email" : col.key === "phone" ? "tel" : "text"}
                        autoComplete="off"
                        spellCheck={col.key === "email" ? false : undefined}
                        aria-label={`${col.label}, row ${rowIndex + 1}`}
                        className="w-full border-0 bg-transparent px-2 py-1.5 text-xs text-slate-900 outline-none placeholder:text-slate-300 focus:bg-orange-50 focus:ring-1 focus:ring-inset focus:ring-orange-400"
                      />
                    </td>
                  ))}
                  <td className="border-b border-slate-100 text-center align-middle">
                    <button
                      onClick={() => removeRow(row.key)}
                      title="Remove this row"
                      aria-label={`Remove row ${rowIndex + 1}`}
                      className="p-1 text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.some((r) => r.status === "failed") && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="pt-2">
                    {rows.filter((r) => r.status === "failed").map((r) => (
                      <div key={r.key} className="flex items-start gap-1.5 py-0.5 text-[11px] text-rose-700">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-px" />
                        <span>
                          {r.values.email || r.values.phone || "row"} — {r.message}
                        </span>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="mt-3 text-[11px] text-slate-400">
            Paste straight from a spreadsheet to fill several rows at once. Ctrl+Enter saves.
          </p>
        </div>
      </div>
    </IadmModal>
  );
}
