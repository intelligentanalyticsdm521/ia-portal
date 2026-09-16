// CustomerCards — Billing, Locations, Notes and Activity, once.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 point 2 and
// the Company artboard: "cards Billing (address, terms, PO, billing contact),
// Contacts (people with roles → contact modal), Locations (name, address, site
// contact, jobs count → location page), Notes, Activity".
//
// SPARK's Companies page and OLIVER's customer record show THE SAME five cards
// about the same customer. Two implementations would be two answers to "does
// this location pay for itself?" the first time one of them was fixed — the
// same reason the mixed list is one query. RolesCard is the fifth and lives in
// its own file because the location page uses it on its own.
//
// Everything here reads LUMEN through useSparkApi: customers, locations,
// billing profiles, roles and notes are LUMEN's, on both products' screens.
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Pencil, Save, X, StickyNote, Activity as ActivityIcon } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import {
  type CustomerLocation, type PersonRole, type BillingProfile,
  formatLocationAddress, personName, siteContactFor,
} from "../../lib/customerModel";

const cardCls = "rounded-lg border border-slate-200 bg-white p-4";
const headCls = "flex items-start justify-between gap-3";
const titleCls = "text-[13px] font-semibold text-slate-900";
const subCls = "text-[11px] text-slate-500";
const btnCls = "inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const labelCls = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const inputCls = "w-full rounded border border-slate-300 px-2 py-1.5 text-[13px]";

/** A location as the locations list returns it, with its billing answer. */
export type LocationRow = CustomerLocation & {
  pays_for_itself?: boolean;
  own_payment_terms_days?: number | null;
  own_po_number?: string | null;
};

// ── Billing ────────────────────────────────────────────────────────────────

export function BillingCard({
  customerKind, customerId, people, accent = "#EF6C33", onChanged,
}: {
  customerKind: "company" | "person";
  customerId: string;
  /** The role rows, so the billing contact can be chosen from the people here. */
  people: readonly PersonRole[];
  accent?: string;
  onChanged?: () => void;
}) {
  const { get, put, ready } = useSparkApi();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    address_line1: "", address_line2: "", city: "", state: "", postal_code: "",
    payment_terms_days: "", po_number: "", billing_contact_id: "",
  });

  const base = `/api/v1/customers/${customerKind}/${customerId}/billing-profile`;

  const load = useCallback(async () => {
    if (!ready || !customerId) return;
    setLoading(true); setErr(null);
    try {
      const r = await get<{ data: BillingProfile | null }>(base);
      setProfile(r.data || null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready, base, customerId]);
  useEffect(() => { load(); }, [load]);

  function startEdit() {
    setForm({
      address_line1: profile?.address_line1 || "",
      address_line2: profile?.address_line2 || "",
      city: profile?.city || "",
      state: profile?.state || "",
      postal_code: profile?.postal_code || "",
      payment_terms_days: profile?.payment_terms_days != null ? String(profile.payment_terms_days) : "",
      po_number: profile?.po_number || "",
      billing_contact_id: profile?.billing_contact_id != null ? String(profile.billing_contact_id) : "",
    });
    setErr(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true); setErr(null);
    try {
      const terms = form.payment_terms_days.trim();
      if (terms && !Number.isFinite(Number(terms))) throw new Error("Payment terms must be a number of days.");
      await put(base, {
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        payment_terms_days: terms ? Number(terms) : null,
        po_number: form.po_number.trim() || null,
        billing_contact_id: form.billing_contact_id ? Number(form.billing_contact_id) : null,
      });
      setEditing(false);
      await load();
      onChanged?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const billingContact = useMemo(
    () => people.find((p) => p.person_contact_id === profile?.billing_contact_id) || null,
    [people, profile],
  );
  // Anybody with a role here can be the billing contact — one row per person.
  const candidates = useMemo(() => {
    const seen = new Map<number, PersonRole>();
    for (const p of people) if (!seen.has(p.person_contact_id)) seen.set(p.person_contact_id, p);
    return [...seen.values()];
  }, [people]);

  return (
    <div className={cardCls} data-testid="billing-card">
      <div className={headCls}>
        <div>
          <div className={titleCls}>Billing</div>
          <div className={subCls}>Who pays and where invoices go. Locations use this unless they pay for themselves.</div>
        </div>
        {!editing && <button type="button" className={btnCls} onClick={startEdit} disabled={loading}><Pencil className="h-3.5 w-3.5" /> Edit</button>}
      </div>

      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{err}</div>}

      {loading ? (
        <div className="py-4 text-xs text-slate-500">Loading…</div>
      ) : editing ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <label className="text-xs"><div className={labelCls}>Billing address</div>
            <input className={inputCls} value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="1200 SW Oralabor Rd" /></label>
          <label className="text-xs"><div className={labelCls}>Line 2</div>
            <input className={inputCls} value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} /></label>
          <label className="text-xs"><div className={labelCls}>City</div>
            <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs"><div className={labelCls}>State</div>
              <input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
            <label className="text-xs"><div className={labelCls}>ZIP</div>
              <input className={inputCls} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></label>
          </div>
          <label className="text-xs"><div className={labelCls}>Payment terms (days)</div>
            <input className={inputCls} value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} placeholder="30" /></label>
          <label className="text-xs"><div className={labelCls}>PO number</div>
            <input className={inputCls} value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="2026-SNOW-014" /></label>
          <label className="text-xs md:col-span-2"><div className={labelCls}>Billing contact</div>
            <select className={inputCls} value={form.billing_contact_id} onChange={(e) => setForm({ ...form, billing_contact_id: e.target.value })}>
              <option value="">Nobody set — invoices go to the customer</option>
              {candidates.map((p) => <option key={p.person_contact_id} value={p.person_contact_id}>{personName(p)}</option>)}
            </select>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {candidates.length === 0
                ? "Give somebody a role on this customer first, and they can be the billing contact."
                : "Money events go here. A site contact never sees the balance."}
            </p>
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button type="button" className={btnCls} onClick={() => setEditing(false)} disabled={saving}><X className="h-3.5 w-3.5" /> Cancel</button>
            <button type="button" onClick={save} disabled={saving} style={{ background: accent }}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Billing contact" value={billingContact ? `${personName(billingContact)}${billingContact.email ? ` · ${billingContact.email}` : ""}` : null}
            empty="Nobody set — invoices go to the customer" />
          <Field label="Billing address" value={formatLocationAddress(profile as unknown as CustomerLocation) || null} empty="Not set" />
          <Field label="Terms · PO"
            value={[profile?.payment_terms_days != null ? `Net ${profile.payment_terms_days}` : null,
                    profile?.po_number ? `PO ${profile.po_number}` : null].filter(Boolean).join(" · ") || null}
            empty="Not set" />
          <Field label="Stripe customer" value={profile?.stripe_customer_id || null} empty="Created on the first charge" />
        </div>
      )}
    </div>
  );
}

function Field({ label, value, empty }: { label: string; value: string | null; empty: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={labelCls}>{label}</span>
      <span className={`text-[12px] ${value ? "text-slate-800" : "text-slate-400"}`}>{value || empty}</span>
    </div>
  );
}

// ── Locations ──────────────────────────────────────────────────────────────

export function LocationsCard({
  customerKind, customerId, customerName, locations, roles, jobCounts,
  collapsedWhenSingle = false, accent = "#EF6C33", onOpenLocation, onChanged,
}: {
  customerKind: "company" | "person";
  customerId: string;
  customerName: string;
  locations: readonly LocationRow[];
  roles: readonly PersonRole[];
  /** location_id → jobs there, when the caller knows. Omitted is not zero. */
  jobCounts?: Record<string, number>;
  /**
   * §7 point 2's degeneracy rule: "Person customer = same page with one
   * location, Locations card COLLAPSED". Collapsed, not hidden — a homeowner
   * still has an address, and hiding it is how the gate code becomes
   * unreachable.
   */
  collapsedWhenSingle?: boolean;
  accent?: string;
  onOpenLocation?: (locationId: string) => void;
  onChanged?: () => void;
}) {
  const { post, ready } = useSparkApi();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", address_line1: "", city: "", state: "", postal_code: "" });
  const single = collapsedWhenSingle && locations.length <= 1;
  const [open, setOpen] = useState(!single);

  async function add() {
    if (!ready || !form.name.trim()) return;
    setSaving(true); setErr(null);
    try {
      await post(`/api/v1/customers/${customerKind}/${customerId}/locations`, {
        name: form.name.trim(),
        address_line1: form.address_line1.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        // The first location a customer gets is their default, so a job for a
        // one-location customer never has to ask.
        is_default: locations.length === 0,
      });
      setForm({ name: "", address_line1: "", city: "", state: "", postal_code: "" });
      setAdding(false);
      onChanged?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className={cardCls} data-testid="locations-card">
      <div className={headCls}>
        <div>
          <div className={titleCls}>
            Locations
            {single && (
              <button type="button" onClick={() => setOpen((v) => !v)} className="ml-2 text-[11px] font-medium text-[#0C4A60] underline">
                {open ? "hide" : "show"}
              </button>
            )}
          </div>
          <div className={subCls}>
            Where the work happens. Each has its own contact, notes, fields and jobs. Click one to open it.
          </div>
        </div>
        <button type="button" className={btnCls} data-testid="add-location" onClick={() => { setAdding((v) => !v); setOpen(true); }}>
          {adding ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> Add location</>}
        </button>
      </div>

      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{err}</div>}

      {adding && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs"><div className={labelCls}>Name *</div>
              <input data-testid="new-location-name" autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Waukee campus" /></label>
            <label className="text-xs"><div className={labelCls}>Street</div>
              <input className={inputCls} value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="455 SE Alice's Rd" /></label>
            <label className="text-xs"><div className={labelCls}>City</div>
              <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs"><div className={labelCls}>State</div>
                <input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
              <label className="text-xs"><div className={labelCls}>ZIP</div>
                <input className={inputCls} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></label>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={add} disabled={saving || !form.name.trim()} style={{ background: accent }}
              data-testid="new-location-save"
              className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              <Plus className="h-3.5 w-3.5" /> {saving ? "Adding…" : "Add location"}
            </button>
          </div>
        </div>
      )}

      {!open ? (
        <div className="mt-2 text-[12px] text-slate-600">
          {locations.length === 1
            ? <>One location · {locations[0].name} — {formatLocationAddress(locations[0]) || "no address yet"}</>
            : "No locations yet."}
        </div>
      ) : locations.length === 0 ? (
        <div className="mt-2 text-xs text-slate-500">
          No locations yet. Add one and every job, quote and invoice can say which building it was for.
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((l) => {
            const contact = siteContactFor(roles, l.location_id);
            const jobs = jobCounts ? jobCounts[l.location_id] : undefined;
            return (
              <button
                key={l.location_id}
                type="button"
                data-testid="location-tile"
                onClick={() => onOpenLocation?.(l.location_id)}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-[#2D9CDB]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-900">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-[#0C4A60]" />
                    <span className="truncate">{l.name}</span>
                  </span>
                  {l.pays_for_itself
                    ? <span className="rounded-full bg-[#FFF3E9] px-2 py-px text-[10px] font-semibold text-[#9A4318]">Own invoice</span>
                    : l.is_default ? <span className="rounded-full bg-[#E8F4FB] px-2 py-px text-[10px] font-semibold text-[#0C4A60]">Default</span> : null}
                </span>
                <span className="text-[12px] text-slate-700">{formatLocationAddress(l) || "No address yet"}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>{contact ? `Contact: ${personName(contact)}` : "No site contact"}</span>
                  {jobs !== undefined && <span>{jobs === 1 ? "1 job" : `${jobs} jobs`}</span>}
                  <span>
                    {l.pays_for_itself
                      ? `Own invoice${l.own_payment_terms_days ? ` · Net ${l.own_payment_terms_days}` : ""}`
                      : `Bills to: ${customerName}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Notes ──────────────────────────────────────────────────────────────────

export interface NoteRow {
  id: number;
  content: string;
  author: string | null;
  created_at: string;
}

/**
 * Notes for ONE owner. `path` is the owner's notes endpoint, so the same card
 * serves a company, a person and a location — the three owners migration 183
 * gave lumen.note. Passing the path rather than a kind keeps the card ignorant
 * of the URL shapes, which is what lets the location page reuse it verbatim.
 */
export function NotesCard({
  path, title = "Notes", subtitle, accent = "#EF6C33", emptyText,
}: {
  path: string;
  title?: string;
  subtitle?: string;
  accent?: string;
  emptyText?: string;
}) {
  const { get, post, ready } = useSparkApi();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setErr(null);
    try {
      const r = await get<{ data: NoteRow[] }>(path);
      setNotes(r.data || []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready, path]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!text.trim()) return;
    setSaving(true); setErr(null);
    try {
      await post(path, { content: text.trim() });
      setText("");
      setWriting(false);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className={cardCls} data-testid="notes-card">
      <div className={headCls}>
        <div>
          <div className={titleCls}>{title}</div>
          <div className={subCls}>{subtitle ?? "Written by your team. Location notes live on the location."}</div>
        </div>
        <button type="button" className={btnCls} data-testid="add-note" onClick={() => setWriting((v) => !v)}>
          {writing ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><StickyNote className="h-3.5 w-3.5" /> Note</>}
        </button>
      </div>

      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{err}</div>}

      {writing && (
        <div className="mt-3">
          <textarea
            data-testid="note-text"
            autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-[13px]"
            placeholder="What should the next person to open this know?"
          />
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={add} disabled={saving || !text.trim()} style={{ background: accent }}
              data-testid="note-save"
              className="rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 divide-y divide-slate-100">
        {loading && <div className="py-3 text-xs text-slate-500">Loading…</div>}
        {!loading && notes.length === 0 && (
          <div className="py-3 text-xs text-slate-500">{emptyText ?? "No notes yet."}</div>
        )}
        {notes.map((n) => (
          <div key={n.id} className="flex flex-col gap-0.5 py-2">
            <span className="whitespace-pre-wrap text-[12px] text-slate-800">{n.content}</span>
            <span className="text-[11px] text-slate-500">
              {n.author || "Someone"} · {new Date(n.created_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

interface ActivityRow {
  id: number;
  title: string;
  detail: string | null;
  occurred_at: string;
}

/**
 * The activity stream, read-only.
 *
 * A COMPANY's activity is the activity of the people at it — `?account_id=`.
 * lumen.activity has no account column and should not grow one: every row it
 * carries was caused by or aimed at a person, and a column nothing writes reads
 * as "already handled" to the next person (§9.11's named shape).
 */
export function ActivityCard({
  customerKind, customerId, title = "Activity", limit = 12,
}: {
  customerKind: "company" | "person";
  customerId: string;
  title?: string;
  limit?: number;
}) {
  const { get, ready } = useSparkApi();
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !customerId) return;
    let live = true;
    setLoading(true);
    const q = customerKind === "company" ? `account_id=${customerId}` : `contact_id=${customerId}`;
    get<{ data: ActivityRow[] }>(`/api/v1/activity?${q}&limit=${limit}`)
      .then((r) => { if (live) setItems(r.data || []); })
      .catch(() => { if (live) setItems([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [get, ready, customerKind, customerId, limit]);

  return (
    <div className={cardCls} data-testid="activity-card">
      <div>
        <div className={titleCls}>{title}</div>
        <div className={subCls}>Written by the system. One line per thing a person would care about.</div>
      </div>
      <div className="mt-2 divide-y divide-slate-100">
        {loading && <div className="py-3 text-xs text-slate-500">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="py-3 text-xs text-slate-500">
            Nothing yet. Jobs, quotes, invoices and emails all land here as they happen.
          </div>
        )}
        {items.map((a) => (
          <div key={a.id} className="flex flex-col gap-0.5 py-2">
            <span className="text-[12px] text-slate-800">{a.title}</span>
            {a.detail && <span className="text-[11px] text-slate-600">{a.detail}</span>}
            <span className="text-[11px] text-slate-500">{new Date(a.occurred_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { ActivityIcon };
