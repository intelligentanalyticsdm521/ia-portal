import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  intelligenceTier: string | null;
  createdAt: string;
}

export function SparkContactsPage() {
  const { get, post, ready } = useSparkApi();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "" });
  const [saving, setSaving] = useState(false);
  const pageSize = 25;

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set("search", search);
      const res = await get<{ data: Contact[]; total: number }>(`/api/v1/contacts?${params}`);
      setContacts(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, page, search]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    setSaving(true);
    try {
      await post("/api/v1/contacts", form);
      setShowModal(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", company: "" });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  function tierBadge(tier: string | null) {
    if (!tier) return null;
    const colors: Record<string, string> = {
      X: "bg-emerald-100 text-emerald-700",
      Y: "bg-blue-100 text-blue-700",
      Z: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[tier] || "bg-gray-100 text-gray-600"}`}>
        {tier}
      </span>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <OliverPageWrapper title="Contacts" subtitle="Manage your contact database" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Contact
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.company || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.source || "—"}</td>
                  <td className="px-4 py-3">{tierBadge(c.intelligenceTier)}</td>
                </tr>
              ))}
              {contacts.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    No contacts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} of {totalPages} ({total} contacts)</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}

        {/* Add Contact Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Add Contact</h3>
              <div className="space-y-3">
                {(["firstName", "lastName", "email", "phone", "company"] as const).map((field) => (
                  <input
                    key={field}
                    type={field === "email" ? "email" : "text"}
                    placeholder={field === "firstName" ? "First name" : field === "lastName" ? "Last name" : field.charAt(0).toUpperCase() + field.slice(1)}
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleAdd} disabled={saving || !form.email} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}
