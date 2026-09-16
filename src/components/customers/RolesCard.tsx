// RolesCard — who is at this customer, what each of them is, and the one place
// a role is given or taken away.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 point 3 —
// "a person's link to a customer or a location carries a ROLE (primary,
// working, billing, site). Roles exist at the COMPANY level too (Hope
// Ministries: two working contacts + one billing contact, no locations)."
//
// §9.12 recorded the gap this closes in as many words: "A screen for the roles
// themselves: lumen.customer_person_role has an API and no UI, so today nobody
// can actually create the site contact these locks and resolvers are written
// for. Until then every fallback path is the one in use."
//
// ── ONE CARD, THREE PLACES ────────────────────────────────────────────────
// The company page lists everybody and their roles; the OLIVER customer record
// shows the same card; the location page shows the same card SCOPED to one
// site ("People at this location"). Three copies would have been three answers
// to "can a billing contact also be a site contact?" — which the role table
// says yes to, and only a shared card keeps saying.
//
// A role is ADDED and REMOVED, never "edited": the API models each (person,
// customer, location, role) as its own row with a uniqueness index behind it,
// so changing Evan from working to site is one delete and one insert, and
// pretending otherwise in the UI would invent a PATCH the server does not have.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, UserPlus, X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import {
  type CustomerLocation, type PersonRole, type CustomerRole,
  ROLE_LABEL, ROLE_HELP, ROLE_ORDER, personName,
} from "../../lib/customerModel";

interface ContactSearchRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
}

export interface RolesCardProps {
  customerKind: "company" | "person";
  /** The LUMEN id — account id for a company, contact id for a person. */
  customerId: string;
  locations: readonly CustomerLocation[];
  /**
   * Show only the roles held AT this location, and default new ones to it.
   * This is the location page's "People at this location" card.
   */
  scopeLocationId?: string | null;
  title?: string;
  subtitle?: string;
  /** Clicking a person's name. The company page opens the contact modal. */
  onOpenPerson?: (contactId: number) => void;
  /** Fired after any role is added or removed, so a parent can refresh counts. */
  onChanged?: () => void;
  /** Accent for the primary action. SPARK orange, OLIVER sky. */
  accent?: string;
}

export function RolesCard({
  customerKind, customerId, locations, scopeLocationId = null,
  title, subtitle, onOpenPerson, onChanged, accent = "#EF6C33",
}: RolesCardProps) {
  const { get, post, del, ready } = useSparkApi();
  const [roles, setRoles] = useState<PersonRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = `/api/v1/customers/${customerKind}/${customerId}`;

  const load = useCallback(async () => {
    if (!ready || !customerId) return;
    setLoading(true); setErr(null);
    try {
      const r = await get<{ data: PersonRole[] }>(`${base}/people`);
      setRoles(r.data || []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready, base, customerId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => (scopeLocationId ? roles.filter((r) => r.location_id === scopeLocationId) : roles),
    [roles, scopeLocationId],
  );

  /** One row per PERSON, with every role they hold gathered onto it. */
  const people = useMemo(() => {
    const byPerson = new Map<number, { person: PersonRole; roles: PersonRole[] }>();
    for (const r of shown) {
      const hit = byPerson.get(r.person_contact_id);
      if (hit) hit.roles.push(r);
      else byPerson.set(r.person_contact_id, { person: r, roles: [r] });
    }
    return [...byPerson.values()].sort((a, b) => {
      const rank = (x: { roles: PersonRole[] }) =>
        Math.min(...x.roles.map((r) => ROLE_ORDER.indexOf(r.role)));
      return rank(a) - rank(b) || personName(a.person).localeCompare(personName(b.person));
    });
  }, [shown]);

  const addRole = useCallback(async (personId: number, role: CustomerRole, locationId: string | null) => {
    setBusy(true); setErr(null);
    try {
      await post(`${base}/people`, {
        person_contact_id: personId, role, location_id: locationId,
      });
      await load();
      onChanged?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [post, base, load, onChanged]);

  const removeRole = useCallback(async (roleId: string) => {
    setBusy(true); setErr(null);
    try {
      await del(`${base}/people/${roleId}`);
      await load();
      onChanged?.();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [del, base, load, onChanged]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-slate-900">{title ?? "Contacts"}</div>
          <div className="text-[11px] text-slate-500">
            {subtitle ?? (people.length === 0
              ? "Nobody has a role here yet. Until somebody does, everything goes to the customer."
              : `${people.length} ${people.length === 1 ? "person" : "people"}. Roles decide who gets job updates and who gets invoices.`)}
          </div>
        </div>
        <button
          type="button"
          data-testid="roles-add-person"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {adding ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><UserPlus className="h-3.5 w-3.5" /> Add person</>}
        </button>
      </div>

      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{err}</div>}

      {adding && (
        <AddPersonRole
          locations={locations}
          scopeLocationId={scopeLocationId}
          accent={accent}
          busy={busy}
          onCancel={() => setAdding(false)}
          onAdd={async (personId, role, locationId) => {
            await addRole(personId, role, locationId);
            setAdding(false);
          }}
        />
      )}

      <div className="mt-2 divide-y divide-slate-100">
        {loading && <div className="py-4 text-center text-xs text-slate-500">Loading…</div>}
        {!loading && people.length === 0 && (
          <div className="py-4 text-xs text-slate-500">
            No roles set. Job updates and invoices both go to the customer until one is.
          </div>
        )}
        {people.map(({ person, roles: held }) => (
          <div key={person.person_contact_id} className="flex items-center gap-3 py-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
              {initials(personName(person))}
            </span>
            <span className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!onOpenPerson}
                onClick={() => onOpenPerson?.(person.person_contact_id)}
                className={`block truncate text-[13px] font-semibold text-slate-900 ${onOpenPerson ? "hover:text-[#0C4A60] hover:underline" : "cursor-default"}`}
              >
                {personName(person)}
              </button>
              <span className="block truncate text-[11px] text-slate-500">
                {[person.email, person.phone].filter(Boolean).join(" · ") || "no contact details"}
              </span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {held.map((r) => (
                <span key={r.role_id} className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-semibold ${roleTone(r.role)}`}>
                  {ROLE_LABEL[r.role]}{r.location_name && !scopeLocationId ? ` · ${r.location_name}` : ""}
                  <button
                    type="button"
                    aria-label={`Remove ${ROLE_LABEL[r.role]}${r.location_name ? ` at ${r.location_name}` : ""} from ${personName(person)}`}
                    title="Remove this role"
                    disabled={busy}
                    onClick={() => removeRole(r.role_id)}
                    className="opacity-60 hover:opacity-100"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Search a person, pick a role, pick where — the three answers a role needs. */
function AddPersonRole({
  locations, scopeLocationId, busy, accent, onAdd, onCancel,
}: {
  locations: readonly CustomerLocation[];
  scopeLocationId: string | null;
  busy: boolean;
  accent: string;
  onAdd: (personId: number, role: CustomerRole, locationId: string | null) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { get, ready } = useSparkApi();
  const [typed, setTyped] = useState("");
  const [hits, setHits] = useState<ContactSearchRow[]>([]);
  const [picked, setPicked] = useState<ContactSearchRow | null>(null);
  // A site contact is a site contact: when the card is scoped to a location
  // that is the only role that makes sense there, so it is the default.
  const [role, setRole] = useState<CustomerRole>(scopeLocationId ? "site" : "working");
  const [locationId, setLocationId] = useState<string | null>(scopeLocationId);

  useEffect(() => {
    if (!ready) return;
    const q = typed.trim();
    if (q.length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await get<{ data: ContactSearchRow[] }>(`/api/v1/contacts?search=${encodeURIComponent(q)}&limit=6`);
        if (live) setHits(r.data || []);
      } catch { if (live) setHits([]); }
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [typed, get, ready]);

  // A role AT a location has to name one. The API refuses a location that is
  // not this customer's, and the picker only offers this customer's — so the
  // only way to get it wrong is to leave it blank, which is what this disables.
  const needsLocation = role === "site";
  const canAdd = !!picked && (!needsLocation || !!locationId);

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <label className="text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Person</div>
          {picked ? (
            <div className="flex items-center justify-between gap-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-[13px]">
              <span className="truncate">{personLabel(picked)}</span>
              <button type="button" className="text-[11px] text-[#0C4A60]" onClick={() => { setPicked(null); setTyped(""); }}>Change</button>
            </div>
          ) : (
            <>
              <input
                data-testid="role-person-search"
                value={typed}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Search your contacts…"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-[13px]"
              />
              {hits.length > 0 && (
                <div className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setPicked(h)}
                      className="block w-full truncate px-2 py-1.5 text-left text-[13px] hover:bg-slate-50"
                    >
                      {personLabel(h)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </label>

        <label className="text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Role</div>
          <select
            data-testid="role-select"
            value={role}
            onChange={(e) => {
              const next = e.target.value as CustomerRole;
              setRole(next);
              // A company-level role has no location. Carrying one over would
              // file "the billing contact" at one building.
              if (next !== "site") setLocationId(scopeLocationId && next === "working" ? scopeLocationId : null);
              else setLocationId(scopeLocationId ?? locationId);
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[13px]"
          >
            {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>

        <label className="text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Where {needsLocation ? "" : "(optional)"}
          </div>
          <select
            data-testid="role-location"
            value={locationId ?? ""}
            disabled={!!scopeLocationId || locations.length === 0}
            onChange={(e) => setLocationId(e.target.value || null)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[13px] disabled:bg-slate-100"
          >
            <option value="">The whole customer</option>
            {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">{ROLE_HELP[role]}</span>
        <span className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            data-testid="role-save"
            disabled={!canAdd || busy}
            onClick={() => picked && onAdd(picked.id, role, locationId)}
            style={{ background: accent }}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> {busy ? "Adding…" : "Add role"}
          </button>
        </span>
      </div>
    </div>
  );
}

function personLabel(c: ContactSearchRow): string {
  const n = (c.display_name || `${c.first_name || ""} ${c.last_name || ""}`).trim();
  return [n || c.email || `#${c.id}`, n && c.email ? `· ${c.email}` : ""].filter(Boolean).join(" ");
}

function initials(name: string): string {
  const parts = String(name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function roleTone(role: CustomerRole): string {
  if (role === "billing") return "bg-[#FFF3E9] text-[#9A4318]";
  if (role === "primary") return "bg-[#E8F4FB] text-[#0C4A60]";
  return "bg-slate-100 text-slate-700";
}

export default RolesCard;
