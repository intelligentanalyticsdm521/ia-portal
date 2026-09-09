// @deprecated 2026-06-12 - orphan after refactor. Superseded by F-91 unified Templates page (SparkTemplatesPage) � drop Email/SMS/Translations split. Confirm with founder before deletion (task #174).
// SparkSmsTemplatesPage — SMS template library + send-test
//
// Lightweight cousin of the email-templates page. Single-body editor,
// 160-char counter, inline send-test, system-template browse + clone.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
// One sentence, from the gate that stops the send. The amber "sending may go to
// a stub until v1.1" banner that was here named a version instead of a reason.
import { TextingOffNotice } from "../../components/spark/TextingOffNotice";
import { Plus, Save, Send, Trash2, Copy as CopyIcon } from "lucide-react";
import { PhoneInput } from "../../components/PhoneInput";

type Category = "transactional" | "marketing" | "system";
interface SmsTemplate {
  id: number; tenant_id: string; template_key: string | null; name: string;
  description: string | null; category: Category; body: string;
  send_count: number; last_used_at: string | null;
  is_active: boolean; is_system: boolean; updated_at: string;
}

export function SparkSmsTemplatesPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [list, setList] = useState<SmsTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<SmsTemplate>>({});
  const [filter, setFilter] = useState<Category | "all">("all");
  const [testPhone, setTestPhone] = useState("");
  const [testPhoneRaw, setTestPhoneRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const q = filter === "all" ? "" : `?category=${filter}`;
      const r = await get<{ items: SmsTemplate[] }>(`/api/v1/sms-templates${q}`);
      setList(r?.items || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, filter]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const selected = useMemo(() => list.find(t => t.id === selectedId) || null, [list, selectedId]);

  useEffect(() => {
    if (!selectedId) { setDraft({}); return; }
    (async () => {
      try {
        const t = await get<SmsTemplate>(`/api/v1/sms-templates/${selectedId}`);
        setDraft(t);
      } catch (err) { console.error(err); }
    })();
  }, [selectedId, get]);

  async function createNew() {
    try {
      const r = await post<SmsTemplate>("/api/v1/sms-templates", {
        name: "New SMS template", body: "Hi {{contact.first_name}}, ", category: "marketing",
      });
      await fetchList();
      setSelectedId(r.id);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function clone() {
    if (!selected) return;
    try {
      const r = await post<SmsTemplate>("/api/v1/sms-templates", {
        name: `${selected.name} (copy)`, body: selected.body, category: selected.category, description: selected.description,
      });
      await fetchList();
      setSelectedId(r.id);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function save() {
    if (!selectedId || !draft) return;
    setSaving(true);
    try {
      await patch(`/api/v1/sms-templates/${selectedId}`, {
        name: draft.name, body: draft.body, description: draft.description, category: draft.category,
      });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  async function deactivate() {
    if (!selectedId || !confirm("Deactivate this template?")) return;
    try {
      await del(`/api/v1/sms-templates/${selectedId}`);
      setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function sendTest() {
    if (!selectedId || !testPhoneRaw.trim()) return;
    try {
      const r = await post<{ sent: boolean; body: string }>("/api/v1/sms-templates/send", {
        template_id: selectedId, to: testPhoneRaw.trim(),
        vars: {
          "contact.first_name": "Test", "tenant.name": "IADM",
          "job.title": "HVAC tune-up", "job.scheduled_time": "9:00 AM",
          "job.tech_name": "Sam", "job.eta": "15 min",
          "review_url": "https://portal.intelligentanalyticsdm.com/review",
        },
      });
      alert(`Sent: "${r.body}"`);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const bodyLen = (draft.body || "").length;
  const overlimit = bodyLen > 160;

  return (
    <SparkPageShell
      title="SMS templates"
      subtitle={`${list.length} template${list.length === 1 ? "" : "s"}`}
      help="Build reusable SMS templates with {{contact.first_name}}-style variables. System templates (locked) are available to every tenant. Use Clone to fork one as your own customizable copy."
      actions={
        <button onClick={createNew} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New SMS template
        </button>
      }
      filters={
        <div className="flex items-center gap-2">
          {(["all", "transactional", "marketing", "system"] as const).map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border ${filter === c ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>
              {c}
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      <TextingOffNotice />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-1 border border-slate-200 rounded max-h-[700px] overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No templates.</div>}
          {list.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === t.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{t.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{t.body.slice(0, 50)}{t.body.length > 50 ? "…" : ""}</div>
                </div>
                <div className="flex flex-col gap-0.5 items-end">
                  <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-600">{t.category}</span>
                  {t.is_system && <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-blue-50 text-blue-700">System</span>}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Sends: {t.send_count}{t.template_key ? ` · ${t.template_key}` : ""}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {!selected && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Pick a template on the left, or click "New SMS template".
            </div>
          )}
          {selected && (
            <div className="border border-slate-200 rounded">
              <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="text-xs text-slate-600">
                  {selected.is_system ? <span className="font-semibold text-blue-700">SYSTEM TEMPLATE (read-only)</span> : "Editable template"}
                  {selected.template_key && <code className="ml-2 text-[10px] bg-slate-100 px-1 py-0.5 rounded">{selected.template_key}</code>}
                </div>
                <div className="flex items-center gap-2">
                  <PhoneInput value={testPhone} onChange={setTestPhone} onChangeRaw={setTestPhoneRaw} placeholder="+15551234567" className="text-xs border border-slate-300 rounded px-2 py-1 w-40" />
                  <button disabled={!testPhoneRaw.trim()} onClick={sendTest}
                    className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1 disabled:opacity-50">
                    <Send className="h-3 w-3" /> Send test
                  </button>
                  {selected.is_system ? (
                    <button onClick={clone} className="text-xs px-2.5 py-1 rounded bg-[#0B1C24] text-white flex items-center gap-1">
                      <CopyIcon className="h-3 w-3" /> Clone
                    </button>
                  ) : (
                    <>
                      <button disabled={saving} onClick={save} className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
                        <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={deactivate} className="text-xs px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> Deactivate
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">Name</label>
                  <input disabled={selected.is_system} value={draft.name || ""} onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">Description (optional)</label>
                  <input disabled={selected.is_system} value={draft.description || ""} onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                    className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 disabled:bg-slate-50" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-slate-500">Message body</label>
                    <span className={`text-[10px] ${overlimit ? "text-rose-700 font-semibold" : "text-slate-500"}`}>
                      {bodyLen}/160 chars{overlimit ? " — splits into multi-part SMS" : ""}
                    </span>
                  </div>
                  <textarea disabled={selected.is_system} value={draft.body || ""} onChange={(e) => setDraft(d => ({ ...d, body: e.target.value }))} rows={5}
                    placeholder="Hi {{contact.first_name}}, ..." className="w-full text-sm border border-slate-300 rounded p-2 font-mono disabled:bg-slate-50" />
                </div>
                <div className="text-[10px] text-slate-500">
                  Available variables: <code>{"{{contact.first_name}}"}</code> <code>{"{{contact.last_name}}"}</code> <code>{"{{contact.phone}}"}</code>{" "}
                  <code>{"{{tenant.name}}"}</code> <code>{"{{job.title}}"}</code> <code>{"{{job.scheduled_time}}"}</code> <code>{"{{job.tech_name}}"}</code> <code>{"{{review_url}}"}</code>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-3">
                  <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Preview (with sample vars)</div>
                  <div className="text-sm font-mono">{interp(draft.body || "")}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

// Local mirror of the server-side interpolate for live preview
function interp(s: string): string {
  const vars: Record<string, string> = {
    "contact.first_name": "Jane", "contact.last_name": "Doe", "contact.phone": "+15551234567",
    "tenant.name": "Your Business", "job.title": "HVAC tune-up", "job.scheduled_time": "9:00 AM",
    "job.scheduled_date": "tomorrow", "job.tech_name": "Sam", "job.eta": "15 min",
    "review_url": "https://portal.intelligentanalyticsdm.com/review",
  };
  return String(s).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (k in vars ? vars[k] : ""));
}

export default SparkSmsTemplatesPage;
