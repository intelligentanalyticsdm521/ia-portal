// LocationPanel — the customer's PLACE: the page the crew reads before they
// drive there, and the page the office reads when a site disputes a line.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 point 2 —
// "Location page: name, service address, site contacts with roles, access notes
// and gate code, custom fields, files and measurements, jobs here, Notes,
// Activity" — and the Location artboard.
//
// It renders INSIDE the customer record rather than as its own route, the way
// JobDetailPanel does: a location only exists under a customer, the way back is
// one link, and a separate route would have needed its own header, its own
// customer lookup and its own answer to "what if this id is not yours".
//
// ── WHAT IS NOT HERE, AND WHY ─────────────────────────────────────────────
// "Files and measurements" is NOT built. There is no customer-or-location file
// store to put them in: the only blob path in the platform is the crew's
// proof-of-work photos, which hang off a JOB and are written by the employee
// app. Building one means a table, a container, a retention rule and an answer
// to "can a site contact see the site map?" — decisions, not code. Named in
// §12 and on the decisions queue rather than faked with a card that does
// nothing.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin, Pencil, Save, X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { RolesCard } from "./RolesCard";
import { NotesCard, type LocationRow } from "./CustomerCards";
import {
  type PersonRole, type BillingProfile, type CustomFieldValue,
  formatLocationAddress, personName, siteContactFor, visibleOn,
} from "../../lib/customerModel";

const cardCls = "rounded-lg border border-slate-200 bg-white p-4";
const titleCls = "text-[13px] font-semibold text-slate-900";
const subCls = "text-[11px] text-slate-500";
const labelCls = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const inputCls = "w-full rounded border border-slate-300 px-2 py-1.5 text-[13px]";
const btnCls = "inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export interface LocationJob {
  job_id: string;
  job_number?: string | null;
  title?: string | null;
  status: string;
  scheduled_start?: string | null;
}

export interface LocationPanelProps {
  customerKind: "company" | "person";
  customerId: string;
  customerName: string;
  locationId: string;
  /** The row from the customer's locations list — already loaded by the page. */
  location: LocationRow | null;
  /** The customer's roles, so the site contact can be named without a fetch. */
  roles: readonly PersonRole[];
  /** Jobs at this location, filtered by the page that owns the activity. */
  jobs: readonly LocationJob[];
  /** The customer's own billing profile, to say what "bills to the customer" means. */
  customerProfile: BillingProfile | null;
  accent?: string;
  onBack: () => void;
  onChanged: () => void;
  onOpenJob?: (jobId: string) => void;
}

export function LocationPanel({
  customerKind, customerId, customerName, locationId, location, roles, jobs,
  customerProfile, accent = "#2D9CDB", onBack, onChanged, onOpenJob,
}: LocationPanelProps) {
  const { get, patch, put, del, ready } = useSparkApi();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", address_line1: "", city: "", state: "", postal_code: "",
    access_notes: "", gate_code: "", tax_rate: "",
  });

  // ── custom fields, and their values ──────────────────────────────────────
  const [fields, setFields] = useState<CustomFieldValue[]>([]);
  const [fieldDraft, setFieldDraft] = useState<Record<string, string>>({});
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [fieldsSaving, setFieldsSaving] = useState(false);

  const loadFields = useCallback(async () => {
    if (!ready || !locationId) return;
    try {
      // `property` is the word the UI and the spec use; the API normalises it
      // to `location` at the door (§8.5), so both spellings reach one bucket.
      const r = await get<{ data: CustomFieldValue[] }>(`/api/v1/custom-fields/values/property/${locationId}`);
      const rows = r.data || [];
      setFields(rows);
      const draft: Record<string, string> = {};
      for (const f of rows) draft[f.field_key] = f.value_text ?? "";
      setFieldDraft(draft);
      setFieldsDirty(false);
    } catch { setFields([]); }
  }, [get, ready, locationId]);
  useEffect(() => { loadFields(); }, [loadFields]);

  // Only the fields whose show_on says "location_card". Granted on PRESENCE:
  // a field nobody ticked shows nowhere, so "Internal margin note" cannot land
  // on the page the crew reads by somebody forgetting a checkbox.
  const shownFields = useMemo(() => visibleOn(fields, "location_card"), [fields]);

  async function saveFields() {
    setFieldsSaving(true); setErr(null);
    try {
      await put(`/api/v1/custom-fields/values/property/${locationId}`, { values: fieldDraft });
      await loadFields();
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setFieldsSaving(false); }
  }

  // ── the site's own billing profile ───────────────────────────────────────
  const [ownProfile, setOwnProfile] = useState<BillingProfile | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const loadOwnProfile = useCallback(async () => {
    if (!ready || !locationId) return;
    try {
      const r = await get<{ data: BillingProfile | null }>(`/api/v1/locations/${locationId}/billing-profile`);
      setOwnProfile(r.data || null);
    } catch { setOwnProfile(null); }
  }, [get, ready, locationId]);
  useEffect(() => { loadOwnProfile(); }, [loadOwnProfile]);

  /**
   * "This location pays for itself" on and off.
   *
   * §7 point 4's lock: the change applies to FUTURE work only. Every job
   * already booked carries a bill-to resolved and snapshotted when it was
   * created, and nothing here touches those — which is why the sentence under
   * the toggle says so rather than leaving the user to wonder.
   */
  async function toggleOwnBilling(next: boolean) {
    setProfileBusy(true); setErr(null);
    try {
      if (next) {
        await put(`/api/v1/locations/${locationId}/billing-profile`, {
          address_line1: location?.address_line1 ?? null,
          city: location?.city ?? null,
          state: location?.state ?? null,
          postal_code: location?.postal_code ?? null,
          payment_terms_days: customerProfile?.payment_terms_days ?? null,
        });
      } else {
        await del(`/api/v1/locations/${locationId}/billing-profile`);
      }
      await loadOwnProfile();
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setProfileBusy(false); }
  }

  function startEdit() {
    setForm({
      name: location?.name || "",
      address_line1: location?.address_line1 || "",
      city: location?.city || "",
      state: location?.state || "",
      postal_code: location?.postal_code || "",
      access_notes: location?.access_notes || "",
      gate_code: location?.gate_code || "",
      tax_rate: location?.tax_rate != null ? String(location.tax_rate) : "",
    });
    setErr(null);
    setEditing(true);
  }

  async function saveLocation() {
    setSaving(true); setErr(null);
    try {
      const rate = form.tax_rate.trim();
      if (rate && !Number.isFinite(Number(rate))) throw new Error("Tax rate must be a percent, like 7 or 7.25.");
      await patch(`/api/v1/locations/${locationId}`, {
        name: form.name.trim(),
        address_line1: form.address_line1.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        access_notes: form.access_notes.trim() || null,
        gate_code: form.gate_code.trim() || null,
        tax_rate: rate ? Number(rate) : null,
      });
      setEditing(false);
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const siteContact = siteContactFor(roles, locationId);
  const paysForItself = !!ownProfile;

  return (
    <div data-testid="location-panel">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[#1A7DB5] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All locations for {customerName}
      </button>

      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-[#0C4A60]" />
        <span className="text-[15px] font-semibold text-slate-900">{location?.name || "Location"}</span>
        <span className="text-[12px] text-slate-500">{formatLocationAddress(location) || "No address yet"}</span>
        {location?.is_default && <span className="rounded-full bg-[#E8F4FB] px-2 py-px text-[10px] font-semibold text-[#0C4A60]">Default</span>}
      </div>

      {err && <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{err}</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── Property details ── */}
        <div className={cardCls}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleCls}>Property details</div>
              <div className={subCls}>Standard fields first, then the fields this business added. The crew sees these on the job.</div>
            </div>
            {!editing && <button type="button" className={btnCls} onClick={startEdit}><Pencil className="h-3.5 w-3.5" /> Edit</button>}
          </div>

          {editing ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="text-xs"><div className={labelCls}>Name</div>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="text-xs"><div className={labelCls}>Service address</div>
                <input className={inputCls} value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></label>
              <label className="text-xs"><div className={labelCls}>City</div>
                <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs"><div className={labelCls}>State</div>
                  <input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
                <label className="text-xs"><div className={labelCls}>ZIP</div>
                  <input className={inputCls} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></label>
              </div>
              <label className="text-xs md:col-span-2"><div className={labelCls}>Access notes</div>
                <input className={inputCls} value={form.access_notes} onChange={(e) => setForm({ ...form, access_notes: e.target.value })} placeholder="Enter from Oralabor; loading dock behind the gym." /></label>
              <label className="text-xs"><div className={labelCls}>Gate code</div>
                <input className={inputCls} value={form.gate_code} onChange={(e) => setForm({ ...form, gate_code: e.target.value })} placeholder="#4471" /></label>
              <label className="text-xs"><div className={labelCls}>Sales tax at this site (%)</div>
                <input className={inputCls} value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} placeholder="7" />
                <p className="mt-0.5 text-[11px] text-slate-500">Leave blank to use the invoice's own rate. 0 means this site is exempt.</p>
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" className={btnCls} onClick={() => setEditing(false)} disabled={saving}><X className="h-3.5 w-3.5" /> Cancel</button>
                <button type="button" onClick={saveLocation} disabled={saving || !form.name.trim()} style={{ background: accent }}
                  data-testid="location-save"
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Kv label="Service address" value={formatLocationAddress(location)} empty="Not set" />
              <Kv label="Site contact" value={siteContact ? `${personName(siteContact)}${siteContact.phone ? ` · ${siteContact.phone}` : ""}` : ""} empty="Nobody set — updates go to the customer" />
              <Kv label="Access notes" value={location?.access_notes || ""} empty="None" />
              <Kv label="Gate code" value={location?.gate_code ? `${location.gate_code} · crew only` : ""} empty="None" />
              <Kv label="Sales tax here" value={location?.tax_rate != null ? `${location.tax_rate}%` : ""} empty="Uses the invoice's rate" />
              <Kv label="Bills to" value={paysForItself ? "This location (own invoice)" : `${customerName} (customer billing)`} empty="" />
            </div>
          )}

          {/* ── custom fields ── */}
          <div className="mt-4 flex items-center justify-between">
            <span className={labelCls}>Custom fields</span>
            <a href="/app/services/spark_custom_fields" className="text-[11px] text-[#0C4A60] underline">manage fields in Settings</a>
          </div>
          {shownFields.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-500">
              None yet. Settings → Custom fields → Properties adds the ones your crews actually need — trigger depth,
              plowing areas, snow storage — and ticking “Location card” is what puts them here.
            </p>
          ) : (
            <>
              <div className="mt-2 grid gap-2 md:grid-cols-3" data-testid="location-custom-fields">
                {shownFields.map((f) => (
                  <label key={f.field_key} className="flex flex-col gap-1 rounded-md border border-dashed border-[#A8CDD8] bg-[#FBFDFF] px-2.5 py-2">
                    <span className={labelCls}>{f.label}{f.required ? " *" : ""}</span>
                    {f.field_type === "enum" ? (
                      <select
                        data-testid={`cf-${f.field_key}`}
                        className="bg-transparent text-[12px] outline-none"
                        value={fieldDraft[f.field_key] ?? ""}
                        onChange={(e) => { setFieldDraft({ ...fieldDraft, [f.field_key]: e.target.value }); setFieldsDirty(true); }}
                      >
                        <option value="">—</option>
                        {parseOptions(f.enum_options).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        data-testid={`cf-${f.field_key}`}
                        className="bg-transparent text-[12px] outline-none"
                        type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                        value={fieldDraft[f.field_key] ?? ""}
                        onChange={(e) => { setFieldDraft({ ...fieldDraft, [f.field_key]: e.target.value }); setFieldsDirty(true); }}
                        placeholder={f.help_text || "—"}
                      />
                    )}
                    {f.help_text && <span className="text-[10px] text-slate-400">{f.help_text}</span>}
                  </label>
                ))}
              </div>
              {fieldsDirty && (
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={saveFields} disabled={fieldsSaving} style={{ background: accent }}
                    data-testid="custom-fields-save"
                    className="rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {fieldsSaving ? "Saving…" : "Save fields"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── people here + billing ── */}
        <div className="flex flex-col gap-3">
          <RolesCard
            customerKind={customerKind}
            customerId={customerId}
            locations={location ? [location] : []}
            scopeLocationId={locationId}
            title="People at this location"
            subtitle="Job updates go to them. Invoices still go to the billing contact."
            accent={accent}
            onChanged={onChanged}
          />

          <div className={cardCls} data-testid="location-billing">
            <div className={titleCls}>Billing for this location</div>
            <div className={subCls}>
              By default a location bills to its customer. Turn this on when the site pays for itself —
              its own invoice, its own terms, its own card.
            </div>
            <label className="mt-3 flex items-start gap-2 text-[12px] text-slate-800">
              <input
                type="checkbox"
                data-testid="own-billing-toggle"
                checked={paysForItself}
                disabled={profileBusy}
                onChange={(e) => toggleOwnBilling(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                This location has its own billing profile
                <span className="block text-[11px] text-slate-500">
                  {paysForItself
                    ? `Its invoices bill to this site${ownProfile?.payment_terms_days ? `, Net ${ownProfile.payment_terms_days}` : ""}. Work already booked keeps the bill-to it was booked with.`
                    : `Its invoices bill to ${customerName}. Turning this on changes FUTURE work only — issued invoices keep theirs.`}
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* ── jobs here ── */}
        <div className={cardCls} data-testid="location-jobs">
          <div className={titleCls}>Jobs at this location</div>
          <div className={subCls}>
            {jobs.length === 0 ? "Nothing booked here yet." : `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`}
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            {jobs.length === 0 && (
              <div className="py-3 text-xs text-slate-500">
                A job booked at this address will show here, with its status and what it was worth.
              </div>
            )}
            {jobs.slice(0, 8).map((j) => (
              <button
                key={j.job_id}
                type="button"
                disabled={!onOpenJob}
                onClick={() => onOpenJob?.(j.job_id)}
                className="flex w-full items-center gap-3 py-2 text-left disabled:cursor-default"
              >
                <span className="w-20 flex-shrink-0 text-[11px] text-slate-500">
                  {j.scheduled_start ? new Date(j.scheduled_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-900">
                  {j.title || j.job_number || j.job_id.slice(0, 8)}
                </span>
                <span className="rounded-full bg-[#E8F4FB] px-2 py-px text-[10px] font-semibold capitalize text-[#0C4A60]">{j.status}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── notes for THIS location ── */}
        <NotesCard
          path={`/api/v1/locations/${locationId}/notes`}
          title="Notes · this location"
          subtitle="Location notes stay here; company notes stay on the company."
          accent={accent}
          emptyText="Nothing yet. Gate codes that changed, where the salt goes, which door the crew uses."
        />
      </div>
    </div>
  );
}

function Kv({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={labelCls}>{label}</span>
      <span className={`text-[12px] ${value ? "text-slate-800" : "text-slate-400"}`}>{value || empty}</span>
    </div>
  );
}

function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

export default LocationPanel;
