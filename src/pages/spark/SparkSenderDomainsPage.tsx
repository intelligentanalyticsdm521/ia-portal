// SparkSenderDomainsPage — Sender Domain Wizard
//
// Three-step wizard:
//   1. Enter a domain (e.g. mail.acme.com)
//   2. Publish DNS records (SPF/DKIM/DMARC) — copy-paste cards
//   3. Click Verify; on success, mark as default
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Globe, Check, X, Plus, Copy, RefreshCw, Star, Trash2 } from "lucide-react";

type Status = "pending" | "verified" | "failed";

interface Domain {
  id: number;
  domain: string;
  display_name: string | null;
  reply_to: string | null;
  status: Status;
  last_verified_at: string | null;
  last_verify_result: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface DnsRecord { type: string; host: string; value: string; note?: string; }
interface RecordsResp { domain: string; records: { spf: DnsRecord; dkim_1: DnsRecord; dkim_2: DnsRecord; dmarc: DnsRecord }; }
interface VerifyResp {
  data: { id: number; domain: string; status: Status; checks: Record<string, { found: boolean; ok?: boolean; value: unknown; includes_acs?: boolean }> };
}

function statusPill(s: Status) {
  if (s === "verified") return <span className="px-2 py-0.5 rounded text-[10px] border bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Verified</span>;
  if (s === "failed")   return <span className="px-2 py-0.5 rounded text-[10px] border bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-1"><X className="h-3 w-3" /> Failed</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Pending</span>;
}

export function SparkSenderDomainsPage() {
  const { get, post, del, ready } = useSparkApi();
  const [list, setList] = useState<Domain[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [records, setRecords] = useState<RecordsResp | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResp["data"] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDomain, setNewDomain] = useState({ domain: "", display_name: "", reply_to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Domain[] }>("/api/v1/sender-domains");
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const selected = useMemo(() => list.find(d => d.id === selectedId) || null, [list, selectedId]);

  useEffect(() => {
    if (!selectedId) { setRecords(null); setVerifyResult(null); return; }
    (async () => {
      try {
        const r = await get<RecordsResp>(`/api/v1/sender-domains/${selectedId}/records`);
        setRecords(r);
      } catch (err) { console.error(err); }
    })();
  }, [selectedId, get]);

  async function createDomain() {
    if (!newDomain.domain) return;
    try {
      const r = await post<{ data: Domain }>("/api/v1/sender-domains", newDomain);
      setCreating(false);
      setNewDomain({ domain: "", display_name: "", reply_to: "" });
      await fetchList();
      setSelectedId(r?.data?.id || null);
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  async function verifyDomain() {
    if (!selectedId) return;
    setVerifying(true);
    try {
      const r = await post<VerifyResp>(`/api/v1/sender-domains/${selectedId}/verify`, {});
      setVerifyResult(r?.data || null);
      await fetchList();
    } catch (err) { alert(`Verify failed: ${(err as Error).message}`); }
    finally { setVerifying(false); }
  }

  async function setDefault(id: number) {
    try {
      await post(`/api/v1/sender-domains/${id}/default`, {});
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function deactivate(id: number) {
    if (!confirm("Deactivate this sender domain? Future emails will fall back to the platform default.")) return;
    try {
      await del(`/api/v1/sender-domains/${id}`);
      if (selectedId === id) setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Sender domains"
      subtitle={`${list.length} domain${list.length === 1 ? "" : "s"}`}
      help="Register a custom sending domain (e.g. mail.yourcompany.com) so your emails go out from your own brand. Publish the SPF/DKIM/DMARC records shown, then click Verify. Once verified, set the domain as default and all outbound email will use it."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> Add domain
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* List */}
        <div className="lg:col-span-1 border border-slate-200 rounded">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No sender domains yet. Click "Add domain" to start.</div>}
          {list.map(d => (
            <button key={d.id} onClick={() => setSelectedId(d.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === d.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-slate-500" />
                    {d.domain}
                    {d.is_default && <Star className="h-3 w-3 text-[#EF6C33]" />}
                  </div>
                  <div className="text-[11px] text-slate-500">{d.display_name || "(no display name)"}</div>
                </div>
                {statusPill(d.status)}
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selectedId && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Select a domain on the left, or click "Add domain" to register one.
            </div>
          )}
          {selectedId && selected && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="border border-slate-200 rounded p-3 flex items-center justify-between bg-slate-50">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selected.domain}</div>
                  <div className="text-[11px] text-slate-500">
                    {selected.display_name || "(no display name)"}
                    {selected.last_verified_at ? ` · Last checked ${new Date(selected.last_verified_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={verifying} onClick={verifyDomain}
                    className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
                    <RefreshCw className="h-3 w-3" /> {verifying ? "Checking…" : "Verify"}
                  </button>
                  {selected.status === "verified" && !selected.is_default && (
                    <button onClick={() => setDefault(selectedId)}
                      className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1">
                      <Star className="h-3 w-3" /> Set default
                    </button>
                  )}
                  <button onClick={() => deactivate(selectedId)}
                    className="text-xs px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Deactivate
                  </button>
                </div>
              </div>

              {/* DNS records */}
              {records && (
                <div className="space-y-2">
                  <div className="text-xs uppercase font-semibold text-slate-600">Publish these DNS records at your registrar:</div>
                  {(["spf", "dkim_1", "dkim_2", "dmarc"] as const).map(key => {
                    const rec = records.records[key];
                    const v = verifyResult?.checks?.[key];
                    const ok = v?.found && (v.ok !== false) && (key !== "spf" || v.includes_acs !== false);
                    return (
                      <div key={key} className={`border-2 rounded p-3 ${verifyResult ? (ok ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30") : "border-slate-200 bg-white"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold uppercase text-slate-700">{key.replace("_", " ")} <span className="ml-2 text-[10px] text-slate-500 font-mono">({rec.type})</span></div>
                          {verifyResult && (ok ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />)}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                          <Field label="Host" value={rec.host} copyKey={`${key}-host`} onCopy={copyText} copiedKey={copiedKey} />
                          <Field label="Value" value={rec.value} copyKey={`${key}-value`} onCopy={copyText} copiedKey={copiedKey} wide />
                        </div>
                        {rec.note && <div className="text-[10px] text-slate-500 italic mt-1">{rec.note}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {verifyResult && (
                <div className={`rounded p-3 ${verifyResult.status === "verified" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                  <div className="text-sm font-semibold">
                    {verifyResult.status === "verified" ? "All records verified! You can now set this domain as your default sender." : "Some records aren't published yet. DNS changes can take up to 24h to propagate."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold">Add sender domain</div>
            <Input label="Domain" placeholder="mail.yourcompany.com" value={newDomain.domain} onChange={v => setNewDomain({ ...newDomain, domain: v })} />
            <Input label="Display name (optional)" placeholder="Your Company" value={newDomain.display_name} onChange={v => setNewDomain({ ...newDomain, display_name: v })} />
            <Input label="Reply-to (optional)" placeholder="support@yourcompany.com" value={newDomain.reply_to} onChange={v => setNewDomain({ ...newDomain, reply_to: v })} />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button disabled={!newDomain.domain} onClick={createDomain} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Field({ label, value, copyKey, onCopy, copiedKey, wide }: { label: string; value: string; copyKey: string; onCopy: (v: string, k: string) => void; copiedKey: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase font-semibold text-slate-500">{label}</div>
      <div className="flex gap-1 mt-0.5">
        <code className="flex-1 text-[11px] font-mono bg-slate-100 px-2 py-1 rounded truncate">{value}</code>
        <button onClick={() => onCopy(value, copyKey)} className="text-[10px] px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-50">
          {copiedKey === copyKey ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function Input({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]" />
    </div>
  );
}

export default SparkSenderDomainsPage;
