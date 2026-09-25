// DaySchedulePanel — an actual day calendar, not a row of buttons.
//
// Brandon, 2026-09-02: "can we make this look like an actual calendar… then you
// click time slot and can hit add job or double click on it and it opens the
// job modal automatically." The reference is Outlook's day view: hours down the
// side, work sitting in its real place, empty time you can click into.
//
// The version before this was a strip of "+ 8:00 AM" chips. It told you what
// was free but not what the day LOOKED like — you could not see that the
// morning was solid and the afternoon empty, which is the thing you are
// actually reading when someone asks "can you come today?".
//
// Click a free row to select it. Click again — or press Add job — to book it,
// creating the customer on the way if they are new. Jobs already on the day are
// blocks you can open.
//
// Slots come from GET /schedule/slots, the same availability engine as the
// public booking page. Rendered through the shared calendar's day-body render
// prop, so the Command Center's day view is untouched.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Clock } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { NewEntityLauncher } from "./customer/NewEntityLauncher";
import { jobColor, factsFromUnifiedEvent } from "../../oliver/jobStatusColors";
import { layoutLanes } from "../../oliver/calendarLanes";

interface Slot { startUtc: string; endUtc: string; available: boolean }
interface SlotsResp { slots: Slot[]; using_default_hours: boolean }

/** An event as the shared calendar hands it over. */
export interface DayEvent {
  id: string;
  kind: string;
  title: string;
  start: string;
  end?: string | null;
  color: string;
  ref_url?: string | null;
  status?: string | null;
  job_title?: string | null;
  customer_name?: string | null;
  worker_count?: number | null;
  reschedule_requested?: boolean | null;
}

interface Props {
  dayKey: string;
  events: DayEvent[];
  onDone: () => void;
  /**
   * Open what a block stands for (2026-09-25, Brandon W-OB-05: "I can't click
   * the … job to open"). The blocks used to be links to ref_url — a job link
   * the Job Board ignored and a booking link to the Booking setup page — so
   * nothing opened. The Schedule page passes the job panel here.
   */
  onOpenEvent?: (e: DayEvent) => void;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${Math.floor(m / 60)} hr ${m % 60} min`;
const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** One row per half hour. 26px reads as a calendar without needing a scroll for
 *  a normal working day. */
const ROW_H = 26;
const SLOT_MIN = 30;

export function DaySchedulePanel({ dayKey, events, onDone, onOpenEvent }: Props) {
  const { get, post } = useOliverApi();
  const api = useMemo(() => ({ get, post }), [get, post]);

  const [duration, setDuration] = useState(60);
  const [resp, setResp] = useState<SlotsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [booking, setBooking] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = new Date(`${dayKey}T12:00:00`).getTimezoneOffset();
      setResp(await get<SlotsResp>(`/schedule/slots?date=${dayKey}&duration_minutes=${duration}&tz_offset=${tz}`));
    } catch (e) {
      // A failed load is not an empty day. Telling someone they have no
      // availability when we could not reach the calendar turns a customer
      // away for nothing.
      setError(apiErrorMessage(e));
      setResp(null);
    } finally {
      setLoading(false);
    }
  }, [get, dayKey, duration]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(null); }, [duration, dayKey]);

  const jobEvents = useMemo(
    () => events.filter((e) => e.kind === "job" || e.kind === "booking"),
    [events],
  );

  // The window the grid draws: business hours, widened to cover anything
  // already booked outside them. A job at 7am must not be invisible just
  // because the business says it opens at eight.
  const { startHour, endHour } = useMemo(() => {
    const times: number[] = [];
    for (const s of resp?.slots || []) {
      times.push(new Date(s.startUtc).getHours());
      times.push(new Date(s.endUtc).getHours() + (new Date(s.endUtc).getMinutes() ? 1 : 0));
    }
    for (const e of jobEvents) {
      times.push(new Date(e.start).getHours());
      if (e.end) times.push(new Date(e.end).getHours() + (new Date(e.end).getMinutes() ? 1 : 0));
    }
    if (!times.length) return { startHour: 8, endHour: 17 };
    return { startHour: Math.max(0, Math.min(...times)), endHour: Math.min(24, Math.max(...times) + 1) };
  }, [resp, jobEvents]);

  const rows = Math.max(1, (endHour - startHour) * (60 / SLOT_MIN));
  const dayStart = useMemo(() => {
    const d = new Date(`${dayKey}T00:00:00`);
    d.setHours(startHour, 0, 0, 0);
    return d;
  }, [dayKey, startHour]);

  /** Vertical offset in px for an instant. */
  const topFor = useCallback(
    (iso: string) => ((new Date(iso).getTime() - dayStart.getTime()) / 60000 / SLOT_MIN) * ROW_H,
    [dayStart],
  );

  const freeByStart = useMemo(() => {
    const m = new Map<number, Slot>();
    for (const s of resp?.slots || []) if (s.available) m.set(new Date(s.startUtc).getTime(), s);
    return m;
  }, [resp]);

  function rowSlot(rowIndex: number): Slot | null {
    const t = dayStart.getTime() + rowIndex * SLOT_MIN * 60000;
    return freeByStart.get(t) || null;
  }

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
      setSelected(null);
      onDone();
    } catch (e) {
      setError(`Couldn't create that job: ${apiErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold text-slate-900">How long?</span>
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
        >
          {DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
        </select>
        <span className="text-[11px] text-slate-500">
          {loading ? "checking…" : `${freeByStart.size} open`}
        </span>
        {selected && (
          <button
            onClick={() => setBooking(selected)}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-1 rounded bg-[#1A7DB5] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            <Plus className="h-3 w-3" />
            Add job at {hhmm(new Date(selected.startUtc))}
          </button>
        )}
      </div>

      {resp?.using_default_hours && !loading && (
        <p className="mb-2 text-[11px] text-slate-500">
          Using Mon–Fri 8am–5pm — your business hours aren't set yet.
        </p>
      )}
      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div>
      )}

      {/* The day */}
      <div className="rounded-md border border-slate-200 bg-white">
        <div ref={gridRef} className="relative flex" style={{ height: rows * ROW_H }}>
          {/* Hour gutter */}
          <div className="relative w-14 shrink-0 border-r border-slate-100">
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <div
                key={i}
                className="absolute right-1 text-[10px] tabular-nums text-slate-400"
                style={{ top: i * 2 * ROW_H - 6 }}
              >
                {new Date(0, 0, 0, startHour + i).toLocaleTimeString([], { hour: "numeric" })}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="relative flex-1">
            {Array.from({ length: rows }, (_, i) => {
              const slot = rowSlot(i);
              const isHour = i % 2 === 0;
              const isSelected = !!slot && !!selected && slot.startUtc === selected.startUtc;
              return (
                <div
                  key={i}
                  onClick={() => slot && setSelected(slot)}
                  onDoubleClick={() => slot && setBooking(slot)}
                  title={slot ? `Free — click to select, double-click to book` : undefined}
                  className={`absolute inset-x-0 ${isHour ? "border-t border-slate-200" : "border-t border-dashed border-slate-100"} ${
                    slot ? "cursor-pointer hover:bg-sky-50" : ""
                  } ${isSelected ? "bg-sky-100" : ""}`}
                  style={{ top: i * ROW_H, height: ROW_H }}
                />
              );
            })}

            {/* Jobs already on the day. Two at the same time sit side by side
                (they used to stack, and the one underneath could not be
                clicked). Colour = the one job map (src/oliver/jobStatusColors). */}
            {layoutLanes(jobEvents, (e) => ({
              start: new Date(e.start).getTime(),
              end: e.end ? new Date(e.end).getTime() : NaN,
            })).map(({ item: e, lane, lanes }) => {
              const top = topFor(e.start);
              const end = e.end ? topFor(e.end) : top + ROW_H;
              const height = Math.max(ROW_H - 2, end - top - 2);
              if (top < 0 || top > rows * ROW_H) return null;
              const c = jobColor(factsFromUnifiedEvent(e));
              const name = e.kind === "job" ? (e.job_title || e.title) : "Booking request";
              const who = e.customer_name ? ` · ${e.customer_name}` : "";
              const text = `${hhmm(new Date(e.start))} ${name}${who}`;
              const tip = `${text}\n${c.label}: ${c.meaning}`;
              const place = {
                top: top + 1, height, background: c.solid, color: c.onSolid,
                left: `calc(${(lane / lanes) * 100}% + 4px)`,
                width: `calc(${100 / lanes}% - 10px)`,
              };
              return onOpenEvent ? (
                <button
                  key={e.id}
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); onOpenEvent(e); }}
                  className="absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-[10px] font-medium hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[#1A7DB5]"
                  style={place}
                  title={`${tip}\n${e.kind === "job" ? "Click to open the job" : "Click to confirm it on Service Requests"}`}
                >
                  {text}
                </button>
              ) : (
                <a
                  key={e.id}
                  href={e.ref_url || undefined}
                  className="absolute overflow-hidden rounded px-1.5 py-0.5 text-[10px] font-medium no-underline"
                  style={place}
                  title={tip}
                >
                  {text}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        Click a free time to select it, or double-click to book straight away.
      </p>

      {/* Phone-call flow: pick or CREATE the customer, then the job lands on the
          slot that was chosen. Same launcher the Job Board uses, so there is one
          "new customer" experience rather than two. */}
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
