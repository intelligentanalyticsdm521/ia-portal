import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface UsageResponse {
  data: {
    tier: string;
    usage: { emails_sent: number; sms_sent: number; contacts_count: number; leads_issued: number };
    limits: { emails_per_month: number; sms_per_month: number; contacts_max: number };
    remaining: { emails: number; sms: number; contacts: number };
  };
}

interface Contact {
  id: number; first_name: string; last_name: string; email: string;
  phone: string; company: string; created_at: string;
}

export function SparkOverviewPage() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageResponse["data"] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [uRaw, cRaw] = await Promise.all([
          get<UsageResponse>("/api/v1/usage"),
          get<{ data: Contact[] }>("/api/v1/contacts?limit=5"),
        ]);
        if (!cancelled) {
          setUsage(uRaw?.data || null);
          setContacts(cRaw?.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  function pct(used: number, limit: number) {
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function barColor(percent: number) {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-blue-500";
  }

  const bars = usage
    ? [
        { label: "Emails", used: usage.usage.emails_sent, limit: usage.limits.emails_per_month },
        { label: "SMS", used: usage.usage.sms_sent, limit: usage.limits.sms_per_month },
        { label: "Contacts", used: usage.usage.contacts_count, limit: usage.limits.contacts_max },
        { label: "Leads", used: usage.usage.leads_issued, limit: 50 },
      ]
    : [];

  return (
    <OliverPageWrapper title="SPARK Overview" subtitle="Dashboard summary of your marketing platform" error={error} loading={loading}>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bars.map((b) => {
            const p = pct(b.used, b.limit);
            return (
              <div key={b.label} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
                <p className="text-sm text-slate-500">{b.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {(b.used ?? 0).toLocaleString()} / {(b.limit ?? 0).toLocaleString()}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${barColor(p)}`} style={{ width: `${p}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-400">{p}% used</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Contacts</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500">No contacts yet. Add your first contact to get started.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Company</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{c.first_name} {c.last_name}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.email}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.company || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </OliverPageWrapper>
  );
}
