import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface UsageData {
  emailsSent: number;
  emailsLimit: number;
  smsSent: number;
  smsLimit: number;
  contactsUsed: number;
  contactsLimit: number;
  leadsUsed: number;
  leadsLimit: number;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  createdAt: string;
}

export function SparkOverviewPage() {
  const { get, ready } = useSparkApi();
  const [usage, setUsage] = useState<UsageData | null>(null);
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
        const [u, c] = await Promise.all([
          get<UsageData>("/api/v1/usage"),
          get<Contact[]>("/api/v1/contacts?limit=5"),
        ]);
        if (!cancelled) {
          setUsage(u);
          setContacts(c);
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
    if (limit === 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function barColor(percent: number) {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-blue-500";
  }

  const bars = usage
    ? [
        { label: "Emails", used: usage.emailsSent, limit: usage.emailsLimit },
        { label: "SMS", used: usage.smsSent, limit: usage.smsLimit },
        { label: "Contacts", used: usage.contactsUsed, limit: usage.contactsLimit },
        { label: "Leads", used: usage.leadsUsed, limit: usage.leadsLimit },
      ]
    : [];

  return (
    <OliverPageWrapper title="SPARK Overview" subtitle="Dashboard summary of your marketing platform" error={error} loading={loading}>
      <div className="p-6 space-y-6">
        {/* Usage bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bars.map((b) => {
            const p = pct(b.used, b.limit);
            return (
              <div key={b.label} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
                <p className="text-sm text-slate-500">{b.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {b.used.toLocaleString()} / {b.limit.toLocaleString()}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${barColor(p)}`} style={{ width: `${p}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-400">{p}% used</p>
              </div>
            );
          })}
        </div>

        {/* Recent contacts */}
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Contacts</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500">No contacts yet.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Company</th>
                  <th className="py-2 pr-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.email}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.phone || "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.company || "—"}</td>
                    <td className="py-2 pr-3 text-slate-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Add Contact
          </button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-gray-200 hover:bg-gray-50">
            Create Campaign
          </button>
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-gray-200 hover:bg-gray-50">
            New Lead Search
          </button>
        </div>
      </div>
    </OliverPageWrapper>
  );
}
