/**
 * OliverBookingPage — `OLIVER > Customers > Booking`
 *
 * Single config page where tenants configure their public booking
 * experience. The actual booking page LAYOUT is hardcoded in the
 * oliver-ops SWA (`{slug}.book.ia-dm.com`). This portal page only
 * controls the data behind it: subdomain + what's being booked +
 * availability + (read-only) branding pulled from the business profile.
 *
 * One settings row per tenant for Standard tier. The DB schema supports
 * multiple booking pages — that's the Pro tier upgrade. Standard
 * tenants get a dead-simple single-page UX.
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
  form_fields: unknown;
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
}

interface AvailabilityWindow {
  day_of_week: number;   // 0=Sun … 6=Sat
  start_time: string;    // "09:00"
  end_time: string;      // "17:00"
}

// Hostname pattern lives here. If we ever move to path-based tenant
// resolution, this is the single place that changes.
const BOOKING_HOST_SUFFIX = "book.ia-dm.com";

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

      // List booking pages — we pick the first (Standard tier = one).
      // If none exist, leave bookingPage null and present a "Start" form.
      const pagesRes = await get<{ data?: BookingPage[] } | BookingPage[]>("/booking/pages");
      const pages = Array.isArray(pagesRes) ? pagesRes : ((pagesRes as any).data ?? []);
      const first = pages[0] || null;
      if (first) {
        const hydrated: BookingPage = {
          ...first,
          availability_windows: typeof first.availability_windows === "string"
            ? JSON.parse(first.availability_windows || "[]")
            : (first.availability_windows || []),
        };
        setBookingPage(hydrated);
        setDraft(hydrated);
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
  const bookingUrl = useMemo(() => {
    if (!slugDraft) return null;
    return `https://${slugDraft}.${BOOKING_HOST_SUFFIX}`;
  }, [slugDraft]);

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
        form_fields: [],
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

  function setWindow(day: number, key: "start_time" | "end_time", value: string) {
    setDraft((d) => {
      if (!d) return d;
      const windows = (d.availability_windows as AvailabilityWindow[]).map((w) =>
        w.day_of_week === day ? { ...w, [key]: value } : w
      );
      return { ...d, availability_windows: windows };
    });
  }

  function toggleDay(day: number, on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const windows = (d.availability_windows as AvailabilityWindow[]).filter((w) => w.day_of_week !== day);
      if (on) windows.push({ day_of_week: day, start_time: "09:00", end_time: "17:00" });
      windows.sort((a, b) => a.day_of_week - b.day_of_week);
      return { ...d, availability_windows: windows };
    });
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
                .{BOOKING_HOST_SUFFIX}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Lowercase letters, numbers, hyphens. Drives your booking, customer portal,
              and team portal subdomains.
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
          <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700">
            {bookingUrl}
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
              <option value="auto">Auto — based on worker availability</option>
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
        subtitle="Weekly schedule. Customers can book any open slot within these windows."
      >
        <div className="space-y-2">
          {Array.from({ length: 7 }, (_, day) => {
            const window = (draft?.availability_windows as AvailabilityWindow[] || []).find((w) => w.day_of_week === day);
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
    title: "Book a call",
    description: null,
    job_category: "project",
    job_type: "discovery_call",
    duration_minutes: 30,
    buffer_minutes: 15,
    advance_notice_hours: 24,
    max_days_ahead: 60,
    availability_windows: [
      { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 2, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 3, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 4, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 5, start_time: "09:00", end_time: "17:00" },
    ],
    form_fields: [],
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
