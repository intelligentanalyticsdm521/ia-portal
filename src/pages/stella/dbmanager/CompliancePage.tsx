// CompliancePage — dated obligations: renewals, filings, licences.
//
// SCOPE NOTE, on purpose: this milestone stores and shows reminders. It does
// NOT send them — notification delivery was not in the board task, and a page
// that implies an email is coming when none is would be worse than one that
// says so plainly. The banner below states it.
import { useCallback, useEffect, useState } from "react";
import { Plus, CalendarClock, Check, X } from "lucide-react";
import { StellaShell, StellaTabs } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbEmpty,
  DbNotice, useNotice, Pill, DbModal, DbTable,
} from "./DbManagerKit";

type Reminder = {
  compliance_reminder_id: string; type: string; title: string | null;
  entity_ref: string | null; due_date: string; status: string; days_until_due: number;
};

const TYPES = ["annual_report", "licence_renewal", "insurance_renewal", "tax_filing", "permit", "w9_refresh", "other"];
const label = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function StellaCompliancePage() {
  const api = useStellaApi();
  const [tab, setTab] = useState("open");
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: "annual_report", title: "", due_date: "" });

  const load = useCallback(() => {
    if (!api.ready) return;
    setItems(null);
    api.get<Reminder[]>(`/db-manager/compliance?status=${tab}`).then(setItems).catch(setError);
  }, [api, tab]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.due_date) return;
    setBusy(true); setError(null);
    try {
      await api.post("/db-manager/compliance", {
        type: form.type,
        title: form.title.trim() || label(form.type),
        due_date: form.due_date,
      });
      showNotice("Reminder saved.");
      setCreating(false); setForm({ type: "annual_report", title: "", due_date: "" });
      setTab("open"); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function setStatus(r: Reminder, status: string) {
    setBusy(true); setError(null);
    try {
      await api.patch(`/db-manager/compliance/${r.compliance_reminder_id}`, { status });
      showNotice(status === "done" ? "Marked done." : "Dismissed.");
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (error && !items) {
    return <StellaShell title="Compliance Reminders" subtitle="Renewals and filings."><DbError error={error} /></StellaShell>;
  }

  return (
    <StellaShell
      title="Compliance Reminders"
      subtitle="Renewals, filings and licences — with how long you've got."
      actions={<DbButton onClick={() => setCreating(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> New reminder</span>
      </DbButton>}
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start", background: "#FFFAEB",
        border: "1px solid #FEDF89", borderRadius: 8, padding: "9px 12px", marginBottom: 14,
      }}>
        <CalendarClock size={14} color="#B54708" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: "#B54708", lineHeight: 1.5 }}>
          Reminders are tracked here and shown on this page. STELLA does not email them yet — that's a separate
          piece of work, so keep checking this list rather than waiting for a message.
        </div>
      </div>

      <StellaTabs
        tabs={[{ key: "open", label: "Open" }, { key: "done", label: "Done" }, { key: "dismissed", label: "Dismissed" }]}
        active={tab} onChange={setTab}
      />

      <DbCard>
        {!items ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "title", label: "What" },
              { key: "type", label: "Type" },
              { key: "due_date", label: "Due", type: "date" },
              { key: "countdown", label: "Time left" },
              { key: "action", label: "" },
            ]}
            rows={items.map((r) => {
              const d = r.days_until_due;
              const tone = d < 0 ? "bad" : d <= 14 ? "warn" : "neutral";
              return {
                ...r,
                title: r.title || label(r.type),
                type: <Pill>{label(r.type)}</Pill>,
                countdown: <Pill tone={tone as never}>
                  {d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? "Due today" : `${d} days`}
                </Pill>,
                action: tab === "open" ? (
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <DbButton variant="ghost" onClick={() => setStatus(r, "done")} disabled={busy} title="Mark done">
                      <Check size={13} />
                    </DbButton>
                    <DbButton variant="ghost" onClick={() => setStatus(r, "dismissed")} disabled={busy} title="Dismiss">
                      <X size={13} />
                    </DbButton>
                  </span>
                ) : (
                  <DbButton variant="ghost" onClick={() => setStatus(r, "open")} disabled={busy}>Reopen</DbButton>
                ),
              };
            }) as never}
            empty={<DbEmpty
              title={tab === "open" ? "Nothing due" : `Nothing ${tab}`}
              reason={tab === "open"
                ? "Add the dates you can't afford to miss — an annual report, an insurance renewal, a licence."
                : undefined}
            />}
          />
        )}
      </DbCard>

      {creating && (
        <DbModal title="New reminder" onClose={() => setCreating(false)} width={440}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Type">
              <DbSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </DbSelect>
            </DbField>
            <DbField label="What is it?" hint="Optional — defaults to the type">
              <DbInput value={form.title} maxLength={400} placeholder="e.g. File LLC annual report"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </DbField>
            <DbField label="Due date">
              <DbInput type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </DbField>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={create} disabled={busy || !form.due_date}>{busy ? "Saving…" : "Add reminder"}</DbButton>
              <DbButton variant="ghost" onClick={() => setCreating(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}
