// SparkWorkflowTriggersPage — Per-contact workflow trigger CRUD (v4.1).
//
// Trigger kinds: health_tier_changed, lead_score_threshold, activity_silence,
// tag_added. Action kinds: send_email, send_sms, add_tag, fire_webhook,
// create_task. The runtime dispatcher hangs off LUMEN-API and fires these
// when the relevant contact event happens.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Zap, Trash2, Play, Mail, MessageSquare, Tag, Webhook, ListTodo, Activity } from "lucide-react";

type TriggerKind = "health_tier_changed" | "lead_score_threshold" | "activity_silence" | "tag_added";
type ActionKind = "send_email" | "send_sms" | "add_tag" | "fire_webhook" | "create_task";

interface Trigger {
  id: number;
  name: string;
  trigger_kind: TriggerKind;
  condition_json: string;
  action_kind: ActionKind;
  action_config: string;
  is_active: boolean;
  last_fired_at: string | null;
  fire_count: number;
  created_at: string;
}

interface Run {
  id: number;
  trigger_id: number;
  contact_id: number | null;
  status: "success" | "failed";
  detail: string | null;
  occurred_at: string;
}

const TRIGGER_KIND_META: Record<TriggerKind, { label: string; icon: typeof Activity }> = {
  health_tier_changed: { label: "Health tier changed", icon: Activity },
  lead_score_threshold: { label: "Lead score threshold", icon: Activity },
  activity_silence: { label: "Activity silence", icon: Activity },
  tag_added: { label: "Tag added", icon: Tag },
};

const ACTION_KIND_META: Record<ActionKind, { label: string; icon: typeof Mail }> = {
  send_email: { label: "Send email", icon: Mail },
  send_sms: { label: "Send SMS", icon: MessageSquare },
  add_tag: { label: "Add tag", icon: Tag },
  fire_webhook: { label: "Fire webhook", icon: Webhook },
  create_task: { label: "Create task", icon: ListTodo },
};

export function SparkWorkflowTriggersPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [form, setForm] = useState({
    name: "",
    trigger_kind: "health_tier_changed" as TriggerKind,
    condition: '{"from_tier":"engaged","to_tier":"at_risk"}',
    action_kind: "send_email" as ActionKind,
    action: '{"template_key":"win_back_campaign"}',
  });

  const fetchTriggers = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Trigger[] }>("/api/v1/workflow-triggers");
      setTriggers(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchTriggers(); }, [fetchTriggers]);

  const selected = triggers.find((t) => t.id === selectedId) || null;

  const fetchRuns = useCallback(async () => {
    if (!ready || selectedId == null) { setRuns([]); return; }
    try {
      const r = await get<{ data: Run[] }>(`/api/v1/workflow-triggers/${selectedId}/runs?limit=50`);
      setRuns(r?.data || []);
    } catch { /* swallow */ }
  }, [get, ready, selectedId]);
  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  async function create() {
    if (!form.name.trim()) { alert("Name required"); return; }
    let condition, action;
    try { condition = JSON.parse(form.condition); } catch { alert("Condition is not valid JSON"); return; }
    try { action = JSON.parse(form.action); } catch { alert("Action is not valid JSON"); return; }
    try {
      await post("/api/v1/workflow-triggers", {
        name: form.name,
        trigger_kind: form.trigger_kind,
        condition,
        action_kind: form.action_kind,
        action,
      });
      setCreating(false);
      setForm({ name: "", trigger_kind: "health_tier_changed", condition: "{}", action_kind: "send_email", action: "{}" });
      await fetchTriggers();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggle(t: Trigger) {
    try { await patch(`/api/v1/workflow-triggers/${t.id}`, { is_active: !t.is_active }); await fetchTriggers(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function remove(id: number) {
    if (!confirm("Delete this trigger? Recorded runs stay.")) return;
    try { await del(`/api/v1/workflow-triggers/${id}`); setSelectedId(null); await fetchTriggers(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function fireTest() {
    if (!selected) return;
    const cid = prompt("Contact ID to test against:");
    if (!cid || !/^\d+$/.test(cid)) return;
    try {
      await post(`/api/v1/workflow-triggers/${selected.id}/fire-test`, { contact_id: parseInt(cid) });
      alert("Test fire dispatched. Check the runs log below.");
      await fetchRuns();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Workflow Triggers"
      subtitle={`${triggers.filter(t => t.is_active).length} active · ${triggers.length} total`}
      help="Rules that fire one action per contact when a per-contact condition is met. Different from anomaly alerts (which are tenant-wide), these are per-contact and de-duped 24h."
      actions={
        <button onClick={() => setCreating(true)} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New trigger
        </button>
      }
      loading={loading}
      error={error}
    >
      {creating && (
        <div className="mb-4 rounded-lg border-2 border-[#EF6C33] bg-orange-50 p-4">
          <div className="text-sm font-bold text-slate-900 mb-3">New workflow trigger</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Name *</div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5" autoFocus />
            </label>
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">When (trigger kind)</div>
              <select value={form.trigger_kind} onChange={(e) => setForm({ ...form, trigger_kind: e.target.value as TriggerKind })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                {(Object.keys(TRIGGER_KIND_META) as TriggerKind[]).map((k) => <option key={k} value={k}>{TRIGGER_KIND_META[k].label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs mb-2">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Condition (JSON)</div>
            <textarea value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} rows={3} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono text-xs" />
            <div className="text-[10px] text-slate-500 mt-1">
              Examples: <code>{"{ \"from_tier\":\"engaged\",\"to_tier\":\"at_risk\" }"}</code> · <code>{"{ \"gte\":80 }"}</code> · <code>{"{ \"gte_days\":30 }"}</code> · <code>{"{ \"tag_id\":42 }"}</code>
            </div>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Then (action kind)</div>
              <select value={form.action_kind} onChange={(e) => setForm({ ...form, action_kind: e.target.value as ActionKind })} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                {(Object.keys(ACTION_KIND_META) as ActionKind[]).map((k) => <option key={k} value={k}>{ACTION_KIND_META[k].label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Action config (JSON)</div>
            <textarea value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} rows={3} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono text-xs" />
            <div className="text-[10px] text-slate-500 mt-1">
              Examples: <code>{"{ \"template_key\":\"win_back\" }"}</code> · <code>{"{ \"tag_id\":42 }"}</code> · <code>{"{ \"event_type\":\"workflow.fired\" }"}</code>
            </div>
          </label>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setCreating(false)} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={create} className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">Create</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <aside>
          <ul className="space-y-1">
            {triggers.map((t) => {
              const TriggerIcon = TRIGGER_KIND_META[t.trigger_kind].icon;
              return (
                <li key={t.id}>
                  <button onClick={() => setSelectedId(t.id)} className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${selectedId === t.id ? "border-[#EF6C33] bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <div className="flex items-center gap-1.5">
                      <TriggerIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="font-semibold text-sm text-slate-900 truncate flex-1">{t.name}</span>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                        {t.is_active ? "Active" : "Off"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{TRIGGER_KIND_META[t.trigger_kind].label} → {ACTION_KIND_META[t.action_kind].label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Fired {t.fire_count.toLocaleString()}× · last {t.last_fired_at ? new Date(t.last_fired_at).toLocaleDateString() : "never"}</div>
                  </button>
                </li>
              );
            })}
            {triggers.length === 0 && (
              <li className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No triggers yet. Click "New trigger" to start.
              </li>
            )}
          </ul>
        </aside>

        <section>
          {selected ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{selected.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {TRIGGER_KIND_META[selected.trigger_kind].label} → {ACTION_KIND_META[selected.action_kind].label}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={fireTest} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                    <Play className="h-3 w-3" /> Test fire
                  </button>
                  <button onClick={() => toggle(selected)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                    {selected.is_active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove(selected.id)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-3">
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Condition</div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-words">{selected.condition_json}</pre>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Action</div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-words">{selected.action_config}</pre>
                </div>
              </div>

              <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Recent runs</div>
              {runs.length === 0 ? (
                <div className="text-xs italic text-slate-400">No runs yet.</div>
              ) : (
                <ul className="space-y-1 max-h-80 overflow-y-auto">
                  {runs.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-xs rounded border border-slate-200 px-2 py-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${r.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {r.status}
                        </span>
                        {r.contact_id != null && <span className="text-slate-600">Contact #{r.contact_id}</span>}
                        {r.detail && <span className="text-slate-500 truncate">{r.detail}</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{new Date(r.occurred_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
              <Zap className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              Select a trigger from the list to view its details and run log.
            </div>
          )}
        </section>
      </div>
    </SparkPageShell>
  );
}

export default SparkWorkflowTriggersPage;
