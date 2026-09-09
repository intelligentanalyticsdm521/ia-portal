// SparkCustomerFlowPage — pick a customer journey, then make it yours.
//
// SPARK pack 2: SAVE AS YOUR OWN FLOW. The onboarding checklist made picking a
// lifecycle flow a REQUIRED step, and the "make it my own" half answered 501
// ("lands in v1.1") — so the one screen a new client was told to finish had a
// button on it that refused.
//
// A business can now RENAME the stages, REORDER them, and save the result under
// its own name. Deliberately nothing more: no new stages, no deleting one, no
// score weights. Every rule that reads a stage still reads the template's stage
// CODES; only what the client SEES changes, which is what makes this safe
// without touching the scorer, the automations or the lifecycle engine.
//
// Endpoints:
//   GET    /api/v1/customer-flows                  list all templates with stages
//   GET    /api/v1/tenant/customer-flow            tenant's current selection
//   POST   /api/v1/tenant/customer-flow            { flow_id, stage_overrides? }
//   POST   /api/v1/customer-flows/custom           { template_flow_id, name, stages }

import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Check, Edit2, AlertCircle, ArrowUp, ArrowDown } from "lucide-react";

interface Stage {
  id: number;
  flow_id: number;
  code: string;
  label: string;
  description?: string | null;
  sort_order: number;
  is_terminal: boolean;
  score_weight: number;
}

interface Flow {
  id: number;
  code: string;
  name: string;
  description: string;
  stages: Stage[];
}

interface TenantFlow {
  flow_id: number;
  code: string;
  /** The business's own name for it, when it has given one. */
  name: string;
  /** The template it started from, so "Ours, based on Standard" can be said. */
  based_on?: string;
  is_custom?: boolean;
  description: string;
  stages: Stage[];
  is_default: boolean;
}

export default function SparkCustomerFlowPage() {
  const { get, post, ready } = useSparkApi();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [current, setCurrent] = useState<TenantFlow | null>(null);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // The client's own order, as a list of stage codes. Empty until they move
  // something — an untouched flow saves no order at all, so the template's
  // order keeps applying and a later change to the template still reaches them.
  const [order, setOrder] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLabels, setEditingLabels] = useState(false);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [all, mine] = await Promise.all([
          get<{ data: Flow[] }>("/api/v1/customer-flows"),
          get<{ data: TenantFlow }>("/api/v1/tenant/customer-flow"),
        ]);
        setFlows(all?.data || []);
        setCurrent(mine?.data || null);
        setSelectedFlowId(mine?.data?.flow_id || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [get, ready]);

  const rawFlow = flows.find((f) => f.id === selectedFlowId) || null;
  // The stages in the order the client is looking at right now.
  const selectedFlow = rawFlow && order.length
    ? {
      ...rawFlow,
      stages: [...rawFlow.stages].sort(
        (a, b) => (order.indexOf(a.code) + 1 || 999) - (order.indexOf(b.code) + 1 || 999)
      ),
    }
    : rawFlow;

  function move(code: string, by: -1 | 1) {
    if (!rawFlow) return;
    const codes = order.length ? [...order] : rawFlow.stages.map((x) => x.code);
    const i = codes.indexOf(code);
    const j = i + by;
    if (i < 0 || j < 0 || j >= codes.length) return;
    [codes[i], codes[j]] = [codes[j], codes[i]];
    setOrder(codes);
  }

  const dirty = Object.keys(overrides).length > 0 || order.length > 0 || !!customName.trim();

  /** Save it as the business's own flow: their words, their order, their name. */
  const saveAsOwn = async () => {
    if (!selectedFlowId || !rawFlow) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const codes = order.length ? order : rawFlow.stages.map((x) => x.code);
      const stages: Record<string, { label?: string; order?: number }> = {};
      for (const st of rawFlow.stages) {
        const entry: { label?: string; order?: number } = {};
        if (overrides[st.code] && overrides[st.code] !== st.label) entry.label = overrides[st.code];
        if (order.length) entry.order = codes.indexOf(st.code) + 1;
        if (Object.keys(entry).length) stages[st.code] = entry;
      }
      await post("/api/v1/customer-flows/custom", {
        template_flow_id: selectedFlowId,
        name: customName.trim() || `Our ${rawFlow.name.toLowerCase()}`,
        stages,
      });
      setSavedMsg("Saved as your own flow. Your pipeline uses these stages, in this order, with these names.");
      const mine = await get<{ data: TenantFlow }>("/api/v1/tenant/customer-flow");
      setCurrent(mine?.data || null);
      setEditingLabels(false);
      setOverrides({});
      setOrder([]);
      setCustomName("");
    } catch (e) {
      // The server names WHICH stage is wrong. Showing that beats "invalid".
      const msg = (e as { body?: { message?: string } })?.body?.message
        || (e instanceof Error ? e.message : "unknown error");
      setSavedMsg("Not saved: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFlowId) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      await post("/api/v1/tenant/customer-flow", {
        flow_id: selectedFlowId,
        stage_overrides: Object.keys(overrides).length ? overrides : null,
      });
      setSavedMsg("Saved. Your customer pipeline is now using this flow.");
      // Refetch
      const mine = await get<{ data: TenantFlow }>("/api/v1/tenant/customer-flow");
      setCurrent(mine?.data || null);
      setEditingLabels(false);
      setOverrides({});
    } catch (e: any) {
      setSavedMsg("Save failed: " + (e?.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SparkPageShell title="Customer Flow" loading={true}><div /></SparkPageShell>;

  return (
    <SparkPageShell
      title="Customer Lifecycle Flow"
      subtitle="Pick the customer journey your business follows. Stages drive scoring, automations, and reporting. You can rename any stage label to match your own vocabulary."
    >
      {current && !current.is_default && (
        <div className="mb-6 rounded-lg border border-sparkOrange/30 bg-sparkOrange/5 p-3 text-sm text-sparkOrange flex items-start gap-2">
          <Check size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">
              Currently using: {current.name}
              {current.is_custom && current.based_on ? ` — your own, based on ${current.based_on}` : ""}
            </div>
            <div className="text-sparkOrange/80 text-xs">{current.description}</div>
          </div>
        </div>
      )}
      {current?.is_default && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">No customer flow selected yet</div>
            <div className="text-amber-700 text-xs">Defaulting to Standard. Pick a flow below to formally adopt it (recommended during onboarding).</div>
          </div>
        </div>
      )}

      {/* Flow picker cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {flows.map((f) => {
          const isSelected = f.id === selectedFlowId;
          const isCurrent = f.id === current?.flow_id && !current?.is_default;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => { setSelectedFlowId(f.id); setOverrides({}); setOrder([]); setCustomName(""); setEditingLabels(false); }}
              className={`text-left rounded-xl border-2 p-4 transition ${
                isSelected ? "border-sparkOrange bg-sparkOrange/5" : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-semibold text-sm">{f.name}</div>
                {isCurrent && <span className="text-[10px] uppercase tracking-wider bg-sparkOrange/20 text-sparkOrange px-1.5 py-0.5 rounded">Current</span>}
                {isSelected && !isCurrent && <Check size={16} className="text-sparkOrange" />}
              </div>
              <div className="text-xs text-gray-600 mb-2">{f.description}</div>
              <div className="text-[11px] text-gray-500 flex flex-wrap gap-1">
                {f.stages.map((s) => (
                  <span key={s.id} className="px-1.5 py-0.5 bg-gray-100 rounded">{s.label}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage label customizer */}
      {selectedFlow && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm">Stages for {selectedFlow.name}</div>
            <button
              type="button"
              onClick={() => setEditingLabels((v) => !v)}
              className="text-xs flex items-center gap-1 text-gray-600 hover:text-sparkOrange"
            >
              <Edit2 size={12} /> {editingLabels ? "Done editing" : "Rename stages"}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {selectedFlow.stages.map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-right text-xs text-gray-400">{i + 1}.</span>
                {editingLabels ? (
                  <>
                    <input
                      type="text"
                      value={overrides[stage.code] ?? stage.label}
                      onChange={(e) => setOverrides({ ...overrides, [stage.code]: e.target.value })}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => move(stage.code, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${stage.label} earlier`}
                      className="rounded border border-gray-300 p-1 text-gray-600 disabled:opacity-30"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(stage.code, 1)}
                      disabled={i === selectedFlow.stages.length - 1}
                      aria-label={`Move ${stage.label} later`}
                      className="rounded border border-gray-300 p-1 text-gray-600 disabled:opacity-30"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </>
                ) : (
                  <span>{overrides[stage.code] ?? stage.label}</span>
                )}
              </div>
            ))}
          </div>

          {editingLabels && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <label className="block text-xs">
                <span className="mb-1 block font-semibold uppercase tracking-wider text-[10px] text-gray-500">
                  What do you call this flow?
                </span>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={`Our ${selectedFlow.name.toLowerCase()}`}
                  className="w-full max-w-sm rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <p className="mt-1 text-[11px] text-gray-500">
                Renaming and reordering changes what YOU see. It does not change what any
                automation, score or report does — those keep following the same stages.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Save */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !selectedFlowId || (selectedFlowId === current?.flow_id && !dirty)}
          className="rounded-lg bg-sparkOrange px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Use this flow"}
        </button>
        <button
          type="button"
          onClick={saveAsOwn}
          disabled={saving || !selectedFlowId || !dirty}
          title={dirty ? undefined : "Rename or reorder a stage first"}
          className="rounded-lg border border-sparkOrange px-4 py-2 text-sm font-medium text-sparkOrange disabled:opacity-40"
        >
          Save as our own flow
        </button>
        {savedMsg && <div className="text-xs text-gray-600">{savedMsg}</div>}
      </div>
    </SparkPageShell>
  );
}
