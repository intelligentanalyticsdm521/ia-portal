// SparkNpsSchedulesPage — Recurring NPS / CSAT survey schedules (v3.4).
//
// Master/detail page (mirrors SparkDashboardsPage). The sidebar lists
// schedules with cadence + countdown to next fire; the detail pane shows
// metadata, sent_count, and edit / fire-now / delete actions.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trash2, Pencil, Save, X, Send, Heart, Clock, Power, RefreshCw } from "lucide-react";

type Cadence = "once" | "weekly" | "monthly" | "quarterly";
type SurveyKind = "nps" | "csat";

interface Schedule {
  id: number;
  name: string;
  audience_type: string;
  audience_id: string | null;
  cadence: Cadence;
  next_fire_at: string | null;
  last_fire_at: string | null;
  sent_count: number;
  survey_kind: SurveyKind;
  is_active: boolean;
  created_at: string;
}

interface FormState {
  name: string;
  survey_kind: SurveyKind;
  audience_type: string;
  audience_id: string;
  cadence: Cadence;
  next_fire_at: string; // datetime-local format YYYY-MM-DDTHH:mm
}

const EMPTY_FORM: FormState = {
  name: "",
  survey_kind: "nps",
  audience_type: "all_contacts",
  audience_id: "",
  cadence: "monthly",
  next_fire_at: "",
};

const CADENCE_LABEL: Record<Cadence, string> = {
  once: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};
const CADENCE_COLOR: Record<Cadence, string> = {
  once: "#64748B",
  weekly: "#2563EB",
  monthly: "#7C3AED",
  quarterly: "#059669",
};
const KIND_LABEL: Record<SurveyKind, string> = { nps: "NPS", csat: "CSAT" };

function fmtCountdown(iso: string | null): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return "due now";
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 1) return `in ${day}d`;
  if (hr >= 1) return `in ${hr}h`;
  if (min >= 1) return `in ${min}m`;
  return "in <1m";
}

function fmtAbs(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

// Convert ISO string to datetime-local input format (YYYY-MM-DDTHH:mm).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

function audienceDescription(s: Schedule): string {
  if (s.audience_type === "all_contacts") return "All contacts";
  if (s.audience_id) return `${s.audience_type} #${s.audience_id}`;
  return s.audience_type;
}

export function SparkNpsSchedulesPage() {
  const { get, post, patch, del, ready } = useSparkApi();
  const [list, setList] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Create OR edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [busyFire, setBusyFire] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Schedule[] }>("/api/v1/nps-schedules");
      const items = r?.data || [];
      setList(items);
      if (items.length > 0 && selectedId == null) setSelectedId(items[0].id);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const selected = list.find((s) => s.id === selectedId) || null;

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(s: Schedule) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      survey_kind: s.survey_kind,
      audience_type: s.audience_type,
      audience_id: s.audience_id || "",
      cadence: s.cadence,
      next_fire_at: isoToLocalInput(s.next_fire_at),
    });
    setModalOpen(true);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return;
    const nextIso = localInputToIso(form.next_fire_at);
    if (!nextIso) { alert("Please choose a valid next-fire date/time."); return; }
    const body = {
      name,
      survey_kind: form.survey_kind,
      audience_type: form.audience_type,
      audience_id: form.audience_id.trim() || null,
      cadence: form.cadence,
      next_fire_at: nextIso,
    };
    try {
      if (editingId == null) {
        const r = await post<{ data: Schedule }>("/api/v1/nps-schedules", body);
        setModalOpen(false);
        setForm(EMPTY_FORM);
        await fetchList();
        if (r?.data?.id) setSelectedId(r.data.id);
      } else {
        await patch(`/api/v1/nps-schedules/${editingId}`, body);
        setModalOpen(false);
        setForm(EMPTY_FORM);
        await fetchList();
      }
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function toggleActive(s: Schedule) {
    try {
      await patch(`/api/v1/nps-schedules/${s.id}`, { is_active: !s.is_active });
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function fireNow(s: Schedule) {
    if (!confirm(`Send the ${KIND_LABEL[s.survey_kind]} survey now to the schedule's audience?`)) return;
    setBusyFire(s.id);
    try {
      await post(`/api/v1/nps-schedules/${s.id}/fire-now`, {});
      await fetchList();
    } catch (err) {
      alert(`Fire failed: ${(err as Error).message}`);
    } finally {
      setBusyFire(null);
    }
  }

  async function remove(s: Schedule) {
    if (!confirm(`Deactivate schedule "${s.name}"? It will stop firing automatically.`)) return;
    try {
      await del(`/api/v1/nps-schedules/${s.id}`);
      if (selectedId === s.id) setSelectedId(null);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="NPS Schedules"
      subtitle={`${list.length} schedule${list.length === 1 ? "" : "s"}`}
      help="Recurring NPS or CSAT surveys sent to a saved audience on a chosen cadence. Pause a schedule with the on/off toggle, or trigger a one-off send with Fire Now."
      actions={
        <button onClick={openCreate} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New schedule
        </button>
      }
      loading={loading}
      error={error}
    >
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Heart className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No survey schedules yet</div>
          <div className="text-xs text-slate-500 mt-1">Create your first recurring NPS or CSAT schedule.</div>
          <button onClick={openCreate} className="mt-4 text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white">
            Create schedule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          {/* Sidebar */}
          <aside>
            <ul className="space-y-1">
              {list.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                      selectedId === s.id
                        ? "border-[#EF6C33] bg-orange-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={`font-semibold text-sm truncate ${s.is_active ? "text-slate-900" : "text-slate-400"}`}>
                        {s.name}
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide text-white px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: CADENCE_COLOR[s.cadence] }}
                      >
                        {CADENCE_LABEL[s.cadence]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-slate-500 flex items-center gap-1 truncate">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        {s.is_active ? fmtCountdown(s.next_fire_at) : "Paused"}
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); toggleActive(s); }}
                        className={`px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 cursor-pointer ${s.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
                        title={s.is_active ? "Click to pause" : "Click to resume"}
                      >
                        {s.is_active ? "On" : "Off"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Detail */}
          <section>
            {selected ? (
              <ScheduleDetail
                s={selected}
                busyFire={busyFire === selected.id}
                onFire={() => fireNow(selected)}
                onEdit={() => openEdit(selected)}
                onDelete={() => remove(selected)}
                onToggle={() => toggleActive(selected)}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-slate-500">
                Select a schedule from the list.
              </div>
            )}
          </section>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold flex items-center gap-2">
                <Heart className="h-4 w-4" /> {editingId == null ? "New survey schedule" : "Edit schedule"}
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Quarterly customer NPS"
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#EF6C33]"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500">Survey kind</label>
                <select
                  value={form.survey_kind}
                  onChange={(e) => setForm({ ...form, survey_kind: e.target.value as SurveyKind })}
                  className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5"
                >
                  <option value="nps">NPS (0-10)</option>
                  <option value="csat">CSAT (1-5)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500">Cadence</label>
                <select
                  value={form.cadence}
                  onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })}
                  className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5"
                >
                  <option value="once">One-time</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500">Audience type</label>
                <input
                  value={form.audience_type}
                  onChange={(e) => setForm({ ...form, audience_type: e.target.value })}
                  placeholder="all_contacts | list | segment | tag"
                  className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500">Audience ID (optional)</label>
                <input
                  value={form.audience_id}
                  onChange={(e) => setForm({ ...form, audience_id: e.target.value })}
                  placeholder="123"
                  className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Next fire (local time)</label>
              <input
                type="datetime-local"
                value={form.next_fire_at}
                onChange={(e) => setForm({ ...form, next_fire_at: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModalOpen(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button
                onClick={save}
                disabled={!form.name.trim() || !form.next_fire_at}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1"
              >
                <Save className="h-3.5 w-3.5" /> {editingId == null ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

// ── Detail pane ────────────────────────────────────────────────────────

function ScheduleDetail(props: {
  s: Schedule;
  busyFire: boolean;
  onFire: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const { s, busyFire, onFire, onEdit, onDelete, onToggle } = props;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-slate-900 truncate">{s.name}</h3>
            <span
              className="text-[10px] font-semibold uppercase tracking-wide text-white px-1.5 py-0.5 rounded-full"
              style={{ background: CADENCE_COLOR[s.cadence] }}
            >
              {CADENCE_LABEL[s.cadence]}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-full">
              {KIND_LABEL[s.survey_kind]}
            </span>
            {!s.is_active && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                Paused
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">{audienceDescription(s)}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onFire}
            disabled={busyFire}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-[#EF6C33] text-white hover:opacity-90 disabled:opacity-50"
            title="Send the survey right now"
          >
            {busyFire ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Fire now
          </button>
          <button
            onClick={onToggle}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded border ${s.is_active ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-slate-50 border-slate-300 text-slate-600"}`}
            title={s.is_active ? "Pause" : "Resume"}
          >
            <Power className="h-3 w-3" /> {s.is_active ? "On" : "Off"}
          </button>
          <button
            onClick={onEdit}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            onClick={onDelete}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Next fire" value={s.is_active ? fmtCountdown(s.next_fire_at) : "—"} hint={fmtAbs(s.next_fire_at)} />
        <Stat label="Last fire" value={s.last_fire_at ? new Date(s.last_fire_at).toLocaleDateString() : "Never"} hint={fmtAbs(s.last_fire_at)} />
        <Stat label="Sent count" value={s.sent_count.toLocaleString()} />
        <Stat label="Created" value={new Date(s.created_at).toLocaleDateString()} hint={fmtAbs(s.created_at)} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-[#0B1C24] mt-0.5 tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={hint}>{hint}</div>}
    </div>
  );
}

export default SparkNpsSchedulesPage;
