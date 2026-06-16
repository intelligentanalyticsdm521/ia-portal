// SparkCustomerFlowPage — Pick / view / customize the tenant's customer lifecycle flow.
//
// Default = Standard (5 stages). Tenant can pick from 5 templates + later
// rename stage labels per their own vocabulary.
//
// Endpoints:
//   GET    /api/v1/customer-flows                  list all 5 templates with stages
//   GET    /api/v1/tenant/customer-flow            tenant's current selection
//   POST   /api/v1/tenant/customer-flow            { flow_id, stage_overrides? }

import { useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Check, Edit2, AlertCircle } from "lucide-react";

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
  name: string;
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

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) || null;

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
            <div className="font-medium">Currently using: {current.name}</div>
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
              onClick={() => { setSelectedFlowId(f.id); setOverrides({}); setEditingLabels(false); }}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {selectedFlow.stages.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-gray-400 w-6 text-right">{s.sort_order / 10}.</span>
                {editingLabels ? (
                  <input
                    type="text"
                    value={overrides[s.code] ?? s.label}
                    onChange={(e) => setOverrides({ ...overrides, [s.code]: e.target.value })}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                ) : (
                  <span>{overrides[s.code] ?? s.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !selectedFlowId || selectedFlowId === current?.flow_id && !Object.keys(overrides).length}
          className="px-4 py-2 bg-sparkOrange text-white rounded-lg text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedMsg && <div className="text-xs text-gray-600">{savedMsg}</div>}
      </div>
    </SparkPageShell>
  );
}
