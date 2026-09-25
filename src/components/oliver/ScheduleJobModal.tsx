// ScheduleJobModal — pick a slot for a job, from inside the job.
//
// Brandon's flow, 2026-09-02: a quote is accepted overnight, you open the
// customer in the morning, and from the job you need to see your week and put
// it somewhere. Until now the only route from here was "Edit details" and a
// datetime field — typing a date blind, with no idea what else that day holds.
//
// The week strip answers the question actually being asked on the phone: "when
// am I free?" Slots come from GET /schedule/slots, which feeds the SAME engine
// as the public booking page rather than a second set of availability rules.
//
// Defaults when a business has configured nothing — which is every business
// today, since no tenant has business_hours set: Mon-Fri 8-5, one job per slot,
// 30-minute increments, and you choose the length here.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Info } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { IadmModal, IadmButton } from "../IadmModal";

interface Slot { startUtc: string; endUtc: string; available: boolean }
interface SlotsResp {
  date: string;
  duration_minutes: number;
  increment_minutes: number;
  using_default_hours: boolean;
  slots: Slot[];
}

interface Props {
  jobId: string;
  jobTitle?: string | null;
  /** Shown in the header so the person moving the job can see WHICH job
   *  (Brandon, 25 Sep 2026: "not sure where the job number is here"). */
  jobNumber?: string | null;
  customerName?: string | null;
  /** The job's current start, when it already has one: the window then reads
   *  as a reschedule and shows what it is moving FROM. */
  currentStart?: string | null;
  /** Minutes, when the job already knows how long it should take. */
  suggestedDuration?: number | null;
  onClose: () => void;
  onScheduled: (startIso: string, endIso: string) => void;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 30 minutes to 8 hours, in half-hour steps — Brandon's "increments of 30
 *  minutes to however long they need for that job". */
const DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 30);
const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${Math.floor(m / 60)} hr ${m % 60} min`;

export function ScheduleJobModal({ jobId, jobTitle, jobNumber, customerName, currentStart, suggestedDuration, onClose, onScheduled }: Props) {
  const { get, patch } = useOliverApi();
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [duration, setDuration] = useState<number>(() => {
    const s = Number(suggestedDuration);
    // Round a quoted duration onto the 30-minute grid so it lines up with the
    // slots being offered.
    return s > 0 ? Math.min(480, Math.max(30, Math.round(s / 30) * 30)) : 60;
  });
  const [days, setDays] = useState<Record<string, SlotsResp>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Brandon, 25 Sep 2026: "Currently I just click 10:30 and it sends, but it
  // should hold and then make the client click confirm & send… That way there
  // are no accidental clicks." A click SELECTS; "Confirm the new time" saves.
  const [selected, setSelected] = useState<Slot | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // The browser's own offset for this week. The person scheduling sits in the
    // business, so their offset is the business's — until
    // oliver.location.timezone is populated, which is null everywhere today.
    const tzOffset = weekStart.getTimezoneOffset();
    try {
      const results = await Promise.all(
        weekDays.map((d) =>
          get<SlotsResp>(
            `/schedule/slots?date=${ymd(d)}&duration_minutes=${duration}&tz_offset=${tzOffset}`,
          ).catch(() => null),
        ),
      );
      const next: Record<string, SlotsResp> = {};
      results.forEach((r, i) => { if (r) next[ymd(weekDays[i])] = r; });
      setDays(next);
      // Every day failing is a real failure, not an empty week. Saying "no
      // availability" here would send someone to tell a customer they are fully
      // booked when the truth is we could not load the calendar.
      if (!Object.keys(next).length) setError("Couldn't load your availability. Try again in a moment.");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [get, weekDays, duration, weekStart]);

  useEffect(() => { void load(); }, [load]);

  async function confirm() {
    const slot = selected;
    if (!slot) return;
    setSaving(slot.startUtc);
    setError(null);
    try {
      await patch(`/jobs/${jobId}`, {
        scheduled_start: slot.startUtc,
        scheduled_end: slot.endUtc,
      });
      onScheduled(slot.startUtc, slot.endUtc);
    } catch (e) {
      setError(`Couldn't book that slot: ${apiErrorMessage(e)}`);
      setSaving(null);
    }
  }

  const isMove = !!currentStart;
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const headline = [jobNumber, jobTitle, customerName].filter(Boolean).join(" · ");

  const usingDefaults = Object.values(days).some((d) => d.using_default_hours);
  const weekLabel = `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow={isMove ? "OLIVER · RESCHEDULE" : "OLIVER · SCHEDULE"}
      title={headline ? `${isMove ? "Reschedule" : "Schedule"} ${headline}` : (isMove ? "Reschedule this job" : "Schedule this job")}
      subtitle={isMove && currentStart
        ? `Now ${fmtWhen(currentStart)}. Pick a new time, then confirm it.`
        : "Pick how long it will take, then choose a time and confirm it."}
      size="info"
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: "100%" }}>
          {selected ? (
            <span style={{ fontSize: 12, color: "#0B1C24", marginRight: "auto" }}>
              <b>{isMove ? "Move to" : "Book for"} {fmtWhen(selected.startUtc)}</b>
              <span style={{ color: "#64748B" }}> · the customer gets an email with the {isMove ? "new " : ""}time.</span>
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#64748B", marginRight: "auto" }}>Nothing changes until you confirm.</span>
          )}
          <IadmButton variant="ghost" onClick={onClose} disabled={!!saving}>{isMove ? "Keep the old time" : "Close"}</IadmButton>
          <IadmButton variant="primary" onClick={() => void confirm()} disabled={!selected || !!saving}>
            {saving ? "Moving…" : (isMove ? "Confirm the new time" : "Confirm this time")}
          </IadmButton>
        </div>
      }
    >
      <div style={{ padding: 16, display: "grid", gap: 12, background: "#EEF3F6" }}>
        {/* How long */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Clock className="h-3.5 w-3.5" style={{ color: "#64748B" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>How long will it take?</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #CBD5E1", background: "#fff" }}
          >
            {DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
          </select>
          {suggestedDuration ? (
            <span style={{ fontSize: 11, color: "#64748B" }}>
              Suggested from what was quoted.
            </span>
          ) : null}
        </div>

        {/* Week nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
            style={navBtn}
          ><ChevronLeft className="h-4 w-4" /></button>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{weekLabel}</span>
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
            style={navBtn}
          ><ChevronRight className="h-4 w-4" /></button>
        </div>

        {usingDefaults && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: "#EFF6FF",
                        border: "1px solid #BFDBFE", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#1E3A8A" }}>
            <Info className="h-3.5 w-3.5" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Showing <b>Monday–Friday, 8am–5pm</b> because your business hours aren't set yet.
              Set them in Business Setup and this will follow your real week.
            </span>
          </div>
        )}

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6,
                        padding: "8px 10px", fontSize: 12, color: "#991B1B" }}>{error}</div>
        )}

        {loading && <div style={{ fontSize: 12, color: "#64748B" }}>Loading your week…</div>}

        {/* Days */}
        {!loading && (
          <div style={{ display: "grid", gap: 8 }}>
            {weekDays.map((d) => {
              const key = ymd(d);
              const day = days[key];
              const free = (day?.slots || []).filter((s) => s.available);
              const isToday = key === ymd(new Date());
              return (
                <div key={key} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
                      {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                      {isToday && <span style={{ marginLeft: 6, fontSize: 10, color: "#1A7DB5" }}>today</span>}
                    </span>
                    <span style={{ fontSize: 11, color: free.length ? "#64748B" : "#94A3B8" }}>
                      {free.length ? `${free.length} open` : "nothing open"}
                    </span>
                  </div>
                  {free.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      {day ? "Fully booked or outside your hours." : "Couldn't load this day."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {free.map((s) => (
                        <button
                          key={s.startUtc}
                          onClick={() => setSelected(selected?.startUtc === s.startUtc ? null : s)}
                          disabled={!!saving}
                          aria-pressed={selected?.startUtc === s.startUtc}
                          style={{
                            fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                            border: "1px solid " + (selected?.startUtc === s.startUtc ? "#1A7DB5" : "#CBD5E1"),
                            background: selected?.startUtc === s.startUtc ? "#1A7DB5" : "#fff",
                            color: selected?.startUtc === s.startUtc ? "#fff" : "#0B1C24",
                            opacity: saving && saving !== s.startUtc ? 0.5 : 1,
                          }}
                        >
                          {new Date(s.startUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

const navBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 6, border: "1px solid #CBD5E1",
  background: "#fff", cursor: "pointer", color: "#0B1C24",
};
