// SparkInboundWebhooksPage — Manage inbound webhook receivers.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Copy, Check, Trash2, Inbox, AlertCircle } from "lucide-react";

type Action = "create_contact" | "log_only" | "fire_event";
interface Hook {
  id: number; slug: string; name: string; description: string | null;
  action: Action; field_mapping: string | null; fire_event_type: string | null;
  apply_tags_json: string | null; add_to_list_id: number | null;
  is_active: boolean; last_received_at: string | null; total_received: number;
  created_at: string; created_by: string | null;
}
interface Evt {
  id: number; received_at: string; source_ip: string | null; parsed_email: string | null;
  action_result: string | null; contact_id: number | null; error_message: string | null;
  signature_valid: boolean | null; duration_ms: number | null;
}
interface CreateResp { data: Hook & { hook_url: string; signing_secret: string | null }; note: string; }

export function SparkInboundWebhooksPage() {
  const { get, post, del, patch, ready } = useSparkApi();
  const [list, setList] = useState<Hook[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [events, setEvents] = useState<Evt[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", action: "create_contact" as Action,
    require_signature: true,
    field_mapping: '{ "email": "$.email", "first_name": "$.first_name", "last_name": "$.last_name", "phone": "$.phone" }',
    fire_event_type: "", apply_tags: "",
  });
  const [showSecret, setShowSecret] = useState<CreateResp | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Hook[] }>("/api/v1/inbound-webhooks");
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchEvents = useCallback(async (id: number) => {
    try {
      const r = await get<{ data: Evt[] }>(`/api/v1/inbound-webhooks/${id}/events?limit=50`);
      setEvents(r?.data || []);
    } catch { setEvents([]); }
  }, [get]);
  useEffect(() => { if (selected) fetchEvents(selected); else setEvents([]); }, [selected, fetchEvents]);

  async function create() {
    if (!form.name) return;
    try {
      let fieldMapping: Record<string, string> | null = null;
      if (form.field_mapping.trim()) {
        try { fieldMapping = JSON.parse(form.field_mapping); }
        catch { return alert("Field mapping must be valid JSON"); }
      }
      const r = await post<CreateResp>("/api/v1/inbound-webhooks", {
        name: form.name,
        description: form.description || undefined,
        action: form.action,
        field_mapping: fieldMapping,
        fire_event_type: form.action === "fire_event" ? form.fire_event_type : undefined,
        apply_tags: form.apply_tags.split(",").map(s => s.trim()).filter(Boolean),
        require_signature: form.require_signature,
      });
      setShowSecret(r);
      setCreating(false);
      setForm({ name: "", description: "", action: "create_contact", require_signature: true,
        field_mapping: '{ "email": "$.email", "first_name": "$.first_name", "last_name": "$.last_name", "phone": "$.phone" }',
        fire_event_type: "", apply_tags: "" });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Disable this inbound webhook? Future POSTs will return 404.")) return;
    try { await del(`/api/v1/inbound-webhooks/${id}`); await fetchList(); if (selected === id) setSelected(null); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleActive(h: Hook) {
    try { await patch(`/api/v1/inbound-webhooks/${h.id}`, { is_active: !h.is_active }); await fetchList(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Inbound webhooks"
      subtitle={`${list.filter(h => h.is_active).length} active receivers`}
      help="Publish a URL that accepts POSTs from third-party services (Stripe, Calendly, Typeform, Zapier, etc.). Each receiver auto-extracts email/name/phone using JSON-path mappings and creates/merges a contact, or fires a custom event into your automation runtime."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New receiver
        </button>
      }
      loading={loading}
      error={error}
    >
      {showSecret && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 mb-4">
          <div className="text-sm font-bold text-emerald-900">Webhook ready</div>
          <div className="text-xs text-emerald-800 mt-1">{showSecret.note}</div>
          <div className="mt-3">
            <div className="text-[10px] uppercase font-semibold text-emerald-700">URL</div>
            <div className="flex gap-1">
              <code className="flex-1 font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1.5 truncate">{showSecret.data.hook_url}</code>
              <button onClick={() => copyText(showSecret.data.hook_url, "url")} className="text-xs px-2 py-1.5 rounded bg-emerald-700 text-white flex items-center gap-1">
                {copied === "url" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>
          {showSecret.data.signing_secret && (
            <div className="mt-2">
              <div className="text-[10px] uppercase font-semibold text-emerald-700">Signing secret (HMAC-SHA256 over raw body)</div>
              <div className="flex gap-1">
                <code className="flex-1 font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1.5 truncate">{showSecret.data.signing_secret}</code>
                <button onClick={() => copyText(showSecret.data.signing_secret!, "secret")} className="text-xs px-2 py-1.5 rounded bg-emerald-700 text-white flex items-center gap-1">
                  {copied === "secret" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
            </div>
          )}
          <button onClick={() => setShowSecret(null)} className="text-xs mt-3 text-emerald-700 hover:underline">I've saved it, hide this</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1 border border-slate-200 rounded max-h-[700px] overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No receivers yet.</div>}
          {list.map(h => (
            <button key={h.id} onClick={() => setSelected(h.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selected === h.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{h.name}</div>
                  <code className="text-[11px] text-slate-500 truncate block">/hooks/{h.slug}</code>
                </div>
                {h.is_active ? <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">Live</span>
                            : <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-500">Off</span>}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {h.total_received} received{h.last_received_at ? ` · last ${new Date(h.last_received_at).toLocaleString()}` : ""}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {!selected && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Select a receiver to inspect recent events.
            </div>
          )}
          {selected && (() => {
            const h = list.find(x => x.id === selected);
            if (!h) return null;
            const apiBase = (import.meta.env.VITE_SPARK_API_BASE as string) || (import.meta.env.VITE_LUMEN_API_BASE as string) || "";
            const hookUrl = `${apiBase}/api/v1/hooks/${h.slug}`;
            return (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{h.name}</div>
                      {h.description && <div className="text-xs text-slate-600 mt-0.5">{h.description}</div>}
                      <div className="mt-2 flex items-center gap-1">
                        <code className="flex-1 text-xs font-mono bg-slate-100 px-2 py-1 rounded truncate">{hookUrl}</code>
                        <button onClick={() => copyText(hookUrl, `url-${h.id}`)} className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                          {copied === `url-${h.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-2">Action: <strong>{h.action}</strong></div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => toggleActive(h)} className={`text-xs px-2 py-1 rounded ${h.is_active ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {h.is_active ? "Pause" : "Activate"}
                      </button>
                      <button onClick={() => remove(h.id)} className="text-xs px-2 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded">
                  <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 flex items-center gap-1">
                    <Inbox className="h-3 w-3" /> Recent events ({events.length})
                  </div>
                  <div className="max-h-[500px] overflow-y-auto">
                    {events.length === 0 && <div className="text-center text-sm text-slate-500 py-6">No events received yet.</div>}
                    {events.map(e => (
                      <div key={e.id} className="px-3 py-2 border-b border-slate-100 text-xs flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${e.action_result === "error" ? "bg-rose-100 text-rose-700" : e.action_result === "contact_created" || e.action_result === "contact_merged" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {e.action_result || "—"}
                        </span>
                        <span className="text-slate-600 font-mono truncate">{e.parsed_email || "(no email)"}</span>
                        <span className="flex-1 truncate text-slate-500">{e.error_message || (e.contact_id ? `contact #${e.contact_id}` : "")}</span>
                        {e.signature_valid === false && <AlertCircle className="h-3 w-3 text-rose-500" />}
                        <span className="text-slate-400">{new Date(e.received_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold">New inbound webhook</div>
            <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Stripe checkout completed" />
            <Input label="Description (optional)" value={form.description} onChange={v => setForm({ ...form, description: v })} placeholder="What does this receive?" />
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Action</label>
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as Action })}
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5">
                <option value="create_contact">Create / merge contact</option>
                <option value="fire_event">Fire automation event</option>
                <option value="log_only">Log only (inspect payloads)</option>
              </select>
            </div>
            {form.action === "create_contact" && (
              <>
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">Field mapping (JSON, $.path notation)</label>
                  <textarea value={form.field_mapping} onChange={(e) => setForm({ ...form, field_mapping: e.target.value })} rows={4}
                    className="w-full font-mono text-[11px] border border-slate-300 rounded p-1.5 mt-0.5" />
                </div>
                <Input label="Apply tags (comma-separated, optional)" value={form.apply_tags} onChange={v => setForm({ ...form, apply_tags: v })} placeholder="stripe_customer, new_signup" />
              </>
            )}
            {form.action === "fire_event" && (
              <Input label="Event trigger name" value={form.fire_event_type} onChange={v => setForm({ ...form, fire_event_type: v })} placeholder="form.submitted" />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.require_signature} onChange={(e) => setForm({ ...form, require_signature: e.target.checked })} />
              Require HMAC-SHA256 signature header (X-IADM-Signature or Stripe-Signature)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button onClick={create} disabled={!form.name}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">Create receiver</button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
    </div>
  );
}

export default SparkInboundWebhooksPage;
