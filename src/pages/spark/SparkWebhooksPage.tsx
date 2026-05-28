// SparkWebhooksPage — Manage outbound webhook subscriptions.
// F-92 — tab strip at top of body lets users switch to inbound without
// returning to a separate nav entry. SPARK_NAV "Webhooks" entry points
// at THIS page (outbound is the default view); the tab strip handles
// the channel switch.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Copy, Check, Send, Activity, Inbox } from "lucide-react";

function WebhooksTabStrip({ active }: { active: "outbound" | "inbound" }) {
  return (
    <div className="mb-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
      <Link
        to="/app/services/spark_webhooks"
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          active === "outbound" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <Send className="h-3.5 w-3.5" /> Outbound
      </Link>
      <Link
        to="/app/services/spark_inbound_webhooks"
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          active === "inbound" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <Inbox className="h-3.5 w-3.5" /> Inbound
      </Link>
    </div>
  );
}

interface Subscription {
  id: number; name: string; target_url: string; events: string;
  is_active: boolean; last_fire_at: string | null; last_status: number | null;
  consecutive_failures: number; created_at: string; created_by: string | null;
}
interface Delivery {
  id: number; event_type: string; event_id: string | null;
  status_code: number | null; error_message: string | null;
  attempt_count: number; next_retry_at: string | null; delivered_at: string | null;
  occurred_at: string; duration_ms: number | null;
}
interface CreateResp { data: Subscription & { signing_secret: string }; note: string; }

export function SparkWebhooksPage() {
  const { get, post, del, patch, ready } = useSparkApi();
  const [list, setList] = useState<Subscription[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; target_url: string; events: string[] }>({ name: "", target_url: "", events: ["*"] });
  const [showSecret, setShowSecret] = useState<CreateResp | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Subscription[]; known_events: string[] }>("/api/v1/webhook-subscriptions");
      setList(r?.data || []);
      setEvents(r?.known_events || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchDeliveries = useCallback(async (subId: number) => {
    try {
      const r = await get<{ data: Delivery[] }>(`/api/v1/webhook-subscriptions/${subId}/deliveries?limit=50`);
      setDeliveries(r?.data || []);
    } catch { setDeliveries([]); }
  }, [get]);

  useEffect(() => { if (selected) fetchDeliveries(selected); else setDeliveries([]); }, [selected, fetchDeliveries]);

  async function create() {
    if (!form.name || !form.target_url || !form.events.length) return;
    try {
      const r = await post<CreateResp>("/api/v1/webhook-subscriptions", form);
      setShowSecret(r);
      setCreating(false);
      setForm({ name: "", target_url: "", events: ["*"] });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Disable this webhook? Active deliveries will continue but no new events will fire.")) return;
    try { await del(`/api/v1/webhook-subscriptions/${id}`); await fetchList(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function test(id: number) {
    try { await post(`/api/v1/webhook-subscriptions/${id}/test`, {}); alert("Test event fired. Check the deliveries log."); await fetchDeliveries(id); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleActive(s: Subscription) {
    try { await patch(`/api/v1/webhook-subscriptions/${s.id}`, { is_active: !s.is_active }); await fetchList(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyKey(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  function parseEventsCol(s: string): string[] {
    try { return JSON.parse(s); } catch { return []; }
  }

  return (
    <SparkPageShell
      title="Webhooks"
      subtitle={`${list.filter(s => s.is_active).length} active · ${list.length} total`}
      help="Subscribe to outbound events (contact.created, campaign.opened, nps.response, review.submitted, etc.). We POST a signed JSON payload to your URL. Use the signing secret + X-IADM-Signature header (HMAC-SHA256) to verify authenticity."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New webhook
        </button>
      }
      loading={loading}
      error={error}
    >
      <WebhooksTabStrip active="outbound" />
      {showSecret && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 mb-4">
          <div className="text-sm font-bold text-emerald-900">Your signing secret is ready</div>
          <div className="text-xs text-emerald-800 mt-1">{showSecret.note}</div>
          <div className="flex gap-1 mt-3">
            <code className="flex-1 font-mono text-xs bg-white border border-emerald-200 rounded px-2 py-1.5 truncate">{showSecret.data.signing_secret}</code>
            <button onClick={() => copyKey(showSecret.data.signing_secret)} className="text-xs px-2 py-1.5 rounded bg-emerald-700 text-white flex items-center gap-1">
              {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <button onClick={() => setShowSecret(null)} className="text-xs mt-2 text-emerald-700 hover:underline">I've saved it, hide this</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1 border border-slate-200 rounded max-h-[700px] overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No webhooks yet.</div>}
          {list.map(s => (
            <button key={s.id} onClick={() => setSelected(s.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selected === s.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{s.target_url}</div>
                </div>
                {s.is_active ? <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">Live</span>
                            : <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-500">Off</span>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {s.last_status && (
                  <span className={`text-[10px] px-1 py-0.5 rounded ${s.last_status >= 200 && s.last_status < 300 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {s.last_status}
                  </span>
                )}
                {s.consecutive_failures > 0 && <span className="text-[10px] text-rose-700">{s.consecutive_failures} fail{s.consecutive_failures > 1 ? "s" : ""}</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {!selected && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Select a webhook to see its delivery log.
            </div>
          )}
          {selected && (() => {
            const s = list.find(x => x.id === selected);
            if (!s) return null;
            const subEvents = parseEventsCol(s.events);
            return (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{s.name}</div>
                      <code className="text-xs text-slate-600">{s.target_url}</code>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {subEvents.map(e => <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100">{e}</span>)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => test(s.id)} className="text-xs px-2 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1">
                        <Send className="h-3 w-3" /> Test
                      </button>
                      <button onClick={() => toggleActive(s)} className={`text-xs px-2 py-1 rounded ${s.is_active ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {s.is_active ? "Pause" : "Activate"}
                      </button>
                      <button onClick={() => remove(s.id)} className="text-xs px-2 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded">
                  <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600 flex items-center gap-1">
                    <Activity className="h-3 w-3" /> Recent deliveries ({deliveries.length})
                  </div>
                  <div className="max-h-[500px] overflow-y-auto">
                    {deliveries.length === 0 && <div className="text-center text-sm text-slate-500 py-6">No deliveries yet. Fire a test event to see one here.</div>}
                    {deliveries.map(d => (
                      <div key={d.id} className="px-3 py-2 border-b border-slate-100 text-xs flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${d.status_code && d.status_code >= 200 && d.status_code < 300 ? "bg-emerald-100 text-emerald-700" : d.status_code ? "bg-rose-100 text-rose-700" : d.next_retry_at ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {d.status_code || (d.next_retry_at ? "queued" : "—")}
                        </span>
                        <span className="font-mono text-slate-600">{d.event_type}</span>
                        <span className="flex-1 truncate text-slate-500">{d.error_message || d.event_id || ""}</span>
                        <span className="text-slate-400">attempt {d.attempt_count}</span>
                        <span className="text-slate-400">{new Date(d.occurred_at).toLocaleString()}</span>
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
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold">New webhook</div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Zapier — new contacts" className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Target URL</label>
              <input value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })}
                placeholder="https://hooks.zapier.com/..." className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Events</label>
              <div className="mt-1 max-h-[200px] overflow-y-auto border border-slate-200 rounded p-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.events.includes("*")} onChange={(e) => setForm({ ...form, events: e.target.checked ? ["*"] : [] })} />
                  <strong>All events</strong>
                </label>
                {!form.events.includes("*") && events.map(ev => (
                  <label key={ev} className="flex items-center gap-2 text-xs mt-0.5">
                    <input type="checkbox" checked={form.events.includes(ev)} onChange={(e) => {
                      setForm({ ...form, events: e.target.checked ? [...form.events, ev] : form.events.filter(x => x !== ev) });
                    }} />
                    <code>{ev}</code>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button onClick={create} disabled={!form.name || !form.target_url || !form.events.length}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkWebhooksPage;
