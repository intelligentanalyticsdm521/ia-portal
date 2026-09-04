/**
 * CalendarSyncCard — OLIVER > Booking > Calendar sync (B4).
 *
 * One row per calendar a business can connect: Microsoft 365 and Google.
 * A business often has both — the company runs on Microsoft and the owner's
 * own diary lives in Google — so this is two independent rows, not a choice
 * between two options. Availability subtracts the busy time from every
 * connected calendar at once.
 *
 * Three things this card has to get right, all of them learned the hard way:
 *
 *   1. "Connected" must mean connected. A connection whose token renewal has
 *      failed still has a row in the database, and the old card rendered that
 *      as a green tick while the owner's real meetings had quietly stopped
 *      being excluded. Every row renders the backend's `status` word, and
 *      needs_reconnect is amber with the reason underneath.
 *
 *   2. "Not connected" and "cannot be connected yet" are different sentences.
 *      Until the one-time Google console step is done, pressing Connect can
 *      only ever land on a Google error page. When the API says Google is not
 *      configured the button is disabled and the card says so in words the
 *      owner can act on — or, more usefully, forward.
 *
 *   3. The word is Business, never tenant.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, Check } from "lucide-react";
import {
  type CalendarProvider, type CalendarStatus, type GoogleCalendarOption,
  PROVIDER_LABEL, GOOGLE_NOT_CONFIGURED_FALLBACK,
  toRows, isProviderUnavailable, errorMessageOf,
} from "../../lib/calendarConnections";

interface Api {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function CalendarSyncCard({ api }: { api: Api }) {
  const { get, post, put, del } = api;

  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState<CalendarProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Google calendar picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [options, setOptions] = useState<GoogleCalendarOption[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const reload = useCallback(async () => {
    try {
      setStatus(await get<CalendarStatus>("/booking/calendar/status"));
    } catch {
      // A booking page that has never had a calendar connected 404s here on
      // some older tenants. Absence of a connection is not an error worth a
      // red banner over the whole page.
      setStatus({ connections: [] });
    }
  }, [get]);

  useEffect(() => { void reload(); }, [reload]);

  // The OAuth callback sends the owner back here carrying the outcome. Read
  // it once, show it, and strip it from the URL so a refresh does not replay
  // a stale "connected" or a stale error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("calendar");
    if (!outcome) return;
    const provider = params.get("provider");
    const label = provider === "google" ? "Google Calendar" : "Microsoft 365";
    if (outcome === "connected") {
      setNotice(`${label} connected.`);
    } else if (outcome === "error") {
      setError(params.get("message") || `${label} could not be connected.`);
    }
    params.delete("calendar"); params.delete("provider");
    params.delete("code"); params.delete("message");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    void reload();
  }, [reload]);

  const rows = toRows(status);
  const googleUnavailableReason =
    status?.google_available === false ? (status?.google_unavailable_reason || null) : null;

  async function connect(provider: CalendarProvider) {
    setBusy(provider); setError(null); setNotice(null);
    try {
      const path = provider === "google"
        ? "/booking/calendar/google/connect"
        : "/booking/calendar/microsoft365/connect";
      const r = await post<{ auth_url: string }>(path, {});
      window.location.href = r.auth_url;
    } catch (e) {
      // The one case an owner can do something about: the Google console step
      // has not been done. Print the sentence the API sent, verbatim.
      setError(errorMessageOf(e, "Could not start the connection. Please try again."));
      setBusy(null);
    }
  }

  async function disconnect(provider: CalendarProvider) {
    const label = PROVIDER_LABEL[provider];
    if (!window.confirm(
      `Disconnect ${label}? New bookings will stop avoiding the times you are busy there.`,
    )) return;
    setBusy(provider); setError(null); setNotice(null);
    try {
      await del(provider === "google" ? "/booking/calendar/google" : "/booking/calendar/microsoft365");
      setPickerOpen(false);
      setNotice(`${label} disconnected.`);
      await reload();
    } catch (e) {
      setError(errorMessageOf(e, `Could not disconnect ${label}.`));
    } finally {
      setBusy(null);
    }
  }

  async function openPicker() {
    setPickerOpen(true); setPickerLoading(true); setError(null);
    try {
      const r = await get<{ calendars: GoogleCalendarOption[]; selected_calendar_ids: string[] }>(
        "/booking/calendar/google/calendars",
      );
      setOptions(r.calendars || []);
      setPicked((r.calendars || []).filter((c) => c.selected).map((c) => c.id));
    } catch (e) {
      setPickerOpen(false);
      setError(errorMessageOf(e, "Could not load your Google calendars."));
    } finally {
      setPickerLoading(false);
    }
  }

  async function savePicker() {
    setPickerSaving(true); setError(null);
    try {
      await put("/booking/calendar/google/calendars", { calendar_ids: picked });
      setPickerOpen(false);
      setNotice("Saved. OLIVER will hide the times you are busy on those calendars.");
      await reload();
    } catch (e) {
      setError(errorMessageOf(e, "Could not save your calendar choice."));
    } finally {
      setPickerSaving(false);
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** The name the owner gave a calendar, when we know it; the raw id otherwise
   *  (before the picker has ever been opened we only have ids). */
  function calendarLabel(id: string) {
    return options.find((o) => o.id === id)?.summary || id;
  }

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-2">
        <div className="rounded-md bg-amber-100 text-amber-700 p-1.5 mt-0.5">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Calendar sync</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Connect the calendars you already use and OLIVER will hide the times you are
            already busy. Read-only — OLIVER never adds, moves or deletes anything on your calendar.
          </p>
        </div>
      </div>

      {notice && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {rows.map((row) => {
          const connected = row.status !== null;
          const needsReconnect = row.status === "needs_reconnect";
          const unavailable = isProviderUnavailable(row, status);
          const working = busy === row.provider;

          return (
            <div key={row.provider} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{row.provider_label}</span>
                    {connected && !needsReconnect && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <Check className="h-3 w-3" /> Connected
                      </span>
                    )}
                    {needsReconnect && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Needs reconnect
                      </span>
                    )}
                    {!connected && !unavailable && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Not connected
                      </span>
                    )}
                    {unavailable && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Not available yet
                      </span>
                    )}
                  </div>

                  {connected && (
                    <div className="mt-1 text-xs text-slate-600">
                      <div>{row.account_email}</div>
                      {row.provider === "google" && row.calendars.length > 0 && (
                        <div className="mt-0.5 text-slate-500">
                          {row.calendars.length === 1
                            ? `Calendar: ${calendarLabel(row.calendars[0])}`
                            : `Calendars: ${row.calendars.map(calendarLabel).join(", ")}`}
                        </div>
                      )}
                      <div className="mt-0.5 text-slate-400">
                        {row.last_refreshed_at
                          ? `Last refreshed ${new Date(row.last_refreshed_at).toLocaleString()}`
                          : "Not refreshed yet"}
                      </div>
                    </div>
                  )}

                  {needsReconnect && (
                    <div className="mt-1 text-xs text-amber-800">
                      OLIVER can no longer read this calendar, so busy times are not being
                      hidden. Reconnect to fix it.
                      {row.last_refresh_error && (
                        <span className="block text-amber-700/80 mt-0.5">{row.last_refresh_error}</span>
                      )}
                    </div>
                  )}

                  {/* The one-time Google console step. Plain words, and the same
                      sentence the API sends, so support and the owner see one
                      message rather than two. */}
                  {unavailable && (
                    <div className="mt-1 max-w-lg text-xs text-slate-600">
                      {googleUnavailableReason || GOOGLE_NOT_CONFIGURED_FALLBACK}.
                      {" "}Nothing for you to do — we will turn it on.
                    </div>
                  )}

                  {!connected && !unavailable && (
                    <div className="mt-1 max-w-lg text-xs text-slate-600">
                      {row.provider === "google"
                        ? "OLIVER will read only when you are free or busy — never what your meetings are."
                        : "OLIVER reads your busy times only, and never creates or changes events."}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {connected && row.provider === "google" && (
                    <button
                      type="button"
                      onClick={() => (pickerOpen ? setPickerOpen(false) : void openPicker())}
                      disabled={working}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      {pickerOpen ? "Close" : "Choose calendars"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void connect(row.provider)}
                    disabled={working || unavailable}
                    className={
                      connected
                        ? "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                        : row.provider === "google"
                          ? "whitespace-nowrap rounded-md bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1765cc] disabled:opacity-50"
                          : "whitespace-nowrap rounded-md bg-[#0078D4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#106EBE] disabled:opacity-50"
                    }
                  >
                    {working
                      ? "Working…"
                      : connected
                        ? "Reconnect"
                        : `Connect ${row.provider_label}`}
                  </button>
                  {connected && (
                    <button
                      type="button"
                      onClick={() => void disconnect(row.provider)}
                      disabled={working}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Google calendar picker — which calendars mean "I am busy". */}
              {row.provider === "google" && connected && pickerOpen && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {pickerLoading ? (
                    <div className="text-xs text-slate-500">Loading your calendars…</div>
                  ) : (
                    <>
                      <div className="mb-2 text-xs font-semibold text-slate-700">
                        Which calendars mean you are busy?
                      </div>
                      <div className="max-h-56 space-y-1 overflow-y-auto">
                        {options.map((opt) => (
                          <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-white">
                            <input
                              type="checkbox"
                              checked={picked.includes(opt.id)}
                              onChange={() => togglePick(opt.id)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                            <span className="truncate">{opt.summary}</span>
                            {opt.primary && (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Main</span>
                            )}
                          </label>
                        ))}
                        {options.length === 0 && (
                          <div className="text-xs text-slate-500">No calendars on this account.</div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void savePicker()}
                          disabled={pickerSaving}
                          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                        >
                          {pickerSaving ? "Saving…" : "Save"}
                        </button>
                        <span className="text-[11px] text-slate-500">
                          {picked.length === 0
                            ? "None ticked — your main calendar will be used."
                            : `${picked.length} selected`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
