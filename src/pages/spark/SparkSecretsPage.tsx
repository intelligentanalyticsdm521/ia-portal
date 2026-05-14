// SparkSecretsPage — Tenant secrets vault.
//
// Stores API tokens for external services your automations/integrations
// reference. AES-256-GCM at rest. Plaintext returned ONCE at creation, or
// via the Reveal button (admin-only, audit-logged).
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Eye, EyeOff, Copy, Check, Trash2, Key, AlertCircle } from "lucide-react";

interface Secret {
  id: number; name: string; description: string | null;
  value_prefix: string; last_used_at: string | null; last_used_by: string | null;
  is_active: boolean; created_at: string; created_by: string | null;
}

export function SparkSecretsPage() {
  const { get, post, del, ready } = useSparkApi();
  const [list, setList] = useState<Secret[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", description: "" });
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [showNewValue, setShowNewValue] = useState<{ name: string; value?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Secret[] }>("/api/v1/tenant-secrets");
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchList(); }, [fetchList]);

  async function create() {
    if (!form.name || !form.value) return;
    try {
      await post("/api/v1/tenant-secrets", form);
      setShowNewValue({ name: form.name, value: form.value });
      setCreating(false);
      setForm({ name: "", value: "", description: "" });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function reveal(id: number) {
    if (revealed[id]) { setRevealed(r => { const c = { ...r }; delete c[id]; return c; }); return; }
    if (!confirm("Reveal this secret? The action is audit-logged.")) return;
    try {
      const r = await post<{ data: { value: string } }>(`/api/v1/tenant-secrets/${id}/reveal`, {});
      setRevealed(curr => ({ ...curr, [id]: r.data.value }));
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this secret? Integrations referencing it will fail.")) return;
    try { await del(`/api/v1/tenant-secrets/${id}`); await fetchList(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Secrets vault"
      subtitle={`${list.filter(s => s.is_active).length} active secrets`}
      help="Store API tokens for external services (OpenAI, your Twilio account, Stripe restricted keys, custom integrations). AES-256-GCM encrypted at rest per-tenant. Reveal actions are audit-logged."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New secret
        </button>
      }
      loading={loading}
      error={error}
    >
      {showNewValue && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 mb-4">
          <div className="text-sm font-bold text-emerald-900">Secret saved.</div>
          <div className="text-xs text-emerald-800 mt-1">It's encrypted at rest. You can reveal it later, but consider saving it now if you'd rather not audit-log future reveals.</div>
          <div className="flex gap-1 mt-3">
            <code className="flex-1 font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1.5 truncate">{showNewValue.value || "(saved)"}</code>
            {showNewValue.value && (
              <button onClick={() => copyText(showNewValue.value!, "new")} className="text-xs px-2 py-1.5 rounded bg-emerald-700 text-white flex items-center gap-1">
                {copied === "new" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            )}
          </div>
          <button onClick={() => setShowNewValue(null)} className="text-xs mt-2 text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead><tr><th>Name</th><th>Description</th><th>Value</th><th>Last used</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="text-center text-sm text-slate-500 py-8">No secrets yet.</td></tr>}
            {list.map(s => (
              <tr key={s.id}>
                <td className="font-mono text-sm">{s.name}</td>
                <td className="text-xs text-slate-600 max-w-[200px] truncate" title={s.description || ""}>{s.description || "—"}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                      {revealed[s.id] || `${s.value_prefix}${"•".repeat(8)}`}
                    </code>
                    <button onClick={() => reveal(s.id)} className="text-xs px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
                      {revealed[s.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    {revealed[s.id] && (
                      <button onClick={() => copyText(revealed[s.id], `s${s.id}`)} className="text-xs px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50">
                        {copied === `s${s.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </td>
                <td className="text-xs text-slate-500">{s.last_used_at ? new Date(s.last_used_at).toLocaleString() : "—"}</td>
                <td className="text-xs text-slate-500">{new Date(s.created_at).toLocaleDateString()}<br /><span className="text-[10px]">{s.created_by || ""}</span></td>
                <td>
                  <button onClick={() => remove(s.id)} className="text-xs text-rose-600 hover:bg-rose-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold flex items-center gap-2"><Key className="h-4 w-4" /> New secret</div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Name (snake_case)</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="openai_api_key" className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 font-mono" />
              <p className="text-[10px] text-slate-500 mt-1">Lowercase letters/digits/underscores. Start with a letter.</p>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Description (optional)</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Value</label>
              <textarea value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} rows={3}
                placeholder="sk-..." className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 font-mono" />
            </div>
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              AES-256-GCM encrypted at rest with a tenant-derived key. You can reveal it later (audit-logged), but consider copying it now.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button onClick={create} disabled={!form.name || !form.value}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">Save secret</button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkSecretsPage;
