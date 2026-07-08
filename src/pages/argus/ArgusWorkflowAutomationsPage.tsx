// ArgusWorkflowAutomationsPage — P0-7 (Agency Foundation build, 2026-07-04).
//
// The ARGUS "Workflow & Automations" OBSERVE surface. Read-only in Phase 0:
//   • Onboarding WORKFLOWS   — the 4 seeded node workflows (grouped by
//                              workflow_key, ordered by node_seq) + the trivial
//                              WF-4 (customer) / WF-5 (crew) informational
//                              bindings. ARION provisioning nodes render
//                              "driver-managed" (advanced by arion-func).
//   • Business Rules         — the 26 event→action automation rules (reuses the
//                              existing /automations/rules list, unchanged).
//   • Run Log                — recent core.onboarding_step_status rows for this
//                              tenant (live observe rows + real runner rows).
//
// Backend: oliver-api routes/automations.js — GET /automations/workflows,
// GET /automations/rules, GET /automations/onboarding-runs. Uses the same
// useOliverApi hook (base URL + token + {data} unwrap) as OliverAutomationsPage.

import { useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface WorkflowNode {
  key: string;
  node_seq: number | null;
  name: string;
  step_id: string;
  label_friendly: string | null;
  driver_owned: boolean;
  driver: string | null;
  conditional: string | null;
  skip_allowed: boolean;
  terminal: boolean;
  emits_event: string | null;
  depends_on_event: string | null;
  tenant_override: boolean;
}
interface Workflow {
  workflow_key: string;
  label: string;
  trigger: string | null;
  driver: string | null;
  read_only: boolean;
  informational?: boolean;
  note?: string;
  node_count: number;
  nodes: WorkflowNode[];
}
interface BusinessRule {
  key: string;
  name: string;
  category: string;
  trigger_event: string;
  action_type: string;
  required_tier: string;
  is_system: boolean;
  is_enabled: boolean;
}
interface RunRow {
  run_id: string;
  step_id: string;
  status: string;
  attempt_count: number;
  updated_at: string | null;
  error: string | null;
}

type Tab = "workflows" | "rules" | "runs";

const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16, background: "#fff" };
const pill = (bg: string, fg: string): React.CSSProperties => ({ display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg });

export function ArgusWorkflowAutomationsPage() {
  const { get, ready } = useOliverApi();
  const [tab, setTab] = useState<Tab>("workflows");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (tab === "workflows") {
          const r = await get<{ workflows: Workflow[] }>("/automations/workflows");
          if (!cancelled) setWorkflows(r?.workflows || []);
        } else if (tab === "rules") {
          const r = await get<BusinessRule[]>("/automations/rules");
          if (!cancelled) setRules(r || []);
        } else {
          const r = await get<RunRow[]>("/automations/onboarding-runs?limit=100");
          if (!cancelled) setRuns(r || []);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, ready, get]);

  const rulesByCategory = useMemo(() => {
    const m = new Map<string, BusinessRule[]>();
    for (const r of rules) { if (!m.has(r.category)) m.set(r.category, []); m.get(r.category)!.push(r); }
    return [...m.entries()];
  }, [rules]);

  return (
    <OliverPageWrapper
      title="Workflow & Automations"
      subtitle="ARGUS · observe the onboarding workflows, business rules, and live runs across your platforms."
      loading={false}
      error={null}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([["workflows", "Onboarding Workflows"], ["rules", "Business Rules"], ["runs", "Run Log"]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer",
              background: tab === k ? "#1A3A4A" : "#fff", color: tab === k ? "#fff" : "#374151", fontWeight: 600, fontSize: 13,
            }}
          >{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: "#6b7280", padding: 24 }}>Loading…</div>}
      {error && <div style={{ color: "#9F1239", padding: 16, background: "#FEF2F2", borderRadius: 8 }}>Couldn’t load: {error}</div>}

      {!loading && !error && tab === "workflows" && (
        <div>
          {workflows.map((wf) => (
            <div key={wf.workflow_key} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{wf.label}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    <code>{wf.workflow_key}</code>
                    {wf.trigger && <> · trigger <code>{wf.trigger}</code></>}
                    {wf.driver && <> · driver <b>{wf.driver}</b></>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {wf.read_only && <span style={pill("#F1F5F9", "#475569")}>read-only</span>}
                  <span style={pill("#EFF6FF", "#1D4ED8")}>{wf.node_count} {wf.node_count === 1 ? "node" : "nodes"}</span>
                </div>
              </div>
              {wf.informational && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8, fontStyle: "italic" }}>{wf.note}</div>}
              {wf.nodes.length > 0 && (
                <ol style={{ margin: "12px 0 0", paddingLeft: 0, listStyle: "none" }}>
                  {wf.nodes.map((n) => (
                    <li key={n.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>
                      <span style={{ minWidth: 24, textAlign: "right", color: "#9ca3af", fontSize: 12 }}>{n.node_seq}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{n.name}</span>
                        <span style={{ color: "#9ca3af", fontSize: 12, marginLeft: 8 }}><code>{n.step_id}</code></span>
                      </span>
                      {n.driver_owned && <span style={pill("#FEF3C7", "#92400E")}>driver-managed</span>}
                      {n.conditional && <span style={pill("#EDE9FE", "#6D28D9")}>if {n.conditional}</span>}
                      {n.skip_allowed && <span style={pill("#F1F5F9", "#475569")}>skip-allowed</span>}
                      {n.terminal && <span style={pill("#FEE2E2", "#991B1B")}>terminal</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
            Onboarding workflows are read-only in this release. ARION provisioning steps are advanced by the arion-func driver; OLIVER steps by the synchronous onboarding routes.
          </div>
        </div>
      )}

      {!loading && !error && tab === "rules" && (
        <div>
          {rulesByCategory.map(([cat, list]) => (
            <div key={cat} style={card}>
              <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize", marginBottom: 8 }}>{cat.replace(/_/g, " ")}</div>
              {list.map((r) => (
                <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
                    <span style={{ color: "#9ca3af", fontSize: 12, marginLeft: 8 }}>on <code>{r.trigger_event}</code> → <code>{r.action_type}</code></span>
                  </span>
                  <span style={pill("#F1F5F9", "#475569")}>{r.required_tier}</span>
                  <span style={pill(r.is_enabled ? "#DCFCE7" : "#F3F4F6", r.is_enabled ? "#166534" : "#6b7280")}>{r.is_enabled ? "enabled" : "off"}</span>
                </div>
              ))}
            </div>
          ))}
          {rules.length === 0 && <div style={{ color: "#6b7280", padding: 16 }}>No business rules.</div>}
        </div>
      )}

      {!loading && !error && tab === "runs" && (
        <div style={card}>
          {runs.length === 0 && <div style={{ color: "#6b7280", padding: 8 }}>No onboarding runs recorded yet for this business.</div>}
          {runs.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>Step</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Attempts</th>
                  <th style={{ padding: "6px 8px" }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={`${r.run_id}-${r.step_id}-${i}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 8px" }}><code>{r.step_id}</code></td>
                    <td style={{ padding: "6px 8px" }}><span style={pill("#F1F5F9", "#475569")}>{r.status}</span></td>
                    <td style={{ padding: "6px 8px" }}>{r.attempt_count}</td>
                    <td style={{ padding: "6px 8px", color: "#6b7280" }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </OliverPageWrapper>
  );
}

export default ArgusWorkflowAutomationsPage;
