// F-70 + F-72 + F-63 — Workflow Settings
//
// Tenant-level policy that drives:
//   F-70 — customer-initiated reschedule (mode + windows + cap)
//   F-72 — post-booking actions (auto-invoice / confirmation / auto-assign)
//   F-63 — customer signup form (which fields, which are required)
//
// All three are wired to oliver.tenant_settings columns via:
//   /workflow-settings        (reschedule + booking)
//   /customer-signup/config   (signup form)

import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { SignupFormBuilder, type SignupConfig as SignupConfigFull } from "../../components/oliver/SignupFormBuilder";

interface WorkflowSettings {
  reschedule_mode: "auto_confirm" | "admin_approval" | "disabled";
  reschedule_advance_notice_hours: number;
  reschedule_cutoff_hours: number;
  reschedule_max_count: number;
  booking_auto_create_invoice: "never" | "on_confirm" | "on_completion";
  booking_auto_send_confirmation: boolean;
  booking_auto_assign_worker: "none" | "preferred" | "round_robin" | "skill_match";
  booking_followup_template_id: string | null;
}

interface SignupField {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
  required_locked: boolean;
}

interface SignupConfig {
  fields: SignupField[];
  custom_fields?: SignupConfigFull["custom_fields"];
  welcome_text: string;
  submit_label: string;
}

export function OliverWorkflowSettingsPage() {
  const { get, patch, ready } = useOliverApi();
  const [wf, setWf] = useState<WorkflowSettings | null>(null);
  const [signup, setSignup] = useState<SignupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingWf, setSavingWf] = useState(false);
  const [savingSignup, setSavingSignup] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [wfMsg, setWfMsg] = useState<string | null>(null);
  const [signupMsg, setSignupMsg] = useState<string | null>(null);
  // F-113 — full builder modal
  const [builderOpen, setBuilderOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, s] = await Promise.all([
        get<WorkflowSettings>("/workflow-settings"),
        get<SignupConfig>("/customer-signup/config"),
      ]);
      setWf(w);
      setSignup(s);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function saveWf() {
    if (!wf) return;
    setSavingWf(true);
    setWfMsg(null);
    setError(null);
    try {
      await patch("/workflow-settings", wf);
      setWfMsg("Saved.");
      setTimeout(() => setWfMsg(null), 4000);
    } catch (e) {
      setError(e);
    } finally {
      setSavingWf(false);
    }
  }

  async function saveSignup() {
    if (!signup) return;
    setSavingSignup(true);
    setSignupMsg(null);
    setError(null);
    try {
      const next = await patch<SignupConfig>("/customer-signup/config", signup);
      setSignup(next);
      setSignupMsg("Saved.");
      setTimeout(() => setSignupMsg(null), 4000);
    } catch (e) {
      setError(e);
    } finally {
      setSavingSignup(false);
    }
  }

  function setWfField<K extends keyof WorkflowSettings>(k: K, v: WorkflowSettings[K]) {
    setWf((cur) => (cur ? { ...cur, [k]: v } : cur));
  }
  function toggleSignupField(key: string, prop: "enabled" | "required", value: boolean) {
    setSignup((cur) => cur ? {
      ...cur,
      fields: cur.fields.map((f) => f.key === key ? { ...f, [prop]: value } : f),
    } : cur);
  }

  return (
    <OliverPageWrapper title="Workflow Settings" subtitle="Reschedule, booking, and signup policy" error={error} loading={loading && !wf && !signup}>
      <PageHeader
        title="Workflow Settings"
        subtitle="Set the rules that drive customer-initiated reschedules, what happens after a booking, and what your customers see when they sign up for your portal."
      />

      {/* ── F-70 Reschedule policy ───────────────────────────── */}
      {wf && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Reschedule policy</div>
              <div className="card-sub">Controls what happens when a customer tries to change a job's scheduled time from the customer portal.</div>
            </div>
            {wfMsg && <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{wfMsg}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Mode">
              <select value={wf.reschedule_mode} onChange={(e) => setWfField("reschedule_mode", e.target.value as WorkflowSettings["reschedule_mode"])} className="input">
                <option value="admin_approval">Admin approves each request</option>
                <option value="auto_confirm">Auto-confirm if the new time is allowed</option>
                <option value="disabled">Disabled — customer must call</option>
              </select>
            </Field>
            <Field label="Advance notice (hours)" hint="New time must be at least this many hours from now.">
              <input type="number" min={0} value={wf.reschedule_advance_notice_hours}
                onChange={(e) => setWfField("reschedule_advance_notice_hours", Number(e.target.value) || 0)}
                className="input" />
            </Field>
            <Field label="Cutoff (hours)" hint="Customer can't reschedule a job that's within this many hours of starting.">
              <input type="number" min={0} value={wf.reschedule_cutoff_hours}
                onChange={(e) => setWfField("reschedule_cutoff_hours", Number(e.target.value) || 0)}
                className="input" />
            </Field>
            <Field label="Max reschedules per job" hint="0 = unlimited.">
              <input type="number" min={0} value={wf.reschedule_max_count}
                onChange={(e) => setWfField("reschedule_max_count", Number(e.target.value) || 0)}
                className="input" />
            </Field>
          </div>
        </div>
      )}

      {/* ── F-72 Booking post-actions ───────────────────────── */}
      {wf && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-hdr">
            <div>
              <div className="card-ttl">After a booking is created</div>
              <div className="card-sub">What automatically happens when a customer completes a booking on your booking page.</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Send branded confirmation email">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={wf.booking_auto_send_confirmation}
                  onChange={(e) => setWfField("booking_auto_send_confirmation", e.target.checked)} />
                Send a confirmation email using your brand colors + logo
              </label>
            </Field>
            <Field label="Auto-create invoice">
              <select value={wf.booking_auto_create_invoice}
                onChange={(e) => setWfField("booking_auto_create_invoice", e.target.value as WorkflowSettings["booking_auto_create_invoice"])}
                className="input">
                <option value="never">Never (manual)</option>
                <option value="on_confirm">On booking confirmation</option>
                <option value="on_completion">When the job is marked complete</option>
              </select>
            </Field>
            <Field label="Auto-assign worker">
              <select value={wf.booking_auto_assign_worker}
                onChange={(e) => setWfField("booking_auto_assign_worker", e.target.value as WorkflowSettings["booking_auto_assign_worker"])}
                className="input">
                <option value="none">None (admin assigns)</option>
                <option value="preferred">Customer's preferred crew (then backups)</option>
                <option value="round_robin">Round-robin across active crew</option>
                <option value="skill_match">Skill match (service category)</option>
              </select>
            </Field>
            <div /> {/* spacer */}
          </div>
        </div>
      )}

      {wf && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Button variant="primary" onClick={saveWf} disabled={savingWf}>{savingWf ? "Saving…" : "Save workflow settings"}</Button>
        </div>
      )}

      {/* ── F-63 Customer signup form ───────────────────────── */}
      {signup && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Customer signup form</div>
              <div className="card-sub">Pick which fields a customer sees when they self-register on your customer portal.</div>
            </div>
            {signupMsg && <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{signupMsg}</span>}
            <Button variant="primary" onClick={() => setBuilderOpen(true)}>Open full builder →</Button>
          </div>

          <Field label="Welcome text">
            <textarea
              rows={2}
              value={signup.welcome_text}
              onChange={(e) => setSignup((cur) => cur ? { ...cur, welcome_text: e.target.value } : cur)}
              className="input"
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>
          <Field label="Submit button label">
            <input value={signup.submit_label}
              onChange={(e) => setSignup((cur) => cur ? { ...cur, submit_label: e.target.value } : cur)}
              className="input" />
          </Field>

          <table className="tbl" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Field</th>
                <th style={{ width: 110, textAlign: "center" }}>Show</th>
                <th style={{ width: 110, textAlign: "center" }}>Required</th>
              </tr>
            </thead>
            <tbody>
              {signup.fields.map((f) => (
                <tr key={f.key}>
                  <td style={{ fontSize: 13 }}>{f.label}{f.required_locked && <span style={{ color: "#94A3B8", fontSize: 11, marginLeft: 6 }}>(required)</span>}</td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={f.enabled} disabled={f.required_locked}
                      onChange={(e) => toggleSignupField(f.key, "enabled", e.target.checked)} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={f.required} disabled={f.required_locked || !f.enabled}
                      onChange={(e) => toggleSignupField(f.key, "required", e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Button variant="primary" onClick={saveSignup} disabled={savingSignup}>{savingSignup ? "Saving…" : "Save signup form"}</Button>
          </div>
        </div>
      )}

      {/* F-113 — Full signup form builder modal */}
      <SignupFormBuilder
        open={builderOpen}
        config={signup ? {
          fields: signup.fields as unknown as SignupConfigFull["fields"],
          custom_fields: signup.custom_fields || [],
          welcome_text: signup.welcome_text,
          submit_label: signup.submit_label,
        } : null}
        onClose={() => setBuilderOpen(false)}
        saving={savingSignup}
        onSave={async (next) => {
          setSavingSignup(true);
          setError(null);
          try {
            const saved = await patch<SignupConfig>("/customer-signup/config", next);
            setSignup(saved);
            setSignupMsg("Saved.");
            setTimeout(() => setSignupMsg(null), 4000);
            setBuilderOpen(false);
          } catch (e) {
            setError(e);
          } finally {
            setSavingSignup(false);
          }
        }}
      />
    </OliverPageWrapper>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 13, color: "#0B1C24" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

export default { OliverWorkflowSettingsPage };
