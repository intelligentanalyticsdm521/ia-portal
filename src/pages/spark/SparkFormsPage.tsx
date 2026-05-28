import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

interface SparkForm {
  id: string;
  name: string;
  submission_count: number;
  is_active: boolean;
  created_at: string;
  slug?: string | null;
}

export function SparkFormsPage() {
  const navigate = useNavigate();
  const { get, post, put, ready } = useSparkApi();
  const [forms, setForms] = useState<SparkForm[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await get<{ data: SparkForm[] }>("/api/v1/forms");
      setForms(raw.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await post<{ data: SparkForm }>("/api/v1/forms", { name });
      setShowModal(false);
      setName("");
      // After create, jump straight into the Form Builder so the user can
      // design fields without an extra click.
      if (created?.data?.id) {
        navigate(`/app/services/spark_form_builder?id=${encodeURIComponent(String(created.data.id))}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(form: SparkForm) {
    try {
      await put(`/api/v1/forms/${form.id}`, { is_active: !form.is_active });
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: !f.is_active } : f));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SparkPageShell title="Forms" subtitle="Form builder with hosted URLs and embedded widgets" error={error} loading={loading}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{forms.length} form{forms.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create Form
          </button>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {forms.map((f) => {
                const hostedPath = f.slug
                  ? `/api/v1/f/${encodeURIComponent("tenant")}/${encodeURIComponent(f.slug)}`
                  : `/api/v1/forms/${f.id}/hosted`;
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div>{f.name}</div>
                      {f.slug && <div className="text-[10px] text-slate-400 font-mono mt-0.5">slug: {f.slug}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{f.submission_count.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(f)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${f.is_active ? "bg-blue-600" : "bg-gray-300"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${f.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(f.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/app/services/spark_form_builder?id=${encodeURIComponent(f.id)}`)}
                          className="text-xs px-2 py-1 rounded bg-[#EF6C33] text-white hover:bg-[#d75a25]"
                          title="Open in visual builder"
                        >
                          Edit in Builder
                        </button>
                        <a
                          href={hostedPath}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          title="Open the hosted form page in a new tab"
                        >
                          Hosted ↗
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {forms.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No forms yet. Create one to start collecting submissions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Create Form</h3>
              <input
                type="text"
                placeholder="Form name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SparkPageShell>
  );
}
