// SparkApiKeysPage — Tenant-owned API keys for integrations.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Copy, Check, Key, AlertCircle, Trash2 } from "lucide-react";

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string | string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  revoked_at: string | null;
}

interface CreateResp { data: ApiKey & { key: string }; note: string; }

export function SparkApiKeysPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<ApiKey[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", scopes: ["read"], expires_in_days: "" });
  const [showKey, setShowKey] = useState<CreateResp | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: ApiKey[] }>("/api/v1/api-keys");
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function create() {
    if (!form.name) return;
    try {
      const body: { name: string; scopes: string[]; expires_in_days?: number } = { name: form.name, scopes: form.scopes };
      if (form.expires_in_days) body.expires_in_days = Number(form.expires_in_days);
      const r = await post<CreateResp>("/api/v1/api-keys", body);
      setShowKey(r);
      setCreating(false);
      setForm({ name: "", scopes: ["read"], expires_in_days: "" });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function revoke(id: number) {
    if (!confirm("Revoke this API key? Integrations using it will immediately stop working.")) return;
    try {
      await post(`/api/v1/api-keys/${id}/revoke`, {});
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyKey(key: string) {
    try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  function parseScopes(s: string | string[]): string[] {
    if (Array.isArray(s)) return s;
    try { return JSON.parse(s); } catch { return [s]; }
  }

  return (
    <SparkPageShell
      title="API keys"
      subtitle={`${list.filter(k => k.is_active).length} active · ${list.length} total`}
      help="Issue API keys for Zapier, n8n, or your own integrations. Keys carry tenant + scope context — share them like passwords. Revoke any key instantly if it leaks."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New key
        </button>
      }
      loading={loading}
      error={error}
    >
      {/* Just-created key reveal */}
      {showKey && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 mb-4">
          <div className="flex items-start gap-2">
            <Key className="h-5 w-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-emerald-900">Your new API key is ready</div>
              <div className="text-xs text-emerald-800 mt-1">{showKey.note}</div>
              <div className="flex gap-1 mt-3">
                <code className="flex-1 font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1.5 truncate">{showKey.data.key}</code>
                <button onClick={() => copyKey(showKey.data.key)} className="text-xs px-2 py-1.5 rounded bg-emerald-700 text-white flex items-center gap-1">
                  {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
              <button onClick={() => setShowKey(null)} className="text-xs mt-2 text-emerald-700 hover:underline">I've saved it, hide this</button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead><tr>
            <th>Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th>Expires</th><th>Status</th><th>Created</th><th></th>
          </tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8} className="text-center text-sm text-slate-500 py-8">No API keys yet.</td></tr>}
            {list.map(k => {
              const scopes = parseScopes(k.scopes);
              const expired = k.expires_at && new Date(k.expires_at) < new Date();
              const status = !k.is_active ? "revoked" : expired ? "expired" : "active";
              const statusCls = status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "revoked" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200";
              return (
                <tr key={k.id}>
                  <td className="font-medium">{k.name}</td>
                  <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{k.key_prefix}…</code></td>
                  <td>{scopes.map(s => <span key={s} className="inline-block text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 mr-1">{s}</span>)}</td>
                  <td className="text-xs text-slate-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</td>
                  <td className="text-xs text-slate-500">{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never"}</td>
                  <td><span className={`px-2 py-0.5 rounded text-[11px] border ${statusCls}`}>{status}</span></td>
                  <td className="text-xs text-slate-500">{new Date(k.created_at).toLocaleDateString()}<br /><span className="text-[10px]">{k.created_by || ""}</span></td>
                  <td>
                    {k.is_active && (
                      <button onClick={() => revoke(k.id)} className="text-xs px-2 py-0.5 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold">Create API key</div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Zapier integration" className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Scopes</label>
              <div className="flex gap-2 mt-1">
                {["read", "write"].map(s => (
                  <label key={s} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={form.scopes.includes(s)} onChange={(e) => {
                      setForm({ ...form, scopes: e.target.checked ? [...form.scopes, s] : form.scopes.filter(x => x !== s) });
                    }} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Expires in (days, optional)</label>
              <input type="number" value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })}
                placeholder="Leave blank for no expiry" className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
            </div>
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              You'll see the full key once after creation. Save it somewhere safe — you cannot retrieve it later.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button onClick={create} disabled={!form.name} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">Create key</button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkApiKeysPage;
