// SparkAutomationBuilderPage — visual flow builder for SPARK automations
//
// Lists existing automations, lets you create/edit one with a linear step list
// (with branch_yes/branch_no for branch_score / branch_email_opened). Shows
// recent run log + per-status stats.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Save, Play, Pause, Trash2, ChevronRight, Activity, GitBranch } from "lucide-react";

interface Automation {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  config: string | null;
  created_at: string;
}

type StepType = "send_email" | "send_sms" | "wait" | "tag" | "update_field" | "branch_score" | "branch_email_opened" | "end";

interface Step {
  id: number;
  automation_id: number;
  sort_order: number;
  step_type: StepType;
  config: string | null;
  next_step_id_default: number | null;
  next_step_id_branch_yes: number | null;
  next_step_id_branch_no: number | null;
}

interface RunLog {
  id: number;
  step_id: number | null;
  step_type: string | null;
  contact_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
  result_json: string | null;
  error_message: string | null;
  duration_ms: number | null;
  occurred_at: string;
}

interface Stats {
  active_enrollments: number;
  completed_enrollments: number;
  total_steps_run: number;
  executed: number;
  failed: number;
  skipped: number;
}

const STEP_DEFAULTS: Record<StepType, object> = {
  send_email: { template_key: "auth.welcome" },
  send_sms: { message: "Hi {{contact.first_name}}, …" },
  wait: { hours: 24 },
  tag: { tag_name: "engaged" },
  update_field: { field: "stage", value: "engaged" },
  branch_score: { gte: 50 },
  branch_email_opened: {},
  end: {},
};

export function SparkAutomationBuilderPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const [list, setList] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [draft, setDraft] = useState<{ name: string; type: string; is_active: boolean }>({ name: "", type: "drip", is_active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Automation[] }>("/api/v1/automations");
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchAutomationDetail = useCallback(async (id: number) => {
    try {
      const [stepsR, runsR, statsR] = await Promise.all([
        get<{ data: Step[] }>(`/api/v1/automations/${id}/steps`),
        get<{ data: RunLog[] }>(`/api/v1/automations/${id}/runs?limit=50`),
        get<{ data: Stats }>(`/api/v1/automations/${id}/stats`),
      ]);
      setSteps(stepsR?.data || []);
      setRuns(runsR?.data || []);
      setStats(statsR?.data || null);
    } catch (err) { console.error(err); }
  }, [get]);

  useEffect(() => {
    if (!selectedId) { setSteps([]); setRuns([]); setStats(null); setDraft({ name: "", type: "drip", is_active: false }); return; }
    const a = list.find(x => x.id === selectedId);
    if (a) setDraft({ name: a.name, type: a.type, is_active: a.is_active });
    fetchAutomationDetail(selectedId);
  }, [selectedId, list, fetchAutomationDetail]);

  async function createNew() {
    try {
      const r = await post<{ data: Automation }>("/api/v1/automations", {
        name: "New automation", type: "drip", is_active: false, config: {},
      });
      await fetchList();
      setSelectedId(r.data.id);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function saveAutomation() {
    if (!selectedId) return;
    try {
      await put(`/api/v1/automations/${selectedId}`, { ...draft });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleActive() {
    if (!selectedId) return;
    try {
      await put(`/api/v1/automations/${selectedId}`, { is_active: !draft.is_active });
      setDraft(d => ({ ...d, is_active: !d.is_active }));
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function deleteAutomation() {
    if (!selectedId) return;
    if (!confirm("Delete this automation? Active enrollments will stop.")) return;
    try {
      await del(`/api/v1/automations/${selectedId}`);
      setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function addStep(stepType: StepType) {
    if (!selectedId) return;
    try {
      await post(`/api/v1/automations/${selectedId}/steps`, {
        sort_order: steps.length,
        step_type: stepType,
        config: STEP_DEFAULTS[stepType],
      });
      await fetchAutomationDetail(selectedId);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function deleteStep(stepId: number) {
    if (!confirm("Remove this step?")) return;
    try {
      await del(`/api/v1/automation-steps/${stepId}`);
      await fetchAutomationDetail(selectedId!);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const statusPill = (s: string) => {
    const colors: Record<string, string> = {
      executed: "bg-emerald-50 text-emerald-700 border-emerald-200",
      skipped: "bg-slate-100 text-slate-600 border-slate-200",
      failed: "bg-rose-50 text-rose-700 border-rose-200",
      completed: "bg-blue-50 text-blue-700 border-blue-200",
      exited: "bg-amber-50 text-amber-700 border-amber-200",
    };
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${colors[s] || colors.skipped}`}>{s}</span>;
  };

  return (
    <SparkPageShell
      title="Automations"
      subtitle={`${list.length} automation${list.length === 1 ? "" : "s"}`}
      help="Build multi-step workflows that fire on triggers (new lead, form submission, tag added). Each step can send email/SMS, wait, branch on score or engagement, tag, or update a field. Runs continuously in the background."
      actions={
        <button onClick={createNew} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] hover:bg-[#d75a25] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New automation
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Automations list */}
        <div className="lg:col-span-1 border border-slate-200 rounded max-h-[700px] overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No automations.</div>}
          {list.map(a => (
            <button key={a.id} onClick={() => setSelectedId(a.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === a.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">{a.name}</div>
                  <div className="text-[11px] text-slate-500">{a.type}</div>
                </div>
                {a.is_active
                  ? <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">Live</span>
                  : <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-500">Paused</span>}
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {!selectedId && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Select an automation to edit, or click "New automation".
            </div>
          )}
          {selectedId && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="border border-slate-200 rounded p-3 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 flex-1">
                  <input value={draft.name} onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                    className="text-sm font-semibold border-0 bg-transparent focus:bg-white focus:border focus:border-slate-300 rounded px-2 py-1 flex-1" />
                  <select value={draft.type} onChange={(e) => setDraft(d => ({ ...d, type: e.target.value }))}
                    className="text-xs border border-slate-300 rounded p-1">
                    <option>drip</option><option>onboarding</option><option>nurture</option><option>winback</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={saveAutomation} className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1">
                    <Save className="h-3 w-3" /> Save
                  </button>
                  <button onClick={toggleActive} className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 ${draft.is_active ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {draft.is_active ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Activate</>}
                  </button>
                  <button onClick={deleteAutomation} className="text-xs px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>

              {/* Stats strip */}
              {stats && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  <Stat label="Active" value={stats.active_enrollments} />
                  <Stat label="Completed" value={stats.completed_enrollments} />
                  <Stat label="Steps run" value={stats.total_steps_run} />
                  <Stat label="Executed" value={stats.executed} accent="emerald" />
                  <Stat label="Failed" value={stats.failed} accent="rose" />
                  <Stat label="Skipped" value={stats.skipped} />
                </div>
              )}

              {/* Step list */}
              <div className="border border-slate-200 rounded">
                <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="text-xs font-semibold uppercase text-slate-600">Flow</div>
                  <div className="flex flex-wrap gap-1">
                    {(["send_email", "send_sms", "wait", "tag", "update_field", "branch_score", "branch_email_opened", "end"] as StepType[]).map(s => (
                      <button key={s} onClick={() => addStep(s)} className="text-[10px] px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100">
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {steps.length === 0 && <div className="text-center text-sm text-slate-500 py-6">No steps yet. Add one above.</div>}
                  {steps.map((s, i) => (
                    <div key={s.id} className="border border-slate-200 rounded p-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-bold text-slate-500 w-6">#{i + 1}</div>
                          {s.step_type.startsWith("branch_") && <GitBranch className="h-4 w-4 text-[#EF6C33]" />}
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{s.step_type}</div>
                            <code className="text-[10px] text-slate-500">{s.config || "{}"}</code>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingStepIdx(editingStepIdx === i ? null : i)} className="text-[10px] px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50">
                            {editingStepIdx === i ? "Done" : "Edit"}
                          </button>
                          <button onClick={() => deleteStep(s.id)} className="text-[10px] px-2 py-0.5 rounded text-rose-600 hover:bg-rose-50">Delete</button>
                        </div>
                      </div>
                      {editingStepIdx === i && (
                        <StepEditor step={s} onSaved={() => fetchAutomationDetail(selectedId)} api={{ put }} />
                      )}
                      {i < steps.length - 1 && <div className="flex justify-center mt-2"><ChevronRight className="h-3 w-3 text-slate-300 rotate-90" /></div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent runs */}
              <div className="border border-slate-200 rounded">
                <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
                  <Activity className="h-4 w-4 text-slate-500" />
                  <div className="text-xs font-semibold uppercase text-slate-600">Recent runs ({runs.length})</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {runs.length === 0 && <div className="text-center text-xs text-slate-500 py-4">No runs yet.</div>}
                  {runs.map(r => (
                    <div key={r.id} className="px-3 py-2 border-b border-slate-100 text-xs flex items-center gap-2">
                      {statusPill(r.status)}
                      <div className="flex-1 truncate">
                        <span className="font-medium">{r.first_name || r.email || `contact #${r.contact_id}`}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="text-slate-600">{r.step_type}</span>
                        {r.error_message && <span className="ml-1 text-rose-600">— {r.error_message}</span>}
                      </div>
                      <div className="text-slate-400">{new Date(r.occurred_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "rose" }) {
  const color = accent === "emerald" ? "text-emerald-700" : accent === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="p-2 rounded border border-slate-200 bg-white">
      <div className="text-[10px] uppercase font-semibold text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function StepEditor({ step, onSaved, api }: { step: Step; onSaved: () => void; api: { put: <T>(p: string, b: unknown) => Promise<T> } }) {
  const [cfg, setCfg] = useState<string>(step.config || "{}");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      let parsed: unknown = {};
      try { parsed = JSON.parse(cfg); } catch { alert("Config must be valid JSON"); setSaving(false); return; }
      await api.put(`/api/v1/automation-steps/${step.id}`, { config: parsed });
      onSaved();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <label className="text-[10px] uppercase font-semibold text-slate-500">Step config (JSON)</label>
      <textarea value={cfg} onChange={(e) => setCfg(e.target.value)} rows={4}
        className="w-full font-mono text-[11px] border border-slate-200 rounded p-2 mt-1" />
      <div className="flex justify-end mt-2">
        <button disabled={saving} onClick={save} className="text-xs px-3 py-1 rounded bg-[#EF6C33] text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save step"}
        </button>
      </div>
    </div>
  );
}

export default SparkAutomationBuilderPage;
