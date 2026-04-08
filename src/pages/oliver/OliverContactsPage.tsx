import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
}

export function OliverContactsPage() {
  const { get, ready } = useOliverApi();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Contact[]>("/contacts?limit=50");
        if (!cancelled) setContacts(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load contacts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-5 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
        <p className="text-sm text-slate-500 mt-1">Customer contacts synced from SPARK CRM. Read-only.</p>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Company</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-3 text-slate-600">{c.email || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.company || "—"}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No contacts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
