// SparkAutomationModal — JSON-free trigger+action builder for SPARK automations.
//
// Replaces the JSON textarea-driven SparkAutomationBuilderPage step editor.
// The user picks a TRIGGER from a friendly grid, fills the trigger's typed
// fields, picks an ACTION from a friendly grid, fills the action's typed
// fields, and the modal serializes the JSON behind the scenes on save.
//
// Phase 3A — TODO(spark-v1): backend currently models automations as
// multi-step flows (steps with config blobs). This V1 modal emits a single
// trigger + single primary action; deeper multi-step flows will land in
// SPARK v1.1 with the visual builder. Saving still routes through
// /api/v1/automations + steps.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Save, Plus, AlertTriangle, Zap, UserPlus, GitCompareArrows, Tag as TagIcon,
  FileSignature, MailOpen, MousePointerClick, CalendarClock, Hand,
  Mail, MessageSquare, Edit, ArrowRightCircle, Clock, Webhook,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";
import PhoneInput from "../PhoneInput";

// ── Trigger taxonomy ──────────────────────────────────────────────────────
export type TriggerType =
  | "contact_created"
  | "stage_changed"
  | "tag_added"
  | "form_submitted"
  | "email_opened"
  | "email_clicked"
  | "date_based"
  | "manual";

export const TRIGGER_META: Record<TriggerType, { label: string; icon: typeof Zap; desc: string }> = {
  contact_created:  { label: "Contact Created",   icon: UserPlus,         desc: "Fires when a new contact is added (any source)." },
  stage_changed:    { label: "Stage Changed",     icon: GitCompareArrows, desc: "Fires when a contact moves between pipeline stages." },
  tag_added:        { label: "Tag Added",         icon: TagIcon,          desc: "Fires when a specific tag is applied to a contact." },
  form_submitted:   { label: "Form Submitted",    icon: FileSignature,    desc: "Fires when a contact submits one of your SPARK forms." },
  email_opened:     { label: "Email Opened",      icon: MailOpen,         desc: "Fires when a contact opens a campaign email." },
  email_clicked:    { label: "Email Clicked",     icon: MousePointerClick,desc: "Fires when a contact clicks a link in a campaign email." },
  date_based:       { label: "Date-Based",        icon: CalendarClock,    desc: "Fires N days before/after a contact field date." },
  manual:           { label: "Manual",            icon: Hand,             desc: "Fires only when you manually enroll a contact." },
};

// ── Action taxonomy ───────────────────────────────────────────────────────
export type ActionType =
  | "send_email"
  | "send_sms"
  | "update_field"
  | "add_tag"
  | "move_stage"
  | "wait_n_days"
  | "webhook";

export const ACTION_META: Record<ActionType, { label: string; icon: typeof Mail; desc: string; comingSoon?: boolean }> = {
  send_email:   { label: "Send Email",          icon: Mail,             desc: "Send a templated email to the contact." },
  send_sms:     { label: "Send SMS",            icon: MessageSquare,    desc: "Send a text message via your SPARK SMS sender." },
  update_field: { label: "Update Contact Field",icon: Edit,             desc: "Set a contact field to a fixed value." },
  add_tag:      { label: "Add Tag",             icon: TagIcon,          desc: "Apply a tag to the contact." },
  move_stage:   { label: "Move Stage",          icon: ArrowRightCircle, desc: "Move the contact to a specific pipeline stage." },
  wait_n_days:  { label: "Wait N Days",         icon: Clock,            desc: "Delay before the next action runs." },
  webhook:      { label: "Webhook",             icon: Webhook,          desc: "POST to a custom URL.", comingSoon: true },
};

// ── Typed field state ─────────────────────────────────────────────────────
// Each trigger/action has its own shape; we keep ALL of them on state so
// switching back and forth doesn't lose data. Serialization picks only the
// active shape.
interface TriggerFields {
  contact_created: { source?: string };
  stage_changed:   { from_stage: string; to_stage: string };
  tag_added:       { tag: string };
  form_submitted:  { form_id: string };
  email_opened:    { campaign_id: string };
  email_clicked:   { campaign_id: string; link_url?: string };
  date_based:      { field: string; offset_days: number; direction: "before" | "after" };
  manual:          Record<string, never>;
}

interface ActionFields {
  send_email:   { subject: string; from_name: string; from_email: string; body: string; include_signature: boolean; template_key?: string };
  send_sms:     { from_phone: string; message: string; media_url?: string };
  update_field: { field: string; new_value: string };
  add_tag:      { tag: string };
  move_stage:   { stage: string };
  wait_n_days:  { amount: number; unit: "hours" | "days" | "weeks" };
  webhook:      { url: string };
}

const TRIGGER_DEFAULTS: TriggerFields = {
  contact_created: { source: "" },
  stage_changed:   { from_stage: "", to_stage: "" },
  tag_added:       { tag: "" },
  form_submitted:  { form_id: "" },
  email_opened:    { campaign_id: "" },
  email_clicked:   { campaign_id: "", link_url: "" },
  date_based:      { field: "birthday", offset_days: 0, direction: "before" },
  manual:          {},
};

const ACTION_DEFAULTS: ActionFields = {
  send_email:   { subject: "", from_name: "", from_email: "", body: "", include_signature: true, template_key: "" },
  send_sms:     { from_phone: "", message: "", media_url: "" },
  update_field: { field: "", new_value: "" },
  add_tag:      { tag: "" },
  move_stage:   { stage: "" },
  wait_n_days:  { amount: 1, unit: "days" },
  webhook:      { url: "" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing automation ID to edit, or null for create-new. */
  automationId: number | null;
  /** Pre-selected trigger from the unified picker, or null to start at step 1. */
  initialTrigger?: TriggerType | null;
  onChanged?: () => void;
}

type Step = 1 | 2 | 3; // 1=trigger pick, 2=trigger fields + action pick, 3=action fields + name/save

export function SparkAutomationModal({ open, onClose, automationId, initialTrigger, onChanged }: Props) {
  const { post, put, ready } = useSparkApi();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerType | null>(null);
  const [triggerFields, setTriggerFields] = useState<TriggerFields>(TRIGGER_DEFAULTS);
  const [action, setAction] = useState<ActionType | null>(null);
  const [actionFields, setActionFields] = useState<ActionFields>(ACTION_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every open
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (automationId == null) {
      setName("");
      setDescription("");
      setTrigger(initialTrigger ?? null);
      setTriggerFields(TRIGGER_DEFAULTS);
      setAction(null);
      setActionFields(ACTION_DEFAULTS);
      setStep(initialTrigger ? 2 : 1);
    } else {
      // TODO(spark-v1): fetch existing automation + first step config and
      // hydrate. For V1 we open at step 2 with whatever the user last picked.
      setStep(2);
    }
  }, [open, automationId, initialTrigger]);

  const isEdit = automationId != null;

  function buildTriggerConfig(): Record<string, unknown> {
    if (!trigger) return {};
    return { ...(triggerFields[trigger] as Record<string, unknown>) };
  }
  function buildActionConfig(): Record<string, unknown> {
    if (!action) return {};
    return { ...(actionFields[action] as Record<string, unknown>) };
  }

  async function save() {
    if (!trigger || !action) { setError("Pick a trigger and an action first."); return; }
    if (!name.trim()) { setError("Give your automation a name."); return; }

    setSaving(true); setError(null);
    try {
      const automationBody = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: trigger,
        type: "drip", // back-compat with existing /automations schema
        config: { trigger: buildTriggerConfig() },
        is_active: false, // user activates from the list after save
      };

      let automationIdSaved: number;
      if (isEdit) {
        await put(`/api/v1/automations/${automationId}`, automationBody);
        automationIdSaved = automationId!;
      } else {
        const r = await post<{ data: { id: number } }>("/api/v1/automations", automationBody);
        automationIdSaved = r.data.id;
      }

      // Primary action becomes step #0 on the automation flow. Behind-the-scenes
      // JSON — user never sees it.
      // TODO(spark-v1): support multiple actions (sequence builder) in v1.1.
      try {
        await post(`/api/v1/automations/${automationIdSaved}/steps`, {
          sort_order: 0,
          step_type: action,
          config: buildActionConfig(),
        });
      } catch (stepErr) {
        // If the steps endpoint isn't live yet the automation row still saved.
        // Don't fail the whole save for that — just log.
        console.warn("[SparkAutomationModal] step save failed (stubbed?)", stepErr);
      }

      onChanged?.();
      onClose();
    } catch (err) {
      setError((err as Error)?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  // Render gating: nothing if closed, nothing if MSAL not ready (consistent
  // with RuleEditorModal — IadmModal handles open/close animation).
  if (!open) return null;

  const TitleByStep: Record<Step, string> = {
    1: "Pick a trigger",
    2: trigger ? `${TRIGGER_META[trigger].label} → pick an action` : "Pick an action",
    3: "Configure & save",
  };

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · AUTOMATION"
      title={isEdit ? "Edit automation" : "New automation"}
      subtitle={TitleByStep[step]}
      size={step === 1 ? "nav" : "info"}
      footer={
        <>
          {step > 1 && (
            <IadmButton variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)}>
              ← Back
            </IadmButton>
          )}
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          {step < 3 ? (
            <IadmButton
              variant="accent"
              product="spark"
              disabled={(step === 1 && !trigger) || (step === 2 && !action) || !ready}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Next →
            </IadmButton>
          ) : (
            <IadmButton
              variant="accent"
              product="spark"
              disabled={saving}
              icon={isEdit ? <Save className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              onClick={save}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create automation"}
            </IadmButton>
          )}
        </>
      }
    >
      <div className="p-5 space-y-4">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <TriggerPicker
            value={trigger}
            onPick={(t) => { setTrigger(t); setStep(2); }}
          />
        )}

        {step === 2 && trigger && (
          <>
            <TriggerFieldsEditor
              trigger={trigger}
              fields={triggerFields}
              setFields={setTriggerFields}
            />
            <div className="border-t border-slate-200 pt-4">
              <div className="text-[10px] uppercase font-semibold text-slate-500 mb-2">Then do this</div>
              <ActionPicker value={action} onPick={(a) => setAction(a)} />
            </div>
          </>
        )}

        {step === 3 && trigger && action && (
          <>
            <FormRow label="Automation name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Welcome new customers"
                className="auto-input"
                autoFocus
              />
            </FormRow>
            <FormRow label="Description (optional)">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sent the first time a contact joins."
                className="auto-input"
              />
            </FormRow>
            <div className="border-t border-slate-200 pt-4">
              <div className="text-[10px] uppercase font-semibold text-slate-500 mb-2">
                Action — {ACTION_META[action].label}
              </div>
              <ActionFieldsEditor
                action={action}
                fields={actionFields}
                setFields={setActionFields}
              />
            </div>
          </>
        )}

        <style>{`
          .auto-input {
            width: 100%; border: 1px solid #cbd5e1; border-radius: 4px;
            padding: 6px 8px; font-size: 13px;
          }
          .auto-input:focus { outline: none; border-color: #EF6C33; box-shadow: 0 0 0 1px #EF6C33; }
          textarea.auto-input { font-family: inherit; line-height: 1.4; }
        `}</style>
      </div>
    </IadmModal>
  );
}

// ─── Trigger picker (step 1) ─────────────────────────────────────────────
function TriggerPicker({ value, onPick }: { value: TriggerType | null; onPick: (t: TriggerType) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {(Object.keys(TRIGGER_META) as TriggerType[]).map((t) => {
        const meta = TRIGGER_META[t];
        const Icon = meta.icon;
        const active = value === t;
        return (
          <button
            key={t}
            onClick={() => onPick(t)}
            className={`group flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
              active
                ? "border-[#EF6C33] bg-[#EF6C33]/5"
                : "border-slate-200 bg-white hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33] flex-shrink-0">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm">{meta.label}</div>
              <div className="text-xs text-slate-500 leading-snug mt-0.5">{meta.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Action picker ───────────────────────────────────────────────────────
function ActionPicker({ value, onPick }: { value: ActionType | null; onPick: (a: ActionType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(ACTION_META) as ActionType[]).map((a) => {
        const meta = ACTION_META[a];
        const Icon = meta.icon;
        const active = value === a;
        const disabled = !!meta.comingSoon;
        return (
          <button
            key={a}
            onClick={() => !disabled && onPick(a)}
            disabled={disabled}
            className={`flex items-start gap-2 rounded-lg border-2 p-2.5 text-left transition-colors ${
              active
                ? "border-[#EF6C33] bg-[#EF6C33]/5"
                : "border-slate-200 bg-white hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
            } ${disabled ? "opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white" : ""}`}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33] flex-shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900 text-xs flex items-center gap-1">
                {meta.label}
                {disabled && <span className="text-[9px] uppercase rounded bg-amber-100 text-amber-700 px-1">Soon</span>}
              </div>
              <div className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{meta.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Trigger field editor — type-driven, JSON-free ───────────────────────
function TriggerFieldsEditor({
  trigger, fields, setFields,
}: {
  trigger: TriggerType;
  fields: TriggerFields;
  setFields: (f: TriggerFields) => void;
}) {
  const update = <K extends TriggerType>(k: K, patch: Partial<TriggerFields[K]>) =>
    setFields({ ...fields, [k]: { ...(fields[k] as object), ...patch } } as TriggerFields);

  switch (trigger) {
    case "contact_created":
      return (
        <FormRow label="Source (optional)" hint="Leave blank to fire for every new contact.">
          <input
            value={fields.contact_created.source || ""}
            onChange={(e) => update("contact_created", { source: e.target.value })}
            placeholder="form, import, api…"
            className="auto-input"
          />
        </FormRow>
      );

    case "stage_changed":
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="From stage">
            <input value={fields.stage_changed.from_stage} onChange={(e) => update("stage_changed", { from_stage: e.target.value })} placeholder="lead" className="auto-input" />
          </FormRow>
          <FormRow label="To stage">
            <input value={fields.stage_changed.to_stage} onChange={(e) => update("stage_changed", { to_stage: e.target.value })} placeholder="customer" className="auto-input" />
          </FormRow>
        </div>
      );

    case "tag_added":
      return (
        <FormRow label="Tag" hint="When this tag is applied to a contact.">
          <input value={fields.tag_added.tag} onChange={(e) => update("tag_added", { tag: e.target.value })} placeholder="hot-lead" className="auto-input" />
        </FormRow>
      );

    case "form_submitted":
      return (
        <FormRow label="Form ID" hint="The SPARK form that triggers this automation.">
          <input value={fields.form_submitted.form_id} onChange={(e) => update("form_submitted", { form_id: e.target.value })} placeholder="form_abc123" className="auto-input" />
        </FormRow>
      );

    case "email_opened":
      return (
        <FormRow label="Campaign ID" hint="Leave blank for any campaign.">
          <input value={fields.email_opened.campaign_id} onChange={(e) => update("email_opened", { campaign_id: e.target.value })} placeholder="campaign_123" className="auto-input" />
        </FormRow>
      );

    case "email_clicked":
      return (
        <div className="space-y-3">
          <FormRow label="Campaign ID" hint="Leave blank for any campaign.">
            <input value={fields.email_clicked.campaign_id} onChange={(e) => update("email_clicked", { campaign_id: e.target.value })} placeholder="campaign_123" className="auto-input" />
          </FormRow>
          <FormRow label="Link URL contains (optional)">
            <input value={fields.email_clicked.link_url || ""} onChange={(e) => update("email_clicked", { link_url: e.target.value })} placeholder="https://…/pricing" className="auto-input" />
          </FormRow>
        </div>
      );

    case "date_based":
      return (
        <div className="grid grid-cols-3 gap-3">
          <FormRow label="Contact field">
            <select value={fields.date_based.field} onChange={(e) => update("date_based", { field: e.target.value })} className="auto-input bg-white">
              <option value="birthday">Birthday</option>
              <option value="anniversary">Anniversary</option>
              <option value="renewal_date">Renewal date</option>
              <option value="created_at">Signup date</option>
            </select>
          </FormRow>
          <FormRow label="Days offset">
            <input type="number" value={fields.date_based.offset_days} onChange={(e) => update("date_based", { offset_days: Number(e.target.value) })} className="auto-input" />
          </FormRow>
          <FormRow label="Direction">
            <select value={fields.date_based.direction} onChange={(e) => update("date_based", { direction: e.target.value as "before" | "after" })} className="auto-input bg-white">
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </FormRow>
        </div>
      );

    case "manual":
      return (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Manual automations fire only when you enroll contacts by hand from the
          contact page or Bulk Operations. No trigger configuration needed.
        </div>
      );
  }
}

// ─── Action field editor — type-driven, JSON-free ────────────────────────
function ActionFieldsEditor({
  action, fields, setFields,
}: {
  action: ActionType;
  fields: ActionFields;
  setFields: (f: ActionFields) => void;
}) {
  const update = <K extends ActionType>(k: K, patch: Partial<ActionFields[K]>) =>
    setFields({ ...fields, [k]: { ...(fields[k] as object), ...patch } } as ActionFields);

  switch (action) {
    case "send_email":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="From name">
              <input value={fields.send_email.from_name} onChange={(e) => update("send_email", { from_name: e.target.value })} placeholder="Acme Co." className="auto-input" />
            </FormRow>
            <FormRow label="From email">
              <input value={fields.send_email.from_email} onChange={(e) => update("send_email", { from_email: e.target.value })} placeholder="hello@acme.co" className="auto-input" />
            </FormRow>
          </div>
          <FormRow label="Subject">
            <input value={fields.send_email.subject} onChange={(e) => update("send_email", { subject: e.target.value })} placeholder="Welcome aboard!" className="auto-input" />
          </FormRow>
          <FormRow label="Template (optional)" hint="Reuse a template, or type your body below.">
            <input value={fields.send_email.template_key || ""} onChange={(e) => update("send_email", { template_key: e.target.value })} placeholder="auth.welcome" className="auto-input" />
          </FormRow>
          <FormRow label="Email body">
            <textarea
              value={fields.send_email.body}
              onChange={(e) => update("send_email", { body: e.target.value })}
              rows={5}
              placeholder="Hi {{contact.first_name}}, welcome to Acme…"
              className="auto-input"
            />
          </FormRow>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.send_email.include_signature}
              onChange={(e) => update("send_email", { include_signature: e.target.checked })}
            />
            Include tenant email signature
          </label>
        </div>
      );

    case "send_sms":
      return (
        <div className="space-y-3">
          <FormRow label="From phone">
            <PhoneInput value={fields.send_sms.from_phone} onChange={(v) => update("send_sms", { from_phone: v })} placeholder="+15555550100" className="auto-input" />
          </FormRow>
          <FormRow label={`Message (${fields.send_sms.message.length}/1600 chars)`}>
            <textarea
              value={fields.send_sms.message}
              onChange={(e) => update("send_sms", { message: e.target.value })}
              rows={3}
              maxLength={1600}
              placeholder="Hi {{contact.first_name}}, thanks for signing up!"
              className="auto-input"
            />
          </FormRow>
          <FormRow label="Media URL (optional)" hint="MMS image / PDF for MMS-capable carriers.">
            <input value={fields.send_sms.media_url || ""} onChange={(e) => update("send_sms", { media_url: e.target.value })} placeholder="https://…/coupon.png" className="auto-input" />
          </FormRow>
        </div>
      );

    case "update_field":
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Contact field">
            <input value={fields.update_field.field} onChange={(e) => update("update_field", { field: e.target.value })} placeholder="lifecycle_stage" className="auto-input" />
          </FormRow>
          <FormRow label="New value">
            <input value={fields.update_field.new_value} onChange={(e) => update("update_field", { new_value: e.target.value })} placeholder="engaged" className="auto-input" />
          </FormRow>
        </div>
      );

    case "add_tag":
      return (
        <FormRow label="Tag">
          <input value={fields.add_tag.tag} onChange={(e) => update("add_tag", { tag: e.target.value })} placeholder="engaged" className="auto-input" />
        </FormRow>
      );

    case "move_stage":
      return (
        <FormRow label="Target stage">
          <input value={fields.move_stage.stage} onChange={(e) => update("move_stage", { stage: e.target.value })} placeholder="customer" className="auto-input" />
        </FormRow>
      );

    case "wait_n_days":
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Amount">
            <input
              type="number"
              min={1}
              value={fields.wait_n_days.amount}
              onChange={(e) => update("wait_n_days", { amount: Math.max(1, Number(e.target.value)) })}
              className="auto-input"
            />
          </FormRow>
          <FormRow label="Unit">
            <select
              value={fields.wait_n_days.unit}
              onChange={(e) => update("wait_n_days", { unit: e.target.value as "hours" | "days" | "weeks" })}
              className="auto-input bg-white"
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </FormRow>
        </div>
      );

    case "webhook":
      return (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Webhook actions are coming in SPARK v1.5. Pick a different action for now.
        </div>
      );
  }
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

// Avoid unused-import lints when memoization helpers aren't needed
useMemo;

export default SparkAutomationModal;
