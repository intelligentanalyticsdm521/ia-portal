import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { InvoiceCreateForm } from "./InvoiceCreateForm";

interface Invoice {
  id: string;
  invoiceNumber: string;
  jobTitle: string;
  amount: number;
  status: string;
  stripePaymentLink: string | null;
  createdAt: string;
}

export function OliverInvoicesPage() {
  const { get, post, ready } = useOliverApi();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<Invoice[]>("/invoices");
      setInvoices(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (!ready) return;
    reload();
  }, [ready, reload]);

  async function handleSend(invoiceId: string) {
    setActionLoading(invoiceId);
    try {
      const updated = await post<Invoice>(`/invoices/${invoiceId}/send`);
      setInvoices((prev) => prev.map((inv) => inv.id === invoiceId ? { ...inv, ...updated, status: "sent" } : inv));
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg.includes("stripe_not_connected") || msg.includes("412")) {
        alert("Stripe is not connected yet. Go to Settings → Payments to finish onboarding before sending invoices.");
      } else {
        alert(`Send failed: ${msg}`);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefund(invoiceId: string) {
    if (!confirm("Issue a full refund for this invoice?")) return;
    setActionLoading(invoiceId);
    try {
      await post(`/invoices/${invoiceId}/refund`);
      await reload();
    } catch (err) {
      alert(`Refund failed: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-50 text-blue-700",
    paid: "bg-green-50 text-green-700",
    refunded: "bg-purple-50 text-purple-700",
    void: "bg-red-50 text-red-700",
  };

  return (
    <OliverPageWrapper title="Invoices" subtitle="Invoice management" error={error} loading={loading}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
            <p className="mt-1 text-sm text-slate-500">Invoice management</p>
          </div>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Create invoice
            </button>
          )}
        </div>

        {showCreate && (
          <InvoiceCreateForm
            onCreated={() => { setShowCreate(false); reload(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.jobTitle}</td>
                  <td className="px-4 py-3 text-right text-slate-700">${Number(inv.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[inv.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {inv.status === "draft" && (
                      <button
                        onClick={() => handleSend(inv.id)}
                        disabled={actionLoading === inv.id}
                        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                    {inv.status === "paid" && (
                      <button
                        onClick={() => handleRefund(inv.id)}
                        disabled={actionLoading === inv.id}
                        className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      >
                        Refund
                      </button>
                    )}
                    {inv.stripePaymentLink && (
                      <a
                        href={inv.stripePaymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        Open in Stripe
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OliverPageWrapper>
  );
}
