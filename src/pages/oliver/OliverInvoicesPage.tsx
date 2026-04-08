import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

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

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Invoice[]>("/invoices");
        if (!cancelled) setInvoices(data);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function handleSend(invoiceId: string) {
    setActionLoading(invoiceId);
    try {
      const updated = await post<Invoice>(`/invoices/${invoiceId}/send`);
      setInvoices((prev) => prev.map((inv) => inv.id === invoiceId ? { ...inv, ...updated, status: "sent" } : inv));
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-50 text-blue-700",
    paid: "bg-green-50 text-green-700",
    void: "bg-red-50 text-red-700",
  };

  return (
    <OliverPageWrapper title="Invoices" subtitle="Invoice management" error={error} loading={loading}>

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
                <td className="px-4 py-3 text-right text-slate-700">${inv.amount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[inv.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {inv.status === "draft" && (
                    <button
                      onClick={() => handleSend(inv.id)}
                      disabled={actionLoading === inv.id}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Send
                    </button>
                  )}
                  {inv.stripePaymentLink && (
                    <a
                      href={inv.stripePaymentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Stripe
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
    </OliverPageWrapper>
  );
}
