/**
 * calendarConnections — the pure half of the OLIVER booking Calendar sync card.
 *
 * Kept out of the .tsx on purpose: everything here is a decision the card
 * makes about what an owner is told, and those decisions are the ones worth
 * pinning with tests. The component is layout.
 */

export type CalendarProvider = "microsoft365" | "google";

export interface CalendarConnection {
  provider: CalendarProvider;
  provider_label: string;
  account_email: string | null;
  /** 'connected' | 'needs_reconnect' — never a bare boolean. A connection
   *  whose token renewal has failed still has a row, and rendering that as a
   *  green tick is how an owner's real meetings quietly stopped being
   *  excluded from their booking page for an hour at a time. */
  status: "connected" | "needs_reconnect" | null;
  last_refreshed_at: string | null;
  last_refresh_error: string | null;
  /** Google: the calendar ids the owner ticked. Microsoft: the one mailbox. */
  calendars: string[];
  /** False only for Google, and only before the one-time Google console step. */
  is_configured: boolean;
}

export interface CalendarStatus {
  connections?: CalendarConnection[];
  google_available?: boolean;
  google_unavailable_reason?: string | null;
  google_unavailable_code?: string | null;
  /** Legacy single-connection fields (Microsoft 365 only). */
  connected?: boolean;
  status?: "connected" | "needs_reconnect" | null;
  account_email?: string | null;
  last_refreshed_at?: string | null;
  last_refresh_error?: string | null;
}

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  access_role: string | null;
  selected: boolean;
}

/** The order the card lists the rows in. Fixed, so the two rows never
 *  reshuffle between loads. */
export const PROVIDER_ORDER: CalendarProvider[] = ["microsoft365", "google"];

export const PROVIDER_LABEL: Record<CalendarProvider, string> = {
  microsoft365: "Microsoft 365",
  google: "Google Calendar",
};

/** The sentence for the one-time Google console step, when the API has not
 *  sent one of its own. */
export const GOOGLE_NOT_CONFIGURED_FALLBACK =
  "Google is not set up for calendar access yet — this needs a one-time step in the Google console";

/** oliverApi throws `Error("OLIVER API 503: {json}")`. The code inside that
 *  body is the difference between "try again" and "this needs a one-time
 *  setup step", so it has to survive the trip intact. */
export function errorCodeOf(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const brace = msg.indexOf("{");
  if (brace === -1) return null;
  try {
    const body = JSON.parse(msg.slice(brace));
    return typeof body?.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

/** The message an owner should read. Prefers the API's own sentence — support
 *  and the owner then see one message rather than two paraphrases. */
export function errorMessageOf(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const brace = msg.indexOf("{");
  if (brace >= 0) {
    try {
      const body = JSON.parse(msg.slice(brace));
      if (typeof body?.message === "string" && body.message) return body.message;
    } catch { /* fall through to the raw message */ }
  }
  return msg || fallback;
}

/** Normalise whatever the API returned into exactly one row per provider —
 *  connected or not — so the card always renders both rows in the same order.
 *
 *  The legacy branch matters for a few minutes, not forever: the Portal and
 *  oliver-api deploy separately, and in the window where a new Portal talks to
 *  an old API there is no `connections` array. Falling through to "nothing is
 *  connected" there would tell an owner with a working Outlook connection that
 *  they have none, and the obvious response to that is to reconnect it. */
export function toRows(status: CalendarStatus | null): CalendarConnection[] {
  const live: CalendarConnection[] = status?.connections
    ? status.connections
    : status?.connected
      ? [{
          provider: "microsoft365",
          provider_label: PROVIDER_LABEL.microsoft365,
          account_email: status.account_email ?? null,
          status: status.status ?? "connected",
          last_refreshed_at: status.last_refreshed_at ?? null,
          last_refresh_error: status.last_refresh_error ?? null,
          calendars: [],
          is_configured: true,
        }]
      : [];

  return PROVIDER_ORDER.map((provider) => {
    const found = live.find((c) => c.provider === provider);
    if (found) {
      return { ...found, provider_label: found.provider_label || PROVIDER_LABEL[provider] };
    }
    return {
      provider,
      provider_label: PROVIDER_LABEL[provider],
      account_email: null,
      status: null,
      last_refreshed_at: null,
      last_refresh_error: null,
      calendars: [],
      // A provider with no row is un-connectable only if the API said so.
      is_configured: provider === "google" ? status?.google_available !== false : true,
    };
  });
}

/** Whether the Google row should say "Not available yet" and disable Connect
 *  rather than "Not connected" and offer it. Only ever true for a Google row
 *  that is not already connected: once a business IS connected, a
 *  configuration flag flapping must not hide their live connection. */
export function isProviderUnavailable(
  row: CalendarConnection,
  status: CalendarStatus | null,
): boolean {
  if (row.provider !== "google") return false;
  if (row.status !== null) return false;
  return status?.google_available === false;
}
