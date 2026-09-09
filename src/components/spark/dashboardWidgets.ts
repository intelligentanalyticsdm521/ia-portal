// dashboardWidgets — what a dashboard widget actually reads, and how.
//
// THE DEFECT THIS CLOSES. Dashboards let a client create, name, pin and share
// a layout, and every widget in it rendered the same thing: its own title, its
// own type, the URL it WOULD have called, and the words "Widget renderer
// pending". The page carried a banner saying so and promising v1.1. Every
// endpoint those widgets name has been live for months.
//
// A CATALOGUE, NOT A GENERIC FETCHER. It would be shorter to fetch
// `widget.source` and hope, but a dashboard is a thing a client reads a number
// off and repeats in a meeting, and "hope" is how an unrelated payload becomes
// a plausible wrong figure. So every widget the palette offers is a row here
// with its own reader, and a layout naming a source that is not in this list
// renders an honest "we have no reader for this" rather than a number.
//
// EVERY READER IS TOTAL AND EVERY READER CAN SAY "NOTHING". A business with no
// contacts has zero contacts, and that is a real answer that renders as 0. An
// endpoint that FAILED is a different thing and renders as an error, never as
// zero — the SPARK pack 1 lesson from IA Insights, where a fetch that threw and
// a business with no data were indistinguishable and both drew charts.

export type WidgetKind = "metric" | "chart" | "list";

export interface WidgetSeriesPoint {
  label: string;
  value: number;
}

export interface WidgetListRow {
  id: string | number;
  title: string;
  detail?: string | null;
  at?: string | null;
}

export interface WidgetValue {
  metric?: number | null;
  suffix?: string;
  series?: WidgetSeriesPoint[];
  rows?: WidgetListRow[];
  /** What a reader wants to say when the answer is a real, empty one. */
  emptyNote?: string;
}

export interface WidgetSource {
  /** The `source` string a saved layout carries. This IS the key. */
  source: string;
  kind: WidgetKind;
  /** The default title the palette gives it. A saved layout may override it. */
  title: string;
  /** What the number means, in the client's words, under the number. */
  caption: string;
  read: (payload: unknown) => WidgetValue;
}

/* ── little readers, each total ───────────────────────────────────────────── */

function obj(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** `{ data: [...], meta: { total } }` — the list envelope LUMEN uses. */
function totalFromListEnvelope(payload: unknown): number | null {
  const p = obj(payload);
  const meta = obj(p.meta);
  const t = num(meta.total);
  if (t != null) return t;
  // No meta on this response — the length of the page is the honest floor, and
  // it is only right when the page held everything. Rather than report a page
  // size as a total, say we do not know.
  return null;
}

export const WIDGET_SOURCES: WidgetSource[] = [
  {
    source: "/api/v1/contacts?limit=1",
    kind: "metric",
    title: "Total Contacts",
    caption: "people and businesses in your address book",
    read: (payload) => ({ metric: totalFromListEnvelope(payload) }),
  },
  {
    source: "/api/v1/campaigns?limit=1",
    kind: "metric",
    title: "Campaigns",
    caption: "everything you have built, sent or scheduled",
    read: (payload) => ({ metric: totalFromListEnvelope(payload) }),
  },
  {
    source: "/api/v1/health-score/distribution",
    kind: "metric",
    title: "Average Health Score",
    caption: "across everyone we could score",
    read: (payload) => {
      const d = obj(obj(payload).data);
      const scored = num(d.total_scored) ?? 0;
      return {
        metric: scored > 0 ? num(d.average) : null,
        suffix: "/100",
        emptyNote: scored > 0 ? undefined : "Nobody has enough history to score yet.",
      };
    },
  },
  {
    source: "/api/v1/leads?status=new&limit=1",
    kind: "metric",
    title: "New leads",
    caption: "in your Lead Inbox, not yet dealt with",
    read: (payload) => ({ metric: totalFromListEnvelope(payload) }),
  },
  {
    source: "/api/v1/activity/summary?days=30",
    kind: "chart",
    title: "Activity (30 days)",
    caption: "what has happened across your account",
    read: (payload) => {
      const p = obj(payload);
      const rows = arr(p.data).length ? arr(p.data) : arr(p.items);
      const series = rows
        .map((r) => {
          const row = obj(r);
          const type = String(row.activity_type || "").replace(/[._]/g, " ").trim();
          return { label: type || "other", value: num(row.n) ?? num(row.count) ?? 0 };
        })
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      return { series, emptyNote: series.length ? undefined : "Nothing has happened in the last 30 days." };
    },
  },
  {
    source: "/api/v1/activity?limit=10",
    kind: "list",
    title: "Recent activity",
    caption: "the last ten things that happened",
    read: (payload) => {
      const p = obj(payload);
      const rows = (arr(p.data).length ? arr(p.data) : arr(p.items)).map((r) => {
        const row = obj(r);
        return {
          id: (row.id as string | number) ?? Math.random(),
          title: String(row.title || row.activity_type || "Activity"),
          detail: row.detail ? String(row.detail) : null,
          at: row.occurred_at ? String(row.occurred_at) : null,
        };
      });
      return { rows, emptyNote: rows.length ? undefined : "Nothing yet." };
    },
  },
  {
    source: "/api/v1/conversations/inbox/counts",
    kind: "metric",
    title: "Unread conversations",
    caption: "texts, calls and web chats nobody has opened",
    read: (payload) => {
      const d = obj(obj(payload).data);
      return { metric: num(d.total) };
    },
  },
];

const BY_SOURCE = new Map(WIDGET_SOURCES.map((w) => [w.source, w]));

/** The reader for a saved widget, or null when we have none for it. */
export function readerFor(source: unknown): WidgetSource | null {
  return typeof source === "string" ? BY_SOURCE.get(source) ?? null : null;
}

/** The default layout the New-dashboard button starts a client with. Every
 *  entry is a source that has a reader here, by construction. */
export const DEFAULT_WIDGET_SOURCES: string[] = [
  "/api/v1/contacts?limit=1",
  "/api/v1/leads?status=new&limit=1",
  "/api/v1/conversations/inbox/counts",
  "/api/v1/health-score/distribution",
  "/api/v1/activity/summary?days=30",
  "/api/v1/activity?limit=10",
];
