// OliverAutomationsPage — Automations & Notifications editor.
//
// Config form (not a flow builder): the customer-facing notification copy,
// which events fire, and reminder cadence. Gated on the Client Experience
// add-on (portal_automations_editor). Locked state routes to the CX page.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { Lock } from "lucide-react";

interface NotifCfg { enabled: boolean; subject: string; body: string }
interface AutomationsCfg {
  notifications: Record<string, NotifCfg>;
  reminders: { overdueInvoiceDays: string; appointmentReminderHours: number };
}

const EVENTS: { key: string; label: string; defSubject: string }[] = [
  { key: "job_scheduled",        label: "Job scheduled",          defSubject: "Your appointment is confirmed" },
  { key: "job_completed",        label: "Job completed",          defSubject: "Your job is complete" },
  { key: "quote_sent",           label: "Quote sent",             defSubject: "Your quote is ready" },
  { key: "invoice_sent",         label: "Invoice sent",           defSubject: "You have a new invoice" },
  { key: "invoice_paid",         label: "Payment received",       defSubject: "Thanks — payment received" },
  { key: "appointment_reminder", label: "Appointment reminder",   defSubject: "Reminder: upcoming appointment" },
];

function withDefaults(a: Partial<AutomationsCfg> | undefined): AutomationsCfg {
  const notifications: Record<string, NotifCfg> = {};
  for (const e of EVENTS) {
    notifications[e.key] = {
      enabled: a?.notifications?.[e.key]?.enabled ?? true,
      subject: a?.notifications?.[e.key]?.subject ?? e.defSubject,
      body: a?.notifications?.[e.key]?.body ?? "",
    };
  }
  return {
    notifications,
    reminders: {
      overdueInvoiceDays: a?.reminders?.overdueInvoiceDays ?? "3, 7, 14",
      appointmentReminderHours: a?.reminders?.appointmentReminderHours ?? 24,
    },
  };
}

export function OliverAutomationsPage() {
  const { get, post, ready } = useOliverApi();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<AutomationsCfg>(withDefaults(undefined));
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await get<{ data: { unlocked: boolean; automations: Partial<AutomationsCfg> } }>(
        "/client-experience/automations");
      setUnlocked(!!res?.data?.unlocked);
      setCfg(withDefaults(res?.data?.automations));
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function save() {
    setSaving(true); setSaved(false);
    try {
      await post("/client-experience/automations", { automations: cfg });
      setSaved(true);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  }

  return (
    <OliverPageWrapper
      title="Automations & Notifications"
      subtitle="Control the copy, triggers, and cadence your customers see"
      error={error}
      loading={loading}
    >
      {unlocked === false && (
        <div className="card">
          <div className="px-5 py-8 text-center">
            <Lock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <div className="font-semibold text-slate-800">This is a Client Experience feature</div>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              The Automations &amp; Notifications editor is included with the
              Client Experience add-on (Essentials and above).
            </p>
            <a href="/app/services/oliver_client_experience"
               className="inline-block mt-4 px-4 py-2 rounded-md bg-[#FEC82C] hover:bg-[#e3b424] text-[#1A3A4A] text-sm font-semibold">
              View Client Experience plans →
            </a>
          </div>
        </div>
      )}

      {unlocked && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Customer notifications</div>
                <div className="card-sub">Toggle each event and customize the copy</div>
              </div>
            </div>
            <div className="px-4 pb-4 divide-y divide-slate-100">
              {EVENTS.map((e) => {
                const n = cfg.notifications[e.key];
                return (
                  <div key={e.key} className="py-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={n.enabled}
                        onChange={(ev) => setCfg((c) => ({
                          ...c, notifications: { ...c.notifications, [e.key]: { ...n, enabled: ev.target.checked } },
                        }))}
                      />
                      {e.label}
                    </label>
                    {n.enabled && (
                      <div className="mt-2 space-y-2 pl-6">
                        <input
                          type="text"
                          value={n.subject}
                          onChange={(ev) => setCfg((c) => ({
                            ...c, notifications: { ...c.notifications, [e.key]: { ...n, subject: ev.target.value } },
                          }))}
                          className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                          placeholder="Subject line"
                        />
                        <textarea
                          value={n.body}
                          onChange={(ev) => setCfg((c) => ({
                            ...c, notifications: { ...c.notifications, [e.key]: { ...n, body: ev.target.value } },
                          }))}
                          rows={2}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                          placeholder="Message body (leave blank to use the default template)"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Reminder cadence</div>
                <div className="card-sub">When automated reminders fire</div>
              </div>
            </div>
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Overdue invoice reminders (days after due, comma-separated)
                </label>
                <input
                  type="text"
                  value={cfg.reminders.overdueInvoiceDays}
                  onChange={(e) => setCfg((c) => ({
                    ...c, reminders: { ...c.reminders, overdueInvoiceDays: e.target.value },
                  }))}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  placeholder="3, 7, 14"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Appointment reminder (hours before)
                </label>
                <input
                  type="number"
                  min={1}
                  value={cfg.reminders.appointmentReminderHours}
                  onChange={(e) => setCfg((c) => ({
                    ...c, reminders: { ...c.reminders, appointmentReminderHours: Number(e.target.value) || 0 },
                  }))}
                  className="mt-1 w-40 border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-[#1A3A4A] hover:bg-[#15303d] text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save automations"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}

export default OliverAutomationsPage;
