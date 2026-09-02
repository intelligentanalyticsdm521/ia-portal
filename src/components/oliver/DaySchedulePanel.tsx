// DaySchedulePanel — one day's slots, and a way to book into a gap.
//
// Brandon, 2026-09-02: "A lot of these service industries will get a phone call
// from a new customer and want to immediately schedule, so they should be able
// to go out to the calendar and start the +new job function and add the new
// customer and do everything there."
//
// That is the dispatch flow: phone rings, open today, see where the gaps are,
// book it in — creating the customer on the way if they are new. Before this,
// clicking a day said "Nothing scheduled this day." and offered nothing to do
// about it.
//
// Slots come from GET /schedule/slots — the same availability engine as the
// public booking page. Rendered inside the shared calendar's day modal through
// a render prop, so the Command Center's day view is untouched.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Clock } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { NewEntityLauncher } from "./customer/NewEntityLauncher";

interface Slot { startUtc: string; endUtc: string; available: boolean }
interface SlotsResp {
  slots: Slot[];
  using_default_hours: boolean;
  duration_minutes: number;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${Math.floor(m / 60)} hr ${m % 60} min`;
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

interface Props {
  dayKey: string;                 // YYYY-MM-DD
  /** Called after a job is booked, so the calendar behind can reload. */
  onDone: () => void;
}

export function DaySchedulePanel({ dayKey, onDone }: Props) {
  const { get, post } = useOliverApi();
  // NewEntityLauncher's Api is just { get, post }. Memoised per the portal's
  // data-fetching convention — an object rebuilt every render would remount the
  // launcher mid-typing.
  const api = useMemo(() => ({ get, post }), [get, post]);
  const [duration, setDuration] = useState(60);
  const [resp, setResp] = useState<SlotsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = new Date(`${dayKey}T12:00:00`).getTimezoneOffset();
      const r = await get<SlotsResp>(
        `/schedule/slots?date=${dayKey}&duration_minutes=${duration}&tz_offset=${tz}`,
      );
      setResp(r);
    } catch (e) {
      // A failed load is not an empty day. Telling someone they have no
      // availability when we simply could not reach the calendar is how a
      // customer gets turned away for nothing.
      setError(apiErrorMessage(e));
      setResp(null);
    } finally {
      setLoading(false);
    }
  }, [get, dayKey, duration]);

  useEffect(() => { void load(); }, [load]);

  async function createJobAt(slot: Slot, customerId: string) {
    setSaving(true);
    setError(null);
    try {
      await post("/jobs", {
        contact_id: customerId,
        title: `Job — ${new Date(slot.startUtc).toLocaleDateString()}`,
        scheduled_start: slot.startUtc,
        scheduled_end: slot.endUtc,
      });
      setBooking(null);
      onDone();
    } catch (e) {
      setError(`Couldn't create that job: ${apiErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const free = (resp?.slots || []).filter((s) => s.available);
  const taken = (resp?.slots || []).filter((s) => !s.available);

  return (
    <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold text-slate-900">Book this day</span>
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
        >
          {DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
        </select>
        <span className="text-[11px] text-slate-500">
          {loading ? "checking…" : `${free.length} open`}
        </span>
      </div>

      {resp?.using_default_hours && !loading && (
        <p className="mb-2 text-[11px] text-slate-500">
          Using Mon–Fri 8am–5pm — your business hours aren't set yet.
        </p>
      )}

      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div>
      )}

      {!loading && !error && free.length === 0 && (
        <p className="text-[11px] text-slate-500">
          Nothing open at {durationLabel(duration)}. Try a shorter job, or another day.
        </p>
      )}

      {free.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {free.map((s) => (
            <button
              key={s.startUtc}
              onClick={() => setBooking(s)}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 hover:border-[#1A7DB5] hover:text-[#1A7DB5] disabled:opacity-50"
              title={`Book a ${durationLabel(duration)} job at ${hhmm(s.startUtc)}`}
            >
              <Plus className="h-3 w-3" />
              {hhmm(s.startUtc)}
            </button>
          ))}
        </div>
      )}

      {taken.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          {taken.length} slot{taken.length === 1 ? "" : "s"} already taken — the jobs on them are listed below.
        </p>
      )}

      {/* Phone-call flow: pick or CREATE the customer, then the job lands on the
          slot that was clicked. Same launcher the Job Board uses, so there is
          one "new customer" experience rather than two. */}
      {booking && (
        <NewEntityLauncher
          defaultKind="job"
          api={api}
          onCancel={() => setBooking(null)}
          onResolved={({ customerId }) => void createJobAt(booking, customerId)}
        />
      )}
    </div>
  );
}
