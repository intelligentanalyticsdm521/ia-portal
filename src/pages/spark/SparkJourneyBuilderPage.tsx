// SparkJourneyBuilderPage — visual graph editor for automation flows.
//
// Renders an automation's steps as a tree where each step shows its
// next_step_id_default + branch_yes + branch_no edges. User can:
//   - drag (visual reorder via sort_order)
//   - click any step to edit its config + edges
//   - draw an edge by clicking "Connect to step #X" from a step's edit panel
//
// Distinct from the existing SparkAutomationBuilderPage (which is the
// list-based editor). This page is the "graph view" for branching journeys.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Mail, MessageSquare, Clock, Tag as TagIcon, GitBranch, RefreshCw, Edit2, Trash2, Save, Plus, ArrowDown } from "lucide-react";

interface Automation { id: number; name: string; type: string; is_active: boolean; }
interface Step {
  id: number;
  automation_id: number;
  sort_order: number;
  step_type: string;
  config: string | null;
  next_step_id_default: number | null;
  next_step_id_branch_yes: number | null;
  next_step_id_branch_no: number | null;
}

const TYPE_ICONS: Record<string, typeof Mail> = {
  send_email: Mail, send_sms: MessageSquare, wait: Clock, tag: TagIcon,
  update_field: Edit2, branch_score: GitBranch, branch_email_opened: GitBranch,
};
const TYPE_COLORS: Record<string, string> = {
  send_email: "#3B82F6", send_sms: "#10B981", wait: "#F59E0B", tag: "#8B5CF6",
  update_field: "#64748B", branch_score: "#EF6C33", branch_email_opened: "#EF6C33", end: "#0B1C24",
};

export function SparkJourneyBuilderPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editCfg, setEditCfg] = useState("");
  const [editDefault, setEditDefault] = useState("");
  const [editYes, setEditYes] = useState("");
  const [editNo, setEditNo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchAutomations = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Automation[] }>("/api/v1/automations");
      setAutomations(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  const fetchSteps = useCallback(async (id: number) => {
    try {
      const r = await get<{ data: Step[] }>(`/api/v1/automations/${id}/steps`);
      setSteps(r?.data || []);
    } catch (err) { console.error(err); }
  }, [get]);

  useEffect(() => { if (selectedId) fetchSteps(selectedId); else setSteps([]); }, [selectedId, fetchSteps]);

  const editing = useMemo(() => steps.find(s => s.id === editingStepId) || null, [steps, editingStepId]);
  useEffect(() => {
    if (!editing) return;
    setEditCfg(editing.config || "{}");
    setEditDefault(editing.next_step_id_default ? String(editing.next_step_id_default) : "");
    setEditYes(editing.next_step_id_branch_yes ? String(editing.next_step_id_branch_yes) : "");
    setEditNo(editing.next_step_id_branch_no ? String(editing.next_step_id_branch_no) : "");
  }, [editing]);

  async function saveEdit() {
    if (!editingStepId) return;
    let parsed = {};
    try { parsed = JSON.parse(editCfg || "{}"); } catch { alert("Config must be valid JSON"); return; }
    try {
      await put(`/api/v1/automation-steps/${editingStepId}`, {
        config: parsed,
        next_step_id_default: editDefault ? parseInt(editDefault) : null,
        next_step_id_branch_yes: editYes ? parseInt(editYes) : null,
        next_step_id_branch_no: editNo ? parseInt(editNo) : null,
      });
      setEditingStepId(null);
      if (selectedId) await fetchSteps(selectedId);
    } catch (err) { alert(`Save failed: ${(err as Error).message}`); }
  }

  async function addStep(stepType: string) {
    if (!selectedId) return;
    try {
      await post(`/api/v1/automations/${selectedId}/steps`, {
        sort_order: steps.length, step_type: stepType, config: {},
      });
      await fetchSteps(selectedId);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function deleteStep(id: number) {
    if (!confirm("Remove this step? Edges pointing to it will break.")) return;
    try {
      await del(`/api/v1/automation-steps/${id}`);
      if (selectedId) await fetchSteps(selectedId);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  // Build adjacency for visual edges
  const edges = useMemo(() => {
    const e: { from: number; to: number; type: "default" | "yes" | "no" }[] = [];
    for (const s of steps) {
      if (s.next_step_id_default) e.push({ from: s.id, to: s.next_step_id_default, type: "default" });
      if (s.next_step_id_branch_yes) e.push({ from: s.id, to: s.next_step_id_branch_yes, type: "yes" });
      if (s.next_step_id_branch_no) e.push({ from: s.id, to: s.next_step_id_branch_no, type: "no" });
    }
    return e;
  }, [steps]);

  // "I can't create new journeys" — the page really could not. It listed
  // automations and added steps to whichever one was selected, and the empty
  // state told you to go to a different page to make one. POST /automations
  // has always existed; nothing here called it.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function createJourney() {
    const name = newName.trim();
    if (!name) return;
    try {
      const r = await post<{ data: { id: number } }>("/api/v1/automations", {
        name,
        // 'journey' is the multi-step type this page edits. Created paused, so
        // an empty journey cannot start enrolling people the moment it exists.
        type: "journey",
        is_active: false,
      });
      setNewName("");
      setCreating(false);
      await fetchAutomations();
      if (r?.data?.id) setSelectedId(r.data.id);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SparkPageShell
      title="Journey Builder"
      subtitle={`${automations.length} automation${automations.length === 1 ? "" : "s"}`}
      actions={
        <button onClick={() => setCreating(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New journey
        </button>
      }
      help="Visual graph editor for multi-step automation journeys. Click a step to edit its config and wire its branch_yes / branch_no / default-next edges to specific step IDs. Branching steps (branch_score, branch_email_opened) use the yes/no edges."
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-1 border border-slate-200 rounded max-h-[700px] overflow-y-auto">
          {automations.map(a => (
            <button key={a.id} onClick={() => setSelectedId(a.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === a.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="text-sm font-semibold">{a.name}</div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>{a.type}</span>
                {a.is_active ? <span className="text-emerald-700">Live</span> : <span className="text-slate-500">Paused</span>}
              </div>
            </button>
          ))}
        </div>

        {creating && (
          <div className="lg:col-span-4 rounded border border-[#EF6C33]/40 bg-[#EF6C33]/5 p-3">
            <div className="text-sm font-medium text-slate-800">Name this journey</div>
            <p className="mt-0.5 text-xs text-slate-600">
              It starts paused, so you can lay out the steps before anybody enters it.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createJourney(); } }}
                placeholder="New OLIVER client onboarding"
                className="min-w-[16rem] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button onClick={createJourney} disabled={!newName.trim()} className="spark-btn spark-btn-accent spark-btn-sm">
                Create
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-xs text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="lg:col-span-3">
          {!selectedId && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Pick a journey on the left to see its steps — or start a new one with <strong>New journey</strong> above.
            </div>
          )}
          {selectedId && (
            <>
              {/* Action bar */}
              <div className="border border-slate-200 rounded p-2 mb-3 flex items-center justify-between bg-slate-50">
                <div className="text-xs font-semibold uppercase text-slate-600">Flow graph</div>
                <div className="flex flex-wrap gap-1">
                  {(["send_email", "send_sms", "wait", "tag", "update_field", "branch_score", "branch_email_opened", "end"]).map(t => (
                    <button key={t} onClick={() => addStep(t)} className="text-[10px] px-2 py-0.5 rounded border border-slate-200 hover:bg-white">
                      <Plus className="h-2.5 w-2.5 inline mr-0.5" />{t}
                    </button>
                  ))}
                  <button onClick={() => fetchSteps(selectedId)} className="text-[10px] px-2 py-0.5 rounded border border-slate-200 hover:bg-white">
                    <RefreshCw className="h-2.5 w-2.5 inline mr-0.5" /> Refresh
                  </button>
                </div>
              </div>

              {/* Graph nodes */}
              <div className="border border-slate-200 rounded p-4 bg-white space-y-2">
                {steps.length === 0 && <div className="text-center text-sm text-slate-500 py-6">No steps. Add one above.</div>}
                {steps.sort((a, b) => a.sort_order - b.sort_order).map((s, i) => {
                  const Icon = TYPE_ICONS[s.step_type] || Mail;
                  const color = TYPE_COLORS[s.step_type] || "#64748B";
                  const isBranch = s.step_type.startsWith("branch_");
                  return (
                    <div key={s.id}>
                      <div className="flex items-start gap-3">
                        <div className="w-12 text-right">
                          <div className="text-[10px] text-slate-400 font-mono">#{s.id}</div>
                          <div className="text-[10px] text-slate-400">i={i}</div>
                        </div>
                        <button
                          onClick={() => setEditingStepId(s.id === editingStepId ? null : s.id)}
                          className={`flex-1 flex items-start gap-2 p-3 rounded-lg border-2 transition text-left ${editingStepId === s.id ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200 hover:border-slate-300"}`}
                        >
                          <div className="rounded-full p-1.5" style={{ background: color + "22", color }}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-slate-900">{s.step_type}</div>
                            <code className="text-[10px] text-slate-500 block truncate">{s.config || "{}"}</code>
                            <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
                              {s.next_step_id_default != null && <span className="text-slate-500">→ #{s.next_step_id_default}</span>}
                              {s.next_step_id_branch_yes != null && <span className="text-emerald-700">✓ #{s.next_step_id_branch_yes}</span>}
                              {s.next_step_id_branch_no != null && <span className="text-rose-700">✗ #{s.next_step_id_branch_no}</span>}
                            </div>
                          </div>
                        </button>
                        <button onClick={() => deleteStep(s.id)} className="p-1 text-rose-600 hover:bg-rose-50 rounded">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Editor panel */}
                      {editingStepId === s.id && (
                        <div className="ml-15 mt-1 p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                          <div>
                            <label className="text-[10px] uppercase font-semibold text-slate-500">Config (JSON)</label>
                            <textarea value={editCfg} onChange={(e) => setEditCfg(e.target.value)} rows={3}
                              className="w-full font-mono text-[11px] border border-slate-300 rounded p-1.5" />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <EdgeInput label="Default next step ID" value={editDefault} onChange={setEditDefault} options={steps.map(x => x.id).filter(id => id !== s.id)} />
                            {isBranch && <EdgeInput label="Yes branch step ID" value={editYes} onChange={setEditYes} options={steps.map(x => x.id).filter(id => id !== s.id)} />}
                            {isBranch && <EdgeInput label="No branch step ID" value={editNo} onChange={setEditNo} options={steps.map(x => x.id).filter(id => id !== s.id)} />}
                          </div>
                          <div className="flex justify-end">
                            <button onClick={saveEdit} className="text-xs px-3 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1">
                              <Save className="h-3 w-3" /> Save edges
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Edge indicator (downward arrow if not branching) */}
                      {i < steps.length - 1 && !isBranch && (
                        <div className="flex justify-start ml-12 my-1">
                          <ArrowDown className="h-3 w-3 text-slate-300" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Edge legend */}
              <div className="text-[10px] text-slate-500 mt-2 flex gap-3">
                <span><span className="inline-block w-3 h-0.5 bg-slate-400 mr-1"></span>default-next</span>
                <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1"></span>yes-branch</span>
                <span><span className="inline-block w-3 h-0.5 bg-rose-500 mr-1"></span>no-branch</span>
                <span className="text-slate-400 ml-3">{edges.length} edges</span>
              </div>
            </>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

function EdgeInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: number[] }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-semibold text-slate-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border border-slate-300 rounded p-1">
        <option value="">(end)</option>
        {options.map(id => <option key={id} value={id}>Step #{id}</option>)}
      </select>
    </div>
  );
}

export default SparkJourneyBuilderPage;
