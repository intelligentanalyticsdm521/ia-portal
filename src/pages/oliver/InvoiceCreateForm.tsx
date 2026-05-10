import { useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface JobListItem {
  id: string;
  title: string;
  customerName: string;
  status: string;
}

interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  is_tax: boolean;
}

interface CreateInvoiceProps {
  onCreated: () => void;
  onCancel: () => void;
}

const blankItem: LineItemDraft = { description: "", quantity: 1, unit_price: 0, is_tax: false };
const blankTaxItem: LineItemDraft = { description: "Sales Tax", quantity: 1, unit_price: 0, is_tax: true };

export function InvoiceCreateForm({ onCreated, onCancel }: CreateInvoiceProps) {
  const { get, post, ready } = useOliverApi();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [items, setItems] = useState<LineItemDraft[]>([{ ...blankItem }]);
  const [dueDate, setDueDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const resCompleted = await get<JobListItem[]>("/jobs?status=completed&per_page=50");
        const resInvoiced = await get<JobListItem[]>("/jobs?status=invoiced&per_page=50");
        setJobs([...(resCompleted || []), ...(resInvoiced || [])]);
      } catch (e) {
        setError(`Failed to load jobs: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items) {
      const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
      if (it.is_tax) tax += lineTotal;
      else subtotal += lineTotal;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  function updateItem(idx: number, patch: Partial<LineItemDraft>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addLine() { setItems((prev) => [...prev, { ...blankItem }]); }
  function addTaxLine() { setItems((prev) => [...prev, { ...blankTaxItem }]); }

  async function submit() {
    setError(null);
    if (!selectedJobId) {
      setError("Pick a job first.");
      return;
    }
    const cleanedItems = items.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
    if (!cleanedItems.length) {
      setError("Add at least one line item.");
      return;
    }
    setSubmitting(true);
    try {
      await post("/invoices", {
        job_id: selectedJobId,
        line_items: cleanedItems,
        due_date: dueDate || null,
      });
      onCreated();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("stripe_not_connected") || msg.includes("412")) {
        setError("Your Stripe account isn't connected yet. Go to Settings → Payments to finish setup, then return here.");
      } else {
        setError(`Create failed: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">New invoice</h3>
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-slate-700 font-medium">Job</span>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Pick a completed/invoiced job —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title || "(untitled)"} — {j.customerName} ({j.status})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-slate-700 font-medium">Due date (optional)</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-700">Line items</h4>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addLine}
              className="rounded-lg ring-1 ring-gray-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-gray-50"
            >
              + Add line
            </button>
            <button
              type="button"
              onClick={addTaxLine}
              className="rounded-lg ring-1 ring-amber-300 px-3 py-1.5 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100"
            >
              + Add tax line
            </button>
          </div>
        </div>

        <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
          {items.map((it, i) => (
            <div key={i} className={`grid grid-cols-12 gap-2 px-3 py-2 items-center ${it.is_tax ? "bg-amber-50/50" : ""}`}>
              <input
                type="text"
                placeholder={it.is_tax ? "e.g. Iowa Sales Tax 6%" : "Description"}
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                className="col-span-6 rounded ring-1 ring-gray-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                className="col-span-2 rounded ring-1 ring-gray-300 px-2 py-1 text-sm text-right"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Unit $"
                value={it.unit_price}
                onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                className="col-span-3 rounded ring-1 ring-gray-300 px-2 py-1 text-sm text-right"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="col-span-1 text-slate-400 hover:text-red-600 text-lg"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <div className="text-sm w-64 space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>${totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.tax > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>Tax</span>
              <span>${totals.tax.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-slate-900 pt-1 border-t border-gray-200">
            <span>Total</span>
            <span>${totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg ring-1 ring-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || !selectedJobId || !items.length}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create invoice (draft)"}
        </button>
      </div>
    </div>
  );
}
