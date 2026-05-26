/**
 * OliverAutomationsPage — the new "Workflow & Automations" landing page.
 *
 * Supersedes the prior CX-add-on stub. Reads from the real Automations
 * engine API shipped 2026-05-26 (oliver-api routes/automations.js):
 *   - GET    /automations/rules
 *   - PATCH  /automations/rules/:key
 *   - GET    /automations/templates
 *   - PATCH  /automations/templates/:key/:channel
 *   - DELETE /automations/templates/:key/:channel
 *   - GET    /automations/runs
 *   - POST   /automations/rules/:key/test-fire
 *
 * Three tabs:
 *   - Rules:        toggle on/off, see params + tier gate, "Test fire" button
 *   - Templates:    customize message body per tenant; revert to system any time
 *   - Recent Runs:  last 100 fires for debugging (success/failed/skipped)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { Zap, Mail, MessageSquare, Bell, Lock, ChevronDown, ChevronRight } from "lucide-react";

interface AutomationRule {
  key: string;
  name: string;
  description?: string | null;
  category: string;
  trigger_event: string;
  action_type: string;
  required_tier: "all" | "lite" | "standard" | "pro" | "business" | "enterprise";
  is_system: boolean;
  is_enabled: boolean;
  effective_params: Record<string, unknown> | null;
  tenant_overrides_params: boolean;
}

interface NotificationTemplate {
  key: string;
  channel: "email" | "sms" | "push";
  system_subject?: string | null;
  system_body: string;
  tenant_subject?: string | null;
  tenant_body?: string | null;
  effective_subject?: string | null;
  effective_body: string;
  tenant_customized: boolean;
  tenant_updated_at?: string | null;
}

interface RunRow {
  run_id: string;
  rule_key: string;
  trigger_event: string;
  entity_type?: string | null;
  entity_id?: string | null;
  status: "success" | "failed" | "skipped";
  skip_reason?: string | null;
  error_message?: string | null;
  fired_at: string;
}

function tierLabel(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }

const CATEGORY_LABEL: Record<string, string> = {
  customer_comms: "Customer Communications",
  billing: "Billing & Payments",
  orchestration: "Auto-Orchestration (Pro+)",
  lifecycle: "Lifecycle",
};
const CATEGORY_ORDER = ["customer_comms", "billing", "orchestration", "lifecycle"];

export function OliverAutomationsPage() {
  const { get, patch, post, del, ready } = useOliverApi();
  const [tab, setTab] = useState<"rules" | "templates" | "runs">("rules");
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [openRule, setOpenRule] = useState<string | null>(null);
  const [editingTpl, setEditingTpl] = useState<{ key: string; channel: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "rules") setRules(await get<AutomationRule[]>("/automations/rules") || []);
      else if (tab === "templates") setTemplates(await get<NotificationTemplate[]>("/automations/templates") || []);
      else setRuns(await get<RunRow[]>("/automations/runs?limit=100") || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get, tab]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function toggleRule(rule: AutomationRule, next: boolean) {
    setRules((rows) => rows.map((r) => r.key === rule.key ? { ...r, is_enabled: next } : r));
    try { await patch(`/automations/rules/${rule.key}`, { is_enabled: next }); }
    catch (e) {
      setRules((rows) => rows.map((r) => r.key === rule.key ? { ...r, is_enabled: !next } : r));
      alert(`Couldn't update: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function testFire(rule: AutomationRule) {
    try {
      await post(`/automations/rules/${rule.key}/test-fire`, {
        payload: {
          customer_first: "Test", customer_name: "Test Customer",
          business_name: "Your Business", service_name: "Test Service",
          amount: "$100", invoice_number: "INV-99999",
          job_date: "Tomorrow", job_time: "10:00 AM",
          plan_name: "Test Plan", renewal_date: "next week",
        },
      });
      alert(`Test fired for "${rule.name}". Check the Recent Runs tab.`);
    } catch (e) { alert(`Test fire failed: ${e instanceof Error ? e.message : "unknown"}`); }
  }

  const grouped = useMemo(() => {
    const out: Record<string, AutomationRule[]> = {};
    for (const r of rules) { if (!out[r.category]) out[r.category] = []; out[r.category].push(r); }
    return out;
  }, [rules]);

  return (
    <OliverPageWrapper title="Workflow & Automations" subtitle="Rules + message templates" error={error} loading={loading && !rules.length && !templates.length && !runs.length}>
      <PageHeader
        title="Workflow & Automations"
        subtitle="Pre-built rules toggle on/off — automate booking confirmations, reminders, invoices, and more."
      />

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", marginBottom: 16 }}>
        {(["rules","templates","runs"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
            fontSize: 13, fontWeight: tab === t ? 600 : 500,
            color: tab === t ? "#1A7DB5" : "#5A7A8A",
            borderBottom: tab === t ? "2px solid #1A7DB5" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t === "rules" ? "Automation Rules" : t === "templates" ? "Notification Templates" : "Recent Runs"}
          </button>
        ))}
      </div>

      {tab === "rules" && CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => (
        <div key={cat} className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            {CATEGORY_LABEL[cat] || cat}
          </div>
          {grouped[cat].map((rule) => (
            <RuleRow key={rule.key} rule={rule}
              isOpen={openRule === rule.key}
              onToggleOpen={() => setOpenRule(openRule === rule.key ? null : rule.key)}
              onToggleEnabled={(next) => toggleRule(rule, next)}
              onTestFire={() => testFire(rule)} />
          ))}
        </div>
      ))}

      {tab === "templates" && (
        <div className="card">
          <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 12 }}>
            Edit the body of any system message. Your changes override the default but only for your tenant.
            Hit "Revert" to drop your customization.
          </div>
          {!templates.length && !loading && (
            <div style={{ padding: 16, color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>No templates loaded.</div>
          )}
          {templates.map((tpl) => (
            <TemplateRow key={`${tpl.key}-${tpl.channel}`} tpl={tpl}
              isEditing={editingTpl?.key === tpl.key && editingTpl?.channel === tpl.channel}
              onEdit={() => setEditingTpl({ key: tpl.key, channel: tpl.channel })}
              onCancel={() => setEditingTpl(null)}
              onSave={async (subject, body) => {
                try { await patch(`/automations/templates/${tpl.key}/${tpl.channel}`, { subject, body }); setEditingTpl(null); reload(); }
                catch (e) { alert(`Save failed: ${e instanceof Error ? e.message : "unknown"}`); }
              }}
              onRevert={async () => {
                if (!confirm(`Revert "${tpl.key}" (${tpl.channel}) to system default?`)) return;
                try { await del(`/automations/templates/${tpl.key}/${tpl.channel}`); reload(); }
                catch (e) { alert(`Revert failed: ${e instanceof Error ? e.message : "unknown"}`); }
              }} />
          ))}
        </div>
      )}

      {tab === "runs" && (
        <div className="card">
          <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 12 }}>
            Last 100 automation fires. If a rule didn't do what you expected, look here.
          </div>
          {!runs.length && (
            <div style={{ padding: 16, color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No automation runs yet. Jobs, bookings, invoices fill this in as they happen.
            </div>
          )}
          {runs.map((r) => (
            <div key={r.run_id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, padding: "8px 0", borderBottom: "1px solid #F1F5F9", alignItems: "center" }}>
              <StatusDot status={r.status} />
              <div>
                <div style={{ fontSize: 12, color: "#0B1C24", fontWeight: 500 }}>{r.rule_key}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>
                  {r.trigger_event}{r.entity_type ? ` · ${r.entity_type}` : ""}
                  {r.skip_reason ? ` · skipped: ${r.skip_reason}` : ""}
                  {r.error_message ? ` · ${r.error_message.slice(0, 80)}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#5A7A8A" }}>{r.status}</div>
              <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{new Date(r.fired_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </OliverPageWrapper>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "success" ? "#10B981" : status === "failed" ? "#EF4444" : "#F59E0B";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />;
}

function actionIcon(action: string) {
  if (action.startsWith("send_email")) return <Mail size={14} color="#5A7A8A" />;
  if (action.startsWith("send_sms")) return <MessageSquare size={14} color="#5A7A8A" />;
  if (action.startsWith("send_push")) return <Bell size={14} color="#5A7A8A" />;
  return <Zap size={14} color="#5A7A8A" />;
}

function RuleRow({ rule, isOpen, onToggleOpen, onToggleEnabled, onTestFire }: {
  rule: AutomationRule; isOpen: boolean; onToggleOpen: () => void;
  onToggleEnabled: (next: boolean) => void; onTestFire: () => void;
}) {
  const locked = rule.required_tier === "pro" || rule.required_tier === "business" || rule.required_tier === "enterprise";
  const tierBadge = rule.required_tier !== "all" && rule.required_tier !== "lite" && (
    <span style={{
      display: "inline-block", padding: "1px 6px", fontSize: 9, fontWeight: 700,
      borderRadius: 999, marginLeft: 8, letterSpacing: 0.4, textTransform: "uppercase",
      background: rule.required_tier === "pro" ? "#FEF3C7" : rule.required_tier === "business" ? "#E0E7FF" : "#F1F5F9",
      color: rule.required_tier === "pro" ? "#92400E" : rule.required_tier === "business" ? "#3730A3" : "#475569",
    }}>{tierLabel(rule.required_tier)}+</span>
  );

  return (
    <div style={{ borderBottom: "1px solid #F1F5F9", padding: "10px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center" }}>
        <button onClick={onToggleOpen} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }} title="Details">
          {isOpen ? <ChevronDown size={14} color="#5A7A8A" /> : <ChevronRight size={14} color="#5A7A8A" />}
        </button>
        <div>
          <div style={{ fontSize: 13, color: "#0B1C24", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            {actionIcon(rule.action_type)}
            {rule.name}
            {tierBadge}
          </div>
          {rule.description && (
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2, lineHeight: 1.4 }}>{rule.description}</div>
          )}
        </div>
        <Button variant="ghost" onClick={onTestFire}>Test fire</Button>
        <ToggleSwitch checked={rule.is_enabled} onChange={onToggleEnabled} />
      </div>

      {isOpen && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#F8FAFC", borderRadius: 6, fontSize: 11, color: "#475569" }}>
          <div><strong>Trigger:</strong> <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 3 }}>{rule.trigger_event}</code></div>
          <div style={{ marginTop: 4 }}><strong>Action:</strong> <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 3 }}>{rule.action_type}</code></div>
          {rule.effective_params && Object.keys(rule.effective_params).length > 0 && (
            <div style={{ marginTop: 4 }}>
              <strong>Parameters:</strong>{" "}
              <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>
                {JSON.stringify(rule.effective_params)}
              </code>
              {rule.tenant_overrides_params && (
                <span style={{ marginLeft: 8, color: "#92400E", fontWeight: 600 }}>(customized)</span>
              )}
            </div>
          )}
          {locked && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 4, color: "#78350F", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Lock size={12} /> This rule requires {tierLabel(rule.required_tier)}+ to fire. You can toggle it on now; it'll be skipped at runtime until you upgrade.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked}
      style={{
        position: "relative", width: 36, height: 20, borderRadius: 999,
        background: checked ? "#10B981" : "#CBD5E1", border: "none", cursor: "pointer",
        transition: "background 0.15s",
      }}>
      <span style={{
        position: "absolute", top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "left 0.15s",
      }} />
    </button>
  );
}

function TemplateRow({ tpl, isEditing, onEdit, onCancel, onSave, onRevert }: {
  tpl: NotificationTemplate; isEditing: boolean;
  onEdit: () => void; onCancel: () => void;
  onSave: (subject: string | null, body: string) => void; onRevert: () => void;
}) {
  const [draftSubject, setDraftSubject] = useState(tpl.effective_subject || "");
  const [draftBody, setDraftBody] = useState(tpl.effective_body);

  useEffect(() => {
    if (isEditing) { setDraftSubject(tpl.effective_subject || ""); setDraftBody(tpl.effective_body); }
  }, [isEditing, tpl]);

  const Icon = tpl.channel === "email" ? Mail : tpl.channel === "sms" ? MessageSquare : Bell;
  return (
    <div style={{ borderBottom: "1px solid #F1F5F9", padding: "12px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "#0B1C24", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon size={14} color="#5A7A8A" />
            <code style={{ fontSize: 12 }}>{tpl.key}</code>
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "#F1F5F9", color: "#475569", textTransform: "uppercase", letterSpacing: 0.4 }}>{tpl.channel}</span>
            {tpl.tenant_customized && (
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", textTransform: "uppercase", letterSpacing: 0.4 }}>customized</span>
            )}
          </div>
          {!isEditing && tpl.effective_subject && (
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4 }}><strong>Subject:</strong> {tpl.effective_subject}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {!isEditing && <Button variant="ghost" onClick={onEdit}>{tpl.tenant_customized ? "Edit" : "Customize"}</Button>}
          {tpl.tenant_customized && !isEditing && <Button variant="ghost" onClick={onRevert}>Revert</Button>}
        </div>
      </div>

      {isEditing ? (
        <div style={{ marginTop: 10 }}>
          {tpl.channel === "email" && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>Subject</label>
              <input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 12, marginTop: 3 }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>Body</label>
            <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 12, fontFamily: "inherit", marginTop: 3, resize: "vertical" }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "#5A7A8A" }}>
            Merge tokens: <code>{"{{customer_first}}"}</code> <code>{"{{business_name}}"}</code> <code>{"{{amount}}"}</code> <code>{"{{invoice_number}}"}</code> <code>{"{{service_name}}"}</code> <code>{"{{job_date}}"}</code> <code>{"{{job_time}}"}</code> etc.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={() => onSave(tpl.channel === "email" ? draftSubject : null, draftBody)}>Save changes</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 6, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 11, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" }}>
          {tpl.effective_body}
        </div>
      )}
    </div>
  );
}

export default OliverAutomationsPage;
