/**
 * OliverBookingPage — `OLIVER > Customers > Booking`
 *
 * Single config page where tenants configure their public booking
 * experience. The booking page itself is the oliver-ops SWA, served at
 * `book.ia-dm.com/<business>/<page>` — the BUSINESS IS IN THE PATH
 * (Q-APPS-PWA / SEAM-5-A). This portal page controls the data behind it.
 *
 * One settings row per tenant for Standard tier. The DB schema supports
 * multiple booking pages — that's the Pro tier upgrade. Standard
 * tenants get a dead-simple single-page UX.
 *
 * ── WHAT OLIVER PACK 1 ADDED HERE (2026-09-08) ──────────────────────────────
 * Five things were configurable on the API and invisible or unwritable here, so
 * a client could set them up and never see them on their own booking page:
 *
 *   · the business's TIME ZONE, and where the hours come from. The slot engine
 *     read "08:00" as 08:00 UTC, so a Central-time plumber's page offered 3am
 *     appointments. ONE home for the hours now: typed once in the business
 *     profile, inherited here, overridden only on purpose.
 *   · WHICH SERVICES the page sells (services_json — read by the public API
 *     since F-48, never written by this editor).
 *   · whether the guest is asked for the SERVICE ADDRESS. Without it every
 *     booked job had none, and the crew app's address and map link were blank
 *     for exactly the jobs booked online.
 *   · the owner's own EXTRA QUESTIONS (form_fields — this page overwrote the
 *     column with `[]` on every save).
 *   · the booking URL itself: this page built `<slug>.book.ia-dm.com`, a shape
 *     with no DNS binding that has never resolved. It reads the API's URL now,
 *     and shows OUR OWN QR of it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { CalendarSyncCard } from "./CalendarSyncCard";
import { Copy, ExternalLink, Calendar as CalendarIcon, Link2, Globe, RefreshCw } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types — match the oliver-api responses
// ─────────────────────────────────────────────────────────────────────────────
interface OrgSettings {
  tenantFullName?: string;
  preferredBusinessName?: string;
  slug?: string;
  website?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
}

interface BookingPage {
  booking_page_id: string;
  slug: string;
  title: string;
  description: string | null;
  job_category: string;
  job_type: string;
  duration_minutes: number;
  buffer_minutes: number;
  advance_notice_hours: number;
  max_days_ahead: number;
  availability_windows: AvailabilityWindow[] | string;
  // form_fields was `unknown` — the type of a column nothing could read. It is
  // typed and editable now (OLIVER pack 1); see the BookingFormField block below.
  confirmation_message: string | null;
  brand_color: string | null;
  logo_url: string | null;
  is_active: boolean;
  require_confirmation: boolean;
  // F-52 — Price visibility per visitor kind. The public renderer looks up
  // the visitor's email/phone in lumen.contact; if they match, they're
  // treated as a returning customer.
  show_price_to_new_customer: boolean;
  show_price_to_returning_customer: boolean;
  // F-47 — slot capacity. 'auto' = one per slot (concurrency = worker count),
  // 'fixed' = capacity_count attendees per slot, 'group' = unlimited.
  capacity_mode: "auto" | "fixed" | "group";
  capacity_count: number | null;
  url?: string;
  // ── OLIVER pack 1 (migration 205) ─────────────────────────────────────────
  /** IANA zone this page's hours are written in. NULL = follow the business's
   *  location, which is where the zone lives. */
  timezone?: string | null;
  /** 'inherit' = use the hours from Settings; 'override' = this page has its
   *  own, narrower hours. ONE home for the hours: the owner types them once. */
  hours_source?: "inherit" | "override";
  /** Does the public form ask where the work is? ON for field service. */
  collect_service_address?: boolean;
  /** The owner's own questions on the booking form. */
  form_fields?: BookingFormField[];
  /** service_offering_id[] the page sells. The editor round-trips this. */
  services?: string[];
  // Read-only, computed by the API — what is actually IN FORCE right now.
  effective_availability_windows?: AvailabilityWindow[];
  effective_hours_source?: "override" | "settings" | "default";
  effective_timezone?: string;
}

/** One question the owner asks on the booking form. */
interface BookingFormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "tel" | "email" | "number" | "checkbox" | "select";
  required?: boolean;
  options?: string[];
}

/** A service from the catalog, for the picker. */
interface CatalogOffering {
  offering_id: string;
  name: string;
  default_duration_minutes?: number | null;
  is_active?: boolean;
  offering_type?: string | null;
}

interface AvailabilityWindow {
  day_of_week: number;   // 0=Sun … 6=Sat
  start_time: string;    // "09:00"
  end_time: string;      // "17:00"
}

// THE BUSINESS IS IN THE PATH: `book.ia-dm.com/<business>/<page>`.
//
// This page used to build `https://<slug>.book.ia-dm.com` and show it to the
// owner as "your booking link". There is NO `*.book.ia-dm.com` binding in DNS —
// the code merely reserved the pattern — so the address the owner copied onto a
// flyer has never resolved for any client, while oliver-api's own builder has
// returned the correct path form all along. The URL now comes from the API
// (`page.url`, built by oliver-api lib/bookingLinks.js, the one home for it) and
// the suffix below is only used to render the shape in the help text.
const BOOKING_HOST_SUFFIX = "book.ia-dm.com";

/** The zones a US/Canada field-service business actually operates in, plus UTC.
 *  A datalist, not a closed select: an owner in another country types theirs and
 *  the API validates it with Intl (routes/booking.js normalizeTimeZone). */
const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "America/Toronto", "America/Vancouver", "America/Halifax", "UTC",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30];
const JOB_CATEGORIES = [
  { value: "project", label: "Project (one-off scope)" },
  { value: "field_service", label: "Field service (recurring/onsite)" },
  { value: "retainer", label: "Retainer (ongoing engagement)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function OliverBookingPage() {
  const { get, post, patch, put, del } = useOliverApi();
  // useMemo'd, per the data-fetching convention: a fresh object literal every
  // render would re-fire CalendarSyncCard's load effect on every keystroke in
  // the form above it.
  const calendarApi = useMemo(() => ({ get, post, put, del }), [get, post, put, del]);

  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [bookingPage, setBookingPage] = useState<BookingPage | null>(null);
  const [draft, setDraft] = useState<BookingPage | null>(null);
  // OLIVER pack 1 — the services the owner can put on the page, and the QR of
  // the (correct) URL.
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Calendar sync moved to <CalendarSyncCard>, which owns its own state: it
  // is two independent provider rows now (Microsoft 365 + Google), each with
  // its own connect/reconnect/disconnect and, for Google, a calendar picker.
  // Keeping that in this page's already-large state was how the M365 row ended
  // up rendering a green tick over a connection whose token renewal had failed.

  // ── Load both settings + first booking page ─────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const settings = await get<OrgSettings>("/settings");
      setOrgSettings(settings);
      setSlugDraft(settings.slug || "");

      // The services this business sells, so the owner can choose which appear
      // on the booking page. services_json has existed since F-48 and this
      // editor never wrote it — a multi-service page could only be built by
      // hand against the API.
      try {
        // useOliverApi already strips the { data: … } envelope — declaring it here
        // and reading `.data` is the portal's most repeated bug
        // (test/no-double-unwrap.test.mjs).
        const offs = await get<CatalogOffering[]>("/catalog/offerings");
        setOfferings((offs || []).filter((o) =>
          o.is_active !== false && (o.offering_type ?? "service") === "service"));
      } catch {
        // A catalog read failure must not stop the owner editing their hours.
        setOfferings([]);
      }

      // List booking pages — we pick the first (Standard tier = one).
      // If none exist, leave bookingPage null and present a "Start" form.
      const pagesRes = await get<{ data?: BookingPage[] } | BookingPage[]>("/booking/pages");
      const pages = Array.isArray(pagesRes) ? pagesRes : ((pagesRes as any).data ?? []);
      const listed = pages[0] || null;
      // GET /booking/pages/:id carries the parsed questions, the service list and
      // the EFFECTIVE hours + zone (what is actually in force, and where they
      // came from). The list endpoint carries neither.
      let first = listed;
      if (listed) {
        try {
          first = await get<BookingPage>(`/booking/pages/${listed.booking_page_id}`);
        } catch { /* fall back to the list row */ }
      }
      if (first) {
        const hydrated: BookingPage = {
          ...first,
          availability_windows: typeof first.availability_windows === "string"
            ? JSON.parse(first.availability_windows || "[]")
            : (first.availability_windows || []),
          form_fields: Array.isArray(first.form_fields) ? first.form_fields : [],
          services: Array.isArray(first.services) ? first.services : [],
        };
        setBookingPage(hydrated);
        setDraft(hydrated);
        // OUR OWN QR of the correct URL. The old card showed a URL that never
        // resolved, so a printed QR of it led nowhere.
        try {
          const qr = await get<{ qr_svg?: string | null }>(`/booking/pages/${first.booking_page_id}/qr-code`);
          setQrSvg(qr?.qr_svg ?? null);
        } catch { setQrSvg(null); }
      } else {
        setBookingPage(null);
        setDraft(defaultBookingPage());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  // ── Derived values ──────────────────────────────────────────────────────────
  // THE URL THE OWNER COPIES. From the API when there is a page (oliver-api
  // lib/bookingLinks.js, the ONE builder), else the path shape the page WILL have
  // once it is saved. Never the subdomain form, which has no DNS binding and has
  // never resolved for a client.
  const bookingUrl = useMemo(() => {
    if (bookingPage?.url) return bookingPage.url;
    if (!slugDraft) return null;
    const pageSlug = draft?.slug || "book";
    return `https://${BOOKING_HOST_SUFFIX}/${slugDraft}/${pageSlug}`;
  }, [bookingPage?.url, slugDraft, draft?.slug]);

  const slugChanged = (orgSettings?.slug || "") !== slugDraft;
  const bookingChanged = useMemo(() => {
    if (!bookingPage || !draft) return !!draft; // brand-new = always "changed"
    return JSON.stringify(bookingPage) !== JSON.stringify(draft);
  }, [bookingPage, draft]);
  const anyChanged = slugChanged || bookingChanged;

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true); setError(null); setToast(null);
    try {
      // 1) Save slug if changed
      if (slugChanged) {
        await patch("/settings", { slug: slugDraft });
      }

      // 2) Save booking page (create-or-update)
      const body = {
        slug: draft.slug || "book",
        title: draft.title,
        description: draft.description,
        job_category: draft.job_category,
        job_type: draft.job_type || draft.job_category,
        duration_minutes: draft.duration_minutes,
        buffer_minutes: draft.buffer_minutes,
        advance_notice_hours: draft.advance_notice_hours,
        max_days_ahead: draft.max_days_ahead,
        availability_windows: draft.availability_windows,
        // ── OLIVER pack 1 ────────────────────────────────────────────────────
        // This line was `form_fields: []`. The column has existed since
        // migration 054 and this editor overwrote it with an empty array on
        // EVERY save, so the owner's own questions were unreachable from both
        // ends: unwritable here and unrendered on the booking page.
        form_fields: draft.form_fields ?? [],
        // Which of the business's services the page sells. services_json has
        // been read by the public API since F-48 and never written by this page.
        services: draft.services ?? [],
        // The business's clock (null = follow the location), where the hours come
        // from, and whether the guest is asked where the work is.
        timezone: draft.timezone ?? null,
        hours_source: draft.hours_source ?? "inherit",
        collect_service_address: !!draft.collect_service_address,
        confirmation_message: draft.confirmation_message,
        require_confirmation: draft.require_confirmation,
        is_active: draft.is_active,
        capacity_mode: draft.capacity_mode,
        capacity_count: draft.capacity_mode === "fixed" ? (draft.capacity_count || 1) : null,
        show_price_to_new_customer: draft.show_price_to_new_customer,
        show_price_to_returning_customer: draft.show_price_to_returning_customer,
      };
      if (bookingPage) {
        await patch(`/booking/pages/${bookingPage.booking_page_id}`, body);
      } else {
        await post(`/booking/pages`, body);
      }

      setToast("Saved. Your booking page is live.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, slugChanged, slugDraft, bookingPage, patch, post, load]);

  // ── Subfield helpers ────────────────────────────────────────────────────────
  function setDraftField<K extends keyof BookingPage>(key: K, value: BookingPage[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  // EDITING THE HOURS HERE IS WHAT "OVERRIDE" MEANS.
  //
  // ONE HOME for the hours: the owner types them once in Settings and this page
  // inherits them. Touching a day or a time on THIS page is the deliberate act of
  // narrowing them, so it flips hours_source to 'override' — nothing is copied
  // behind the owner's back, and nothing drifts silently the way two independent
  // stores did.
  function setWindow(day: number, key: "start_time" | "end_time", value: string) {
    setDraft((d) => {
      if (!d) return d;
      const windows = (d.availability_windows as AvailabilityWindow[]).map((w) =>
        w.day_of_week === day ? { ...w, [key]: value } : w
      );
      return { ...d, availability_windows: windows, hours_source: "override" };
    });
  }

  function toggleDay(day: number, on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const windows = (d.availability_windows as AvailabilityWindow[]).filter((w) => w.day_of_week !== day);
      if (on) windows.push({ day_of_week: day, start_time: "09:00", end_time: "17:00" });
      windows.sort((a, b) => a.day_of_week - b.day_of_week);
      return { ...d, availability_windows: windows, hours_source: "override" };
    });
  }

  /** Back to the hours the owner typed in Settings. The page stops carrying its
   *  own, so a later change in Settings reaches the booking page. */
  function useSettingsHours() {
    setDraft((d) => (d ? {
      ...d,
      hours_source: "inherit",
      availability_windows: (d.effective_availability_windows as AvailabilityWindow[]) ?? [],
    } : d));
  }

  function toggleService(offeringId: string, on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const cur = new Set(d.services ?? []);
      if (on) cur.add(offeringId); else cur.delete(offeringId);
      return { ...d, services: Array.from(cur) };
    });
  }

  function addQuestion() {
    setDraft((d) => (d ? {
      ...d,
      form_fields: [...(d.form_fields ?? []), { name: "", label: "", type: "text", required: false }],
    } : d));
  }

  function updateQuestion(i: number, patch: Partial<BookingFormField>) {
    setDraft((d) => {
      if (!d) return d;
      const fields = [...(d.form_fields ?? [])];
      fields[i] = { ...fields[i], ...patch };
      // The key is derived from the label so the owner never types one, and the
      // answers land on the job card under the words they actually asked.
      if (patch.label !== undefined) {
        fields[i].name = patch.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
      }
      return { ...d, form_fields: fields };
    });
  }

  function removeQuestion(i: number) {
    setDraft((d) => (d ? { ...d, form_fields: (d.form_fields ?? []).filter((_, j) => j !== i) } : d));
  }

  function copyUrl() {
    if (!bookingUrl) return;
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <OliverPageWrapper
      title="Booking"
      subtitle="Your public scheduling page — branded to you, served by OLIVER."
      error={error}
      loading={loading}
    >
      {toast && (
        <div className="mb-4 rounded-md border-2 border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {toast}
        </div>
      )}

      {/* ─── Section: Your booking link ─────────────────────────────────────── */}
      <SectionCard
        icon={<Link2 className="h-4 w-4" />}
        title="Your booking link"
        subtitle="Share this URL anywhere. Customers don't need an account to book."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Subdomain
            </label>
            <div className="flex rounded-md border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-amber-300">
              <input
                type="text"
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
                placeholder="your-business"
                maxLength={63}
              />
              <div className="flex items-center px-3 bg-slate-50 border-l border-slate-300 text-sm text-slate-600">
                {BOOKING_HOST_SUFFIX}/…
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Lowercase letters, numbers, hyphens. This is your business's name in every
              OLIVER address: your booking page, your customer portal and your team portal.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={copyUrl}
              disabled={!bookingUrl}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={bookingUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </div>
        </div>

        {bookingUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px] rounded-md bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700 break-all">
              {bookingUrl}
            </div>
            {/* OUR OWN QR, not a vendor's image URL. This route used to return
                api.qrserver.com — a third party on a client-facing asset, against
                the standing no-third-party rule — and a QR of an address that
                never resolved. */}
            {qrSvg && (
              <div className="flex flex-col items-center gap-1">
                <div
                  className="h-24 w-24 [&>svg]:h-full [&>svg]:w-full"
                  aria-label="QR code for your booking page"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Scan to book</span>
              </div>
            )}
          </div>
        )}

        {/* "How to use it" cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <HowToCard
            title="Add to your website"
            body="Link any 'Book a call' button on your site to your booking URL. Opens in a new tab."
          />
          <HowToCard
            title="IA Booking Widget"
            body="One-click embed for ARION-hosted sites — adds a popup booking widget via the IA WordPress plugin."
            tag="Coming soon"
          />
          <HowToCard
            title="Direct share"
            body="Drop your URL into email signatures, SMS, social bios, Google Business Profile, or printed QR codes."
          />
        </div>
      </SectionCard>

      {/* ─── Section: What you're booking ───────────────────────────────────── */}
      <SectionCard
        icon={<CalendarIcon className="h-4 w-4" />}
        title="What you're booking"
        subtitle="Title + duration shown to the customer."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <input
              type="text"
              value={draft?.title || ""}
              onChange={(e) => setDraftField("title", e.target.value)}
              className={inputCls}
              placeholder="Book a discovery call"
            />
          </Field>
          <Field label="Service category">
            <select
              value={draft?.job_category || "project"}
              onChange={(e) => setDraftField("job_category", e.target.value)}
              className={inputCls}
            >
              {JOB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Duration">
            <select
              value={draft?.duration_minutes || 30}
              onChange={(e) => setDraftField("duration_minutes", Number(e.target.value))}
              className={inputCls}
            >
              {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </Field>
          <Field label="Buffer between bookings">
            <select
              value={draft?.buffer_minutes ?? 15}
              onChange={(e) => setDraftField("buffer_minutes", Number(e.target.value))}
              className={inputCls}
            >
              {BUFFER_OPTIONS.map((d) => <option key={d} value={d}>{d === 0 ? "None" : `${d} minutes`}</option>)}
            </select>
          </Field>
          {/* F-47 — Slot capacity. Auto = one attendee per slot with
              concurrency driven by active worker count (default, matches
              legacy behaviour). Fixed = tenant picks N attendees per slot
              (e.g. 3 bookings per hour). Group = unlimited attendees per
              slot (webinar/open-house). */}
          <Field label="Slot capacity">
            <select
              value={draft?.capacity_mode || "auto"}
              onChange={(e) => {
                const mode = e.target.value as "auto" | "fixed" | "group";
                setDraft((d) => d ? {
                  ...d,
                  capacity_mode: mode,
                  capacity_count: mode === "fixed" ? (d.capacity_count || 3) : null,
                } : d);
              }}
              className={inputCls}
            >
              {/* Was "Auto — based on worker availability" and, until OLIVER pack 1,
                  a straight lie: the public slots reader never looked at a worker.
                  It does now — the active crew count — so the label can say what it
                  actually means. */}
              <option value="auto">One job per crew member on shift</option>
              <option value="fixed">Fixed — set attendees per slot</option>
              <option value="group">Group — unlimited attendees per slot</option>
            </select>
          </Field>
          {draft?.capacity_mode === "fixed" && (
            <Field label="Attendees per slot">
              <input
                type="number"
                min={1}
                max={999}
                value={draft?.capacity_count ?? 1}
                onChange={(e) => setDraftField(
                  "capacity_count",
                  Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                )}
                className={inputCls}
              />
            </Field>
          )}
        </div>

        <Field label="Description (optional)">
          <textarea
            rows={2}
            value={draft?.description || ""}
            onChange={(e) => setDraftField("description", e.target.value)}
            className={inputCls}
            placeholder="Shown under the title on your booking page."
          />
        </Field>

        <Field label="Confirmation message (optional)">
          <textarea
            rows={2}
            value={draft?.confirmation_message || ""}
            onChange={(e) => setDraftField("confirmation_message", e.target.value)}
            className={inputCls}
            placeholder="Custom thank-you shown after booking. Defaults to a generic confirmation."
          />
        </Field>

        {/* Which services are on the page (OLIVER pack 1).
            services_json has been read by the public booking API since F-48 and
            was never writable here, so a page selling more than one thing could
            only be built by hand against the API. Each service brings its own
            duration and its own price to the booking page. */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <div className="flex items-baseline justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Services customers can pick
            </label>
            <span className="text-xs text-slate-500">
              {(draft?.services?.length ?? 0)} selected
            </span>
          </div>
          {offerings.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No services in your catalog yet. Add one in Service Catalog and it will appear here.
              Until then the page books one generic appointment at the length above.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Tick the ones customers should be able to choose. Each brings its own length and
                price. Leave them all unticked to book one generic appointment.
              </p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {offerings.map((o) => {
                  const on = (draft?.services ?? []).includes(o.offering_id);
                  return (
                    <label key={o.offering_id} className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-2">
                      <input type="checkbox" checked={on} className="mt-0.5 h-4 w-4"
                             onChange={(e) => toggleService(o.offering_id, e.target.checked)} />
                      <span className="text-sm">
                        <span className="font-medium">{o.name}</span>
                        {o.default_duration_minutes ? (
                          <span className="block text-xs text-slate-500">{o.default_duration_minutes} min</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Do we ask where the work is (OLIVER pack 1).
            Before this the public form collected first/last/email/phone and
            nothing else, so every booked job had NO address — and the crew app
            renders its address and its map link off exactly that column. Blank,
            for precisely the jobs where nobody had spoken to the customer and
            could ask. */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={draft?.collect_service_address ?? false}
              onChange={(e) => setDraftField("collect_service_address", e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Ask customers for the address</span>
              <span className="block text-xs text-slate-500">
                On for work you travel to — the address and any access notes land on the job, and
                your crew gets a map link. Off for phone or video calls, where asking is intrusive.
              </span>
            </span>
          </label>
        </div>
      </SectionCard>

      {/* Extra questions (OLIVER pack 1) */}
      <SectionCard
        icon={<CalendarIcon className="h-4 w-4" />}
        title="Anything else you need to know?"
        subtitle="Extra questions on your booking form. Answers appear on the job your crew sees."
      >
        {(draft?.form_fields ?? []).length === 0 && (
          <p className="text-xs text-slate-500">
            Nothing extra yet. Common ones: gate code, is there a dog in the yard, which unit,
            where should we park.
          </p>
        )}
        <div className="space-y-3">
          {(draft?.form_fields ?? []).map((f, i) => (
            <div key={i} className="rounded-md border border-slate-200 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Question
                  </label>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => updateQuestion(i, { label: e.target.value })}
                    className={inputCls}
                    placeholder="Is there a gate code?"
                    maxLength={120}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Answer type
                  </label>
                  <select
                    value={f.type}
                    onChange={(e) => updateQuestion(i, { type: e.target.value as BookingFormField["type"] })}
                    className={inputCls}
                  >
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                    <option value="tel">Phone number</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                    <option value="checkbox">Yes / no</option>
                    <option value="select">Pick from a list</option>
                  </select>
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={!!f.required} className="h-4 w-4"
                           onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                    Required
                  </label>
                  <button type="button" onClick={() => removeQuestion(i)}
                          className="text-xs text-red-700 underline hover:text-red-900">
                    Remove
                  </button>
                </div>
              </div>
              {f.type === "select" && (
                <div className="mt-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Choices (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={(f.options ?? []).join("\n")}
                    onChange={(e) => updateQuestion(i, {
                      options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean),
                    })}
                    className={inputCls}
                    placeholder={"Front door\nSide gate\nBack alley"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addQuestion}
                className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
          + Add a question
        </button>
      </SectionCard>

      {/* ─── Section: Price visibility (F-52) ───────────────────────────────── */}
      <SectionCard
        icon={<Globe className="h-4 w-4" />}
        title="Show the price on the booking page?"
        subtitle="We check the visitor's email or phone against your customer list to tell prospects apart from repeat customers."
      >
        <div className="space-y-2">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={draft?.show_price_to_new_customer ?? true}
              onChange={(e) => setDraftField("show_price_to_new_customer", e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Show the price to new visitors</span>
              <span className="block text-xs text-slate-500">
                Prospects haven't seen your pricing yet; showing it helps them decide.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={draft?.show_price_to_returning_customer ?? false}
              onChange={(e) => setDraftField("show_price_to_returning_customer", e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Show the price to returning customers</span>
              <span className="block text-xs text-slate-500">
                Off by default — repeat customers already know what they pay, so the confirmation stays focused on the appointment.
              </span>
            </span>
          </label>
        </div>
      </SectionCard>

      {/* ─── Section: When you're available ─────────────────────────────────── */}
      <SectionCard
        icon={<CalendarIcon className="h-4 w-4" />}
        title="When you're available"
        subtitle="Your opening hours come from your business profile. Narrow them here only if this booking page should be tighter."
      >
        {/* THE BUSINESS'S CLOCK.
            Until OLIVER pack 1 the slot engine read "08:00" as 08:00 UTC, so a
            Central-time business that set 8-to-5 offered a customer appointments
            from 3am to noon. The zone lives on the business's location; this is
            the per-page override for the rare page that sells into another one. */}
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Time zone these hours are in
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="text"
              list="oliver-booking-timezones"
              value={draft?.timezone ?? ""}
              onChange={(e) => setDraftField("timezone", e.target.value.trim() || null)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={bookingPage?.effective_timezone || "America/Chicago"}
            />
            <datalist id="oliver-booking-timezones">
              {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
            </datalist>
            {!draft?.timezone && (
              <span className="text-xs text-slate-600">
                Using <strong>{bookingPage?.effective_timezone || "America/Chicago"}</strong> — your
                location's time zone. Change it under Locations and every product follows.
              </span>
            )}
            {draft?.timezone && (
              <button type="button" onClick={() => setDraftField("timezone", null)}
                      className="text-xs underline text-slate-600 hover:text-slate-900">
                Use my location's time zone instead
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Customers always see these times in your time zone, with the zone named — so somebody
            booking from another state cannot misread 2pm.
          </p>
        </div>

        {/* ONE HOME FOR THE HOURS. Inheriting is the default; editing a day below
            is the deliberate act of overriding. */}
        {(draft?.hours_source ?? "inherit") === "inherit" ? (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            These are your opening hours from <a href="/app/settings" className="underline">your business profile</a> —
            change them there and this page follows. Editing a day below makes this page keep its own,
            narrower hours instead.
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              This booking page has its OWN hours. Changes to your business profile won't reach it.
            </span>
            <button type="button" onClick={useSettingsHours}
                    className="underline font-semibold hover:text-amber-950">
              Go back to my business hours
            </button>
          </div>
        )}

        <div className="space-y-2">
          {Array.from({ length: 7 }, (_, day) => {
            // While inheriting, show what is ACTUALLY IN FORCE (the API computes
            // it) rather than this page's empty list — an owner looking at seven
            // "Closed" rows under "your hours come from your profile" would
            // reasonably conclude the page was broken.
            const shown = (draft?.hours_source ?? "inherit") === "inherit"
              ? ((bookingPage?.effective_availability_windows as AvailabilityWindow[]) ?? [])
              : ((draft?.availability_windows as AvailabilityWindow[]) ?? []);
            const window = shown.find((w) => w.day_of_week === day);
            const enabled = !!window;
            return (
              <div key={day} className="flex items-center gap-3 py-1">
                <label className="flex items-center gap-2 w-24">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleDay(day, e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                </label>
                {enabled ? (
                  <>
                    <input
                      type="time"
                      value={window!.start_time}
                      onChange={(e) => setWindow(day, "start_time", e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <span className="text-slate-400">→</span>
                    <input
                      type="time"
                      value={window!.end_time}
                      onChange={(e) => setWindow(day, "end_time", e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Closed</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 pt-4 border-t border-slate-200">
          <Field label="Minimum advance notice">
            <select
              value={draft?.advance_notice_hours ?? 24}
              onChange={(e) => setDraftField("advance_notice_hours", Number(e.target.value))}
              className={inputCls}
            >
              {[0, 1, 2, 4, 8, 12, 24, 48, 72].map((h) =>
                <option key={h} value={h}>{h === 0 ? "Anytime" : `${h} ${h === 1 ? "hour" : "hours"}`}</option>
              )}
            </select>
          </Field>
          <Field label="How far ahead can people book?">
            <select
              value={draft?.max_days_ahead ?? 60}
              onChange={(e) => setDraftField("max_days_ahead", Number(e.target.value))}
              className={inputCls}
            >
              {[7, 14, 30, 60, 90, 180, 365].map((d) =>
                <option key={d} value={d}>{d} days</option>
              )}
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* ─── Section: Branding ──────────────────────────────────────────────── */}
      <SectionCard
        icon={<Globe className="h-4 w-4" />}
        title="Branding"
        subtitle="Pulled automatically from your business profile."
      >
        <div className="flex items-center gap-4">
          {orgSettings?.logoUrl ? (
            <img src={orgSettings.logoUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 text-xl font-bold">
              {(orgSettings?.preferredBusinessName || orgSettings?.tenantFullName || "?")[0]}
            </div>
          )}
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-900">
              {orgSettings?.preferredBusinessName || orgSettings?.tenantFullName || "—"}
            </div>
            {orgSettings?.preferredBusinessName && orgSettings?.tenantFullName &&
              orgSettings.preferredBusinessName !== orgSettings.tenantFullName && (
                <div className="text-xs text-slate-500">Full: {orgSettings.tenantFullName}</div>
            )}
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="inline-block w-4 h-4 rounded border border-slate-300"
                    style={{ background: orgSettings?.brandColor || "#FEC82C" }} />
              <span className="font-mono text-slate-600">{orgSettings?.brandColor || "#FEC82C"}</span>
            </div>
          </div>
          <a
            href="/app/settings"
            className="text-sm text-amber-700 underline hover:text-amber-900 whitespace-nowrap"
          >
            Edit business profile →
          </a>
        </div>
      </SectionCard>

      {/* ─── Section: Calendar sync (Microsoft 365 + Google) ──────────────── */}
      <CalendarSyncCard api={calendarApi} />

      {/* ─── Section: Preview ───────────────────────────────────────────────── */}
      {bookingUrl && bookingPage && (
        <SectionCard
          icon={<ExternalLink className="h-4 w-4" />}
          title="Live preview"
          subtitle="This is exactly what your customers will see."
        >
          <div className="rounded-md overflow-hidden border-2 border-slate-200 bg-white">
            <iframe
              src={bookingUrl}
              title="Booking preview"
              className="w-full"
              style={{ height: 600, border: 0 }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            If the preview is blank, your subdomain may still be provisioning (~1-2 minutes after first save).
          </p>
        </SectionCard>
      )}

      {/* ─── Save bar ───────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-white border-t border-slate-200 mt-6">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {anyChanged ? "Unsaved changes" : bookingPage ? "All changes saved" : "Set up your booking page below"}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !anyChanged}
            className="rounded-md bg-slate-900 text-white px-5 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
          >
            {saving ? "Saving…" : bookingPage ? "Save changes" : "Publish booking page"}
          </button>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers — kept local to avoid polluting the shared ui module
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function SectionCard({
  icon, title, subtitle, children,
}: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-2">
        <div className="rounded-md bg-amber-100 text-amber-700 p-1.5 mt-0.5">{icon}</div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function HowToCard({ title, body, tag }: { title: string; body: string; tag?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</h4>
        {tag && <span className="text-[10px] uppercase font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">{tag}</span>}
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}

function defaultBookingPage(): BookingPage {
  return {
    booking_page_id: "",
    slug: "book",
    // OLIVER is field service. "Book a call" / "project" / "discovery_call" were
    // the founder's OWN booking page written in as everybody's default, so a
    // plumber's first booking page called itself a discovery call and did not ask
    // where the work was. lib/seedBookingPage.js on the API side names the page
    // after the business's own first service; this is the manual-create fallback.
    title: "Book an Appointment",
    description: null,
    job_category: "field_service",
    job_type: "appointment",
    duration_minutes: 60,
    buffer_minutes: 15,
    advance_notice_hours: 24,
    max_days_ahead: 60,
    // EMPTY, and hours_source 'inherit'. A brand-new page takes the hours the
    // owner already typed in their business profile rather than inventing a
    // Mon-Fri 9-5 that then drifts away from it — the two-store problem this pack
    // closes. The grid below renders the inherited hours so it never looks empty.
    availability_windows: [],
    hours_source: "inherit",
    timezone: null,
    // ON by default: OLIVER exists for work you travel to, and a job with no
    // address is a crew with no map link.
    collect_service_address: true,
    form_fields: [],
    services: [],
    confirmation_message: null,
    brand_color: null,
    logo_url: null,
    is_active: true,
    require_confirmation: true,
    // F-52 defaults mirror the SQL migration: show price to prospects who
    // still need it to decide; hide from returning customers who already
    // know what they pay.
    show_price_to_new_customer: true,
    show_price_to_returning_customer: false,
    capacity_mode: "auto",
    capacity_count: null,
  };
}
