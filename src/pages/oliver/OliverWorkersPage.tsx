import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import PhoneInput from "../../components/PhoneInput";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation, parseIdList, locationNameOf, type OliverLocation } from "../../lib/oliverLocations";
import { addSelfNote, addSelfFailureNote, sameWorkerId, type AddSelfResult } from "../../lib/crewSelf";
import {
  CREW_PERMISSIONS, permissionLoadError, permissionPatchBody, permissionSaveError, permissionSaveNote, readCrewPermissions,
  type CrewPermissionKey,
} from "../../lib/onsiteJob";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  type: string; // employee | contractor
  status: string;
  hourly_rate?: number | null;
  // F-46 — JSON array of free-text strings the tenant uses to tag regions
  // (e.g. ["North Side","Downtown","SF Peninsula"]) and skills (e.g.
  // ["Drain cleaning","Tankless install"]). Free-form on purpose so the
  // tenant doesn't need to maintain a hard taxonomy for these.
  regions?: string[] | string | null;
  skills?: string[] | string | null;
  /** Multi-location — locations this worker serves (GET/PATCH /workers/:id). */
  location_ids?: string[] | string | null;
  // OLIVER pack 2 — has this person ever been handed the address of the crew
  // app, and have they used it? A fact from oliver.portal_invite. Creating a
  // worker used to send them nothing at all, so the crew app went unused
  // because nobody had been told it existed.
  portal_status?: "never_invited" | "invited" | "signed_in";
  invited_at?: string | null;
  first_signin_at?: string | null;
  last_seen_at?: string | null;
}

// F-74 — formal categories (drawn from oliver.service_category) the worker
// is assigned to via the worker_service_category M2M table.
interface ServiceCategory {
  category_id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  proficiency?: string | null;
}

interface AvailabilitySlot {
  availability_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "type:employee", label: "Employees" },
  { key: "type:contractor", label: "Contractors" },
  { key: "status:inactive", label: "Inactive" },
];

export function OliverWorkersPage() {
  const insightsPayload = useProductInsightsPayload('oliver').payload;
  const { get, post, patch, put, ready } = useOliverApi();
  // OLIVER pack 2 — the crew invite. One person at a time, from the row: a
  // business has a handful of crew, and "invite everybody" is not an act
  // anybody needs.
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function inviteWorker(w: Worker) {
    setInviting(w.id);
    setInviteNote(null);
    try {
      const r = await post<{ ok: boolean; status: string; reason: string | null; email: string | null; portalUrl: string | null }>(
        `/workers/${w.id}/invite`, {},
      );
      // What actually happened, per person, in words. "Invited" over a message
      // the gate suppressed is the failure this platform keeps rediscovering.
      setInviteNote(r.ok
        ? { ok: true, text: `Sent to ${r.email}. It carries ${r.portalUrl} — the same address every time, and it does not expire.` }
        : { ok: false, text: `Not sent to ${w.first_name}: ${workerInviteReason(r.reason, r.status)}` });
      await reload();
    } catch (e) {
      setInviteNote({ ok: false, text: e instanceof Error ? e.message : "The invitation was not sent." });
    } finally {
      setInviting(null);
    }
  }
  // On-site flow v1 (1 Oct 2026) — an owner-operator works in the Portal for
  // the office and in the crew app on site, and the crew app only lets in
  // people on the crew list. One button puts the signed-in admin on it.
  const [addingSelf, setAddingSelf] = useState(false);

  async function addYourself() {
    setAddingSelf(true);
    setInviteNote(null);
    try {
      const r = await post<AddSelfResult>("/workers/me", {});
      // The email the crew app will know them by is the crew member's own —
      // read it back from the list rather than guess it from the sign-in.
      let email: string | null = null;
      if (r && r.worker_id) {
        try {
          const list = await get<Worker[]>("/workers");
          email = (list || []).find((w) => sameWorkerId(w.id, r.worker_id))?.email ?? null;
        } catch { /* the note still says what happened; it names no email */ }
      }
      setInviteNote(addSelfNote(r, email));
      await reload();
    } catch (e) {
      setInviteNote(addSelfFailureNote(e));
    } finally {
      setAddingSelf(false);
    }
  }

  const loc = useOliverLocations();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Worker[]>(withLocation("/workers", loc.selectedLocationId));
      setWorkers(data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get, loc.selectedLocationId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = workers;
    if (filter.startsWith("type:")) {
      const t = filter.split(":")[1];
      list = list.filter((w) => w.type === t);
    } else if (filter === "status:inactive") {
      list = list.filter((w) => w.status !== "active");
    } else if (!filter) {
      list = list.filter((w) => w.status === "active");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) || w.email.toLowerCase().includes(q));
    }
    return list;
  }, [workers, filter, search]);

  const columns: Column<Worker>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortAccessor: (w) => `${w.first_name} ${w.last_name}`.toLowerCase(),
      render: (w) => (
        <div className="font-medium text-oliver-teal">{w.first_name} {w.last_name}</div>
      ),
    },
    { key: "email", header: "Email", render: (w) => <span className="text-sm text-slate-600">{w.email}</span> },
    { key: "phone", header: "Phone", render: (w) => <span className="text-sm text-slate-600">{w.phone || "—"}</span> },
    {
      key: "type", header: "Type",
      render: (w) => (
        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
          w.type === "employee" ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "bg-amber-50 text-amber-700 ring-amber-200"
        }`}>{w.type}</span>
      ),
    },
    {
      key: "hourly_rate", header: "Rate", align: "right",
      sortable: true,
      sortAccessor: (w) => Number(w.hourly_rate ?? 0),
      render: (w) => (w.hourly_rate ?? 0) > 0
        ? <span style={{ fontFamily: "monospace", fontSize: 12 }}>${Number(w.hourly_rate).toFixed(2)}/hr</span>
        : <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>,
    },
    { key: "status", header: "Status", render: (w) => <StatusBadge status={w.status} /> },
    {
      key: "portal", header: "Crew app", sortable: true,
      sortAccessor: (w) => w.portal_status ?? "never_invited",
      render: (w) => {
        const st = w.portal_status ?? "never_invited";
        if (st === "signed_in") {
          return <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>
            Signed in{w.last_seen_at ? ` · ${new Date(w.last_seen_at).toLocaleDateString()}` : ""}
          </span>;
        }
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: st === "invited" ? "#B45309" : "#94A3B8", fontWeight: st === "invited" ? 600 : 400 }}>
              {st === "invited" ? "Invited" : "Never invited"}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); void inviteWorker(w); }}
              disabled={inviting === w.id || w.status !== "active"}
              title={w.status !== "active" ? "Only an active crew member can be invited" : "Send them the address of the crew app"}
              style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, cursor: "pointer",
                border: "1px solid rgba(45,156,219,0.35)", background: "#FFFFFF", color: "#1D4ED8",
              }}
            >
              {inviting === w.id ? "Sending…" : st === "invited" ? "Send again" : "Invite"}
            </button>
          </span>
        );
      },
    },
    ...(loc.multi ? [{
      key: "locations", header: "Locations",
      render: (w: Worker) => {
        const names = parseIdList(w.location_ids).map((id) => locationNameOf(id, loc.locations)).filter(Boolean);
        return <span className="text-xs text-slate-600">{names.length ? names.join(", ") : "—"}</span>;
      },
    } satisfies Column<Worker>] : []),
  ];

  return (
    <OliverPageWrapper title="Team" subtitle="Workers and availability" error={error} loading={loading}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_crew_roster', label: 'Crew and costs' },
      ]} />
      <PageHeader
        title="Team"
        subtitle="Manage your workers and their weekly availability"
        actions={
          <>
            <Button variant="secondary" onClick={() => void addYourself()} disabled={addingSelf}
              title="Put yourself on the crew list so you can use the crew app on your own jobs">
              {addingSelf ? "Adding…" : "Add yourself as a crew member"}
            </Button>
            <Button variant="primary" onClick={() => setEditingId("new")}>+ Add worker</Button>
          </>
        }
      />

      {inviteNote && (
        <div
          data-testid="crew-invite-note"
          style={{
            padding: 12, margin: "8px 0", borderRadius: 8, fontSize: 13,
            background: inviteNote.ok ? "#F0FDF4" : "#FFFBEB",
            border: `1px solid ${inviteNote.ok ? "#BBF7D0" : "#FDE68A"}`,
            color: inviteNote.ok ? "#15803D" : "#92400E",
            display: "flex", gap: 12, alignItems: "start",
          }}
        >
          <span style={{ flex: 1 }}>{inviteNote.text}</span>
          <button onClick={() => setInviteNote(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#64748B" }}>×</button>
        </div>
      )}

      {!workers.length ? (
        <EmptyState
          title="No workers yet"
          description="Add your first worker to start assigning jobs and enabling auto-scheduling."
          action={<Button variant="primary" onClick={() => setEditingId("new")}>+ Add worker</Button>}
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name or email…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(w) => w.id}
            onRowClick={(w) => setEditingId(w.id)}
          />
        </>
      )}

      {editingId && (
        <WorkerDrawer
          workerId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); reload(); }}
          api={{ get, post, patch, put }}
          locations={loc.multi ? loc.activeLocations : []}
          defaultLocationId={loc.selectedLocationId !== "all" ? loc.selectedLocationId : (loc.defaultLocation?.location_id ?? null)}
        />
      )}
    </OliverPageWrapper>
  );
}

interface WorkerDrawerApi {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, b?: unknown) => Promise<T>;
  patch: <T>(p: string, b: unknown) => Promise<T>;
  put: <T>(p: string, b: unknown) => Promise<T>;
}

function parseStringArray(v: Worker["regions"] | Worker["skills"]): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* not json, fall through to comma split */ }
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function WorkerDrawer({ workerId, onClose, onSaved, api, locations, defaultLocationId }: {
  workerId: string | "new"; onClose: () => void; onSaved: () => void; api: WorkerDrawerApi;
  /** Active locations to offer — EMPTY for a single-location business, which hides the control and sends no location_ids. */
  locations: OliverLocation[];
  defaultLocationId: string | null;
}) {
  const isNew = workerId === "new";
  const [worker, setWorker] = useState<Worker | null>(isNew ? { id: "", first_name: "", last_name: "", email: "", phone: "", type: "employee", status: "active", regions: [], skills: [] } : null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // F-46 / F-74 — specialties state
  const [regions, setRegions] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<ServiceCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  // Multi-location — a new worker starts on the picker's location (or the default).
  const multi = locations.length > 1;
  const [locationIds, setLocationIds] = useState<string[]>(() => (isNew && multi && defaultLocationId ? [defaultLocationId] : []));

  useEffect(() => {
    (async () => {
      try {
        if (isNew) {
          const cats = await api.get<ServiceCategory[]>("/service-categories").catch(() => [] as ServiceCategory[]);
          setAllCategories(cats || []);
          return;
        }
        const list = await api.get<Worker[]>("/workers");
        const w = list.find((x) => x.id === workerId) ?? null;
        setWorker(w);
        if (w) {
          setRegions(parseStringArray(w.regions));
          setSkills(parseStringArray(w.skills));
          setLocationIds(parseIdList(w.location_ids));
        }
        const slotData = await api.get<AvailabilitySlot[]>(`/availability/workers/${workerId}`);
        setSlots(slotData || []);
        const [cats, assigned] = await Promise.all([
          api.get<ServiceCategory[]>("/service-categories").catch(() => [] as ServiceCategory[]),
          api.get<ServiceCategory[]>(`/service-categories/by-worker/${workerId}`).catch(() => [] as ServiceCategory[]),
        ]);
        setAllCategories(cats || []);
        setSelectedCategoryIds((assigned || []).map((c) => c.category_id));
      } finally { setLoading(false); }
    })();
  }, [api, workerId, isNew]);

  if (loading || !worker) return <DetailDrawer open onClose={onClose} title="Loading…" width="lg"><div className="text-sm text-slate-500">Loading worker…</div></DetailDrawer>;

  function setField<K extends keyof Worker>(k: K, v: Worker[K]) { setWorker((cur) => cur ? { ...cur, [k]: v } : cur); }

  function toggleCategory(catId: string) {
    setSelectedCategoryIds((cur) => cur.includes(catId) ? cur.filter((x) => x !== catId) : [...cur, catId]);
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      let workerIdForSync = worker!.id;
      if (isNew) {
        const created = await api.post<Worker>("/workers", {
          first_name: worker!.first_name,
          last_name: worker!.last_name,
          email: worker!.email,
          phone: worker!.phone,
          type: worker!.type,
          hourly_rate: worker!.hourly_rate,
        });
        workerIdForSync = created.id;
        // Sync specialties + availability on the freshly created row.
        await api.patch(`/workers/${workerIdForSync}`, {
          regions,
          skills,
          ...(multi ? { location_ids: locationIds } : {}),
        }).catch(() => null);
        if (slots.length) {
          await api.post(`/availability/workers/${workerIdForSync}`, { slots: slots.map((s) => ({ dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time })) });
        }
      } else {
        // F-44 fix — actually PATCH the worker (was previously a no-op fetch
        // with no body, which silently swallowed every Save click).
        await api.patch(`/workers/${workerIdForSync}`, {
          first_name: worker!.first_name,
          last_name: worker!.last_name,
          email: worker!.email,
          phone: worker!.phone || null,
          type: worker!.type,
          status: worker!.status,
          hourly_rate: worker!.hourly_rate ?? null,
          regions,
          skills,
          ...(multi ? { location_ids: locationIds } : {}),
        });
        await api.post(`/availability/workers/${workerIdForSync}`, { slots: slots.map((s) => ({ dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time })) });
      }
      // F-74 — replace category assignments (idempotent PUT)
      await api.put(`/service-categories/by-worker/${workerIdForSync}`, { category_ids: selectedCategoryIds }).catch(() => null);
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  // Group slots by day for editing UX
  function setDay(dow: number, ranges: { start: string; end: string }[]) {
    setSlots((cur) => {
      const others = cur.filter((s) => s.day_of_week !== dow);
      const newOnes: AvailabilitySlot[] = ranges.map((r) => ({ day_of_week: dow, start_time: r.start, end_time: r.end, is_active: true }));
      return [...others, ...newOnes].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
    });
  }

  function dayRanges(dow: number) {
    return slots.filter((s) => s.day_of_week === dow).map((s) => ({ start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) }));
  }

  return (
    <DetailDrawer
      open onClose={onClose}
      title={isNew ? "Add worker" : `${worker.first_name} ${worker.last_name}`}
      subtitle={isNew ? "Add a new team member" : worker.email}
      width="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{isNew ? "Add worker" : "Save"}</Button>
        </>
      }
    >
      {err && <div className="mb-4 rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-2 text-sm text-red-800">{err}</div>}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal">Profile</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input value={worker.first_name} onChange={(e) => setField("first_name", e.target.value)} className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Last name" required>
            <input value={worker.last_name} onChange={(e) => setField("last_name", e.target.value)} className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Email" required>
            <input value={worker.email} onChange={(e) => setField("email", e.target.value)} className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Phone">
            <PhoneInput value={worker.phone ?? ""} onChange={(v) => setField("phone", v)} className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Type">
            <select value={worker.type} onChange={(e) => setField("type", e.target.value)} className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm">
              <option value="employee">Employee</option>
              <option value="contractor">Contractor</option>
            </select>
          </Field>
          <Field label="Hourly rate (optional)">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">$</span>
              <input
                type="number" step="0.01" min="0"
                value={worker.hourly_rate ?? ""}
                onChange={(e) => setField("hourly_rate", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="e.g. 35.00"
                className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm"
              />
              <span className="text-sm text-slate-500 whitespace-nowrap">/ hr</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Used by reports to compute labor cost + job profitability.</p>
          </Field>
        </div>
      </section>

      {/* F-46 + F-74 — Specialties: regions/skills + service-category tags */}
      <section className="mt-6 space-y-3 pt-4 border-t border-gray-200">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal">Specialties</h3>
          <p className="text-xs text-slate-500 mt-1">Used by auto-assignment to match jobs and by customers when picking their preferred crew.</p>
        </div>

        <Field label="Service categories">
          <div className="flex flex-wrap gap-1.5">
            {allCategories.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No service categories defined yet. Add them in Service Categories.</span>
            ) : allCategories.map((c) => {
              const on = selectedCategoryIds.includes(c.category_id);
              return (
                <button
                  type="button"
                  key={c.category_id}
                  onClick={() => toggleCategory(c.category_id)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 99,
                    border: `1px solid ${on ? (c.color || "#1A3A4A") : "#cbd5e1"}`,
                    background: on ? (c.color || "#1A3A4A") : "#fff",
                    color: on ? "#fff" : "#0B1C24",
                    cursor: "pointer",
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </Field>

        {multi && (
          <Field label="Locations">
            <div className="flex flex-wrap gap-1.5">
              {locations.map((l) => {
                const on = locationIds.includes(l.location_id);
                return (
                  <button
                    type="button"
                    key={l.location_id}
                    onClick={() => setLocationIds((cur) => on ? cur.filter((x) => x !== l.location_id) : [...cur, l.location_id])}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, border: `1px solid ${on ? "#1A3A4A" : "#cbd5e1"}`, background: on ? "#1A3A4A" : "#fff", color: on ? "#fff" : "#0B1C24", cursor: "pointer", fontWeight: on ? 600 : 500 }}
                  >
                    {l.name}{l.is_default ? " (default)" : ""}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Which locations this worker can be scheduled at. Leave all off to keep them on the default location.</p>
          </Field>
        )}

        <Field label="Regions / territories (free text, comma separated)">
          <ChipInput
            value={regions}
            onChange={setRegions}
            placeholder="e.g. Downtown, North Side, SF Peninsula"
          />
          <p className="text-[10px] text-slate-400 mt-1">Free-form labels. Auto-assignment can match these against the job's service-address region label.</p>
        </Field>

        <Field label="Skills (free text, comma separated)">
          <ChipInput
            value={skills}
            onChange={setSkills}
            placeholder="e.g. Drain cleaning, Tankless install, Bilingual ES"
          />
          <p className="text-[10px] text-slate-400 mt-1">Finer-grained than categories — quick filterable tags for the customer's preferred-crew picker.</p>
        </Field>
      </section>

      {!isNew && (
        <section className="mt-6 space-y-3 pt-4 border-t border-gray-200">
          <CrewPermissionsPanel workerId={worker.id} firstName={worker.first_name} api={api} />
        </section>
      )}

      {!isNew && (
        <section className="mt-6 space-y-3 pt-4 border-t border-gray-200">
          <CalendarSyncPanel workerId={worker.id} api={api} />
        </section>
      )}

      <section className="mt-6 space-y-3 pt-4 border-t border-gray-200">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal">Weekly availability</h3>
          <p className="text-xs text-slate-500 mt-1">Used by auto-scheduling to find slots when customers book self-service services.</p>
        </div>
        <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
          {DOW_LABELS.map((label, dow) => {
            const ranges = dayRanges(dow);
            return (
              <div key={dow} className="px-3 py-3 grid grid-cols-12 gap-3 items-start">
                <div className="col-span-2 text-sm font-medium text-slate-700 pt-2">{label}</div>
                <div className="col-span-9 space-y-2">
                  {ranges.length === 0 && <div className="text-xs text-slate-400 italic py-1">Off</div>}
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="time" value={r.start}
                        onChange={(e) => {
                          const next = [...ranges]; next[i] = { ...r, start: e.target.value };
                          setDay(dow, next);
                        }}
                        className="rounded ring-1 ring-gray-300 px-2 py-1 text-sm" />
                      <span className="text-slate-400">–</span>
                      <input type="time" value={r.end}
                        onChange={(e) => {
                          const next = [...ranges]; next[i] = { ...r, end: e.target.value };
                          setDay(dow, next);
                        }}
                        className="rounded ring-1 ring-gray-300 px-2 py-1 text-sm" />
                      <button onClick={() => setDay(dow, ranges.filter((_, idx) => idx !== i))}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="col-span-1 text-right">
                  <button onClick={() => setDay(dow, [...ranges, { start: "09:00", end: "17:00" }])}
                    className="text-xs text-oliver-teal hover:text-oliver-teal-700 font-medium">+ Add</button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">Save to apply changes. Auto-scheduling uses these windows + existing job assignments to place new requests.</p>
      </section>
    </DetailDrawer>
  );
}

// On-site flow Phase C (G9): what this worker may do in the crew app on site.
// Four switches, each saved the moment it is flipped through PATCH
// /workers/:id (not the drawer's Save), and "Saved" only when the answer
// carries the value sent. Read from GET /workers/:id, whose row carries the
// four columns; a switch the server did not send is shown disabled with a
// sentence rather than a guessed default.
//
// WHAT THE SENTENCE SAYS, AND WHY IT CHANGED (2026-10-08). It used to read
// "Owners and admins can always do all four", which was true of the code and
// wrong in effect: oliver-api's crewPermissions() short-circuited on
// `oliverRole === "admin"`, and EVERY user resolves to admin unless there is a
// row in oliver.tenant_user_role saying accountant - a table with zero rows on
// production. So the four boxes did nothing for anybody. Rolling In It's crew
// member had can_send_quotes, can_quote_custom and can_charge all unticked and
// could still do all three (oliver-api 370ae33). A box that is SET is now
// obeyed for everyone; where a box was never set, an owner or admin may do it.
// The sentence had to change with the behaviour, or the screen would lie the
// other way. GET /employee/me returns the same four, read the same way.
function CrewPermissionsPanel({ workerId, firstName, api }: {
  workerId: string; firstName: string; api: WorkerDrawerApi;
}) {
  const [perms, setPerms] = useState<Record<CrewPermissionKey, boolean | null> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<CrewPermissionKey | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    setPerms(null); setLoadErr(null); setNote(null);
    api.get<unknown>(`/workers/${workerId}`)
      .then((w) => { if (live) setPerms(readCrewPermissions(w)); })
      .catch((e) => { if (live) setLoadErr(permissionLoadError(e)); });
    return () => { live = false; };
  }, [api, workerId]);

  async function flip(key: CrewPermissionKey, value: boolean) {
    setBusyKey(key); setNote(null);
    try {
      const resp = await api.patch<unknown>(`/workers/${workerId}`, permissionPatchBody(key, value));
      const said = permissionSaveNote(key, value, resp, firstName);
      setNote(said);
      if (said.ok) setPerms((cur) => (cur ? { ...cur, [key]: value } : cur));
    } catch (e) {
      setNote({ ok: false, text: permissionSaveError(e) });
    } finally {
      setBusyKey(null);
    }
  }

  const unknown = !!perms && CREW_PERMISSIONS.some((p) => perms[p.key] === null);

  return (
    <div data-testid="crew-permissions">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal">On site, in the crew app</h3>
      <p className="text-xs text-slate-500 mt-1">
        What {firstName.trim() || "this worker"} may do on the tablet. Each box saves when you tick or untick it. Once you set a box it holds for everyone, owners and admins included.
      </p>
      {loadErr && <div className="mt-2 rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs text-red-800" role="alert">{loadErr}</div>}
      {!perms && !loadErr && <div className="mt-2 text-xs text-slate-500">Loading…</div>}
      {perms && (
        <div className="mt-3 space-y-2">
          {CREW_PERMISSIONS.map((p) => {
            const v = perms[p.key];
            return (
              <label key={p.key} className="flex items-start gap-3 rounded-lg ring-1 ring-gray-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={v === true}
                  disabled={v === null || busyKey !== null}
                  onChange={(e) => { void flip(p.key, e.target.checked); }}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-800">{p.label}{busyKey === p.key ? " — saving…" : ""}</span>
                  <span className="block text-xs text-slate-500">{p.help}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      {unknown && (
        <p className="mt-2 text-xs text-slate-500">Some switches are not available yet: the server did not say whether they are on.</p>
      )}
      {note && (
        <div className={`mt-2 text-xs ${note.ok ? "text-emerald-700" : "text-red-700"}`} role={note.ok ? "status" : "alert"}>{note.text}</div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700 font-medium">{label}{required && <span className="text-red-500 ml-1">*</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Simple chip input — user types a value and presses Enter or comma to
// commit, click × to remove a chip. Renders the chips inline with the
// editing field so the whole thing reads as a single composite control.
function ChipInput({ value, onChange, placeholder }: { value: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  function commit(raw: string) {
    const v = raw.trim().replace(/^,+|,+$/g, "").trim();
    if (!v) return;
    if (value.includes(v)) { setDraft(""); return; }
    onChange([...value, v]);
    setDraft("");
  }
  function remove(idx: number) { onChange(value.filter((_, i) => i !== idx)); }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" }}>
      {value.map((v, i) => (
        <span key={`${v}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 12, background: "#E0F2FE", color: "#075985", borderRadius: 99 }}>
          {v}
          <button type="button" onClick={() => remove(i)} style={{ background: "none", border: 0, color: "#075985", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(draft); }
          else if (e.key === "Backspace" && !draft && value.length) { remove(value.length - 1); }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length ? "" : (placeholder ?? "")}
        style={{ flex: "1 1 120px", border: 0, outline: "none", fontSize: 13, padding: "3px 4px", minWidth: 120 }}
      />
    </div>
  );
}

// ─── Calendar Sync panel ─────────────────────────────────────────────────────
// Renders inside the worker drawer. Lazy-fetches the worker's ICS feed URL
// (creating the token if it doesn't exist), shows the copy-paste URL + a
// one-click webcal:// subscribe button, plus a "rotate token" path.
function CalendarSyncPanel({ workerId, api }: {
  workerId: string;
  api: Pick<WorkerDrawerApi, "get" | "post">;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [webcalUrl, setWebcalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"none" | "loading" | "rotating" | "copied">("none");
  const [err, setErr] = useState<string | null>(null);

  async function loadUrl() {
    setBusy("loading"); setErr(null); setLoading(true);
    try {
      const data = await api.get<{ url: string; webcal_url: string }>(`/workers/${workerId}/cal-sync`);
      setUrl(data.url);
      setWebcalUrl(data.webcal_url);
    } catch (e) {
      setErr((e as Error).message || "Failed to load calendar sync");
    } finally {
      setLoading(false);
      setBusy("none");
    }
  }

  async function rotate() {
    if (!confirm("Rotate the calendar feed token? Existing subscriptions will stop working and the worker will need to re-subscribe.")) return;
    setBusy("rotating"); setErr(null);
    try {
      const data = await api.post<{ url: string; webcal_url: string }>(`/workers/${workerId}/cal-sync/rotate`);
      setUrl(data.url);
      setWebcalUrl(data.webcal_url);
    } catch (e) {
      setErr((e as Error).message || "Rotation failed");
    } finally {
      setBusy("none");
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setBusy("copied");
      setTimeout(() => setBusy("none"), 1500);
    } catch {
      // Fallback: select-all the input via prompt
      prompt("Copy this URL:", url);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal" style={{ margin: 0 }}>Calendar sync</h3>
          <p className="text-xs text-slate-500" style={{ marginTop: 4 }}>
            Subscribe to assigned jobs in Google Calendar, Outlook, or Apple Calendar. Updates within ~15 minutes of OLIVER changes.
          </p>
        </div>
        {!url && (
          <Button variant="secondary" onClick={loadUrl} disabled={loading}>
            {loading ? "Loading…" : "Show subscribe URL"}
          </Button>
        )}
      </div>

      {err && (
        <div style={{ marginTop: 8, padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
          {err}
        </div>
      )}

      {url && (
        <div style={{ marginTop: 10, padding: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Subscribe URL
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text" readOnly value={url}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ flex: 1, fontFamily: "monospace", fontSize: 11, padding: "6px 10px", border: "1px solid #D5E2E8", borderRadius: 6, background: "#fff", color: "#0B1C24" }}
            />
            <Button variant="ghost" onClick={copy}>
              {busy === "copied" ? "Copied!" : "Copy"}
            </Button>
          </div>
          {webcalUrl && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, fontSize: 11 }}>
              <a href={webcalUrl}
                style={{ padding: "5px 12px", borderRadius: 6, background: "#1A7DB5", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
                One-click subscribe
              </a>
              <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: "5px 12px", borderRadius: 6, background: "#fff", color: "#1A7DB5", border: "1px solid #1A7DB5", textDecoration: "none", fontWeight: 600 }}>
                Add to Google Calendar
              </a>
              <button onClick={rotate} disabled={busy === "rotating"}
                style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 6, background: "transparent", color: "#9333EA", border: 0, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {busy === "rotating" ? "Rotating…" : "Rotate token"}
              </button>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
            <strong>Privacy:</strong> anyone with this URL sees this worker's schedule. Treat it like a password and rotate if compromised.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The words a person reads when an invitation did not go out.
 *
 * Never a status key: "suppressed" means this crew member has asked us to stop
 * emailing them, and the owner needs to hear that rather than a word from a
 * database column.
 */
function workerInviteReason(reason: string | null, status: string): string {
  switch (reason) {
    case "no_email_on_file": return "there is no email address on their record.";
    case "worker_not_active": return "they are not an active crew member.";
    case "worker_not_found": return "we could not find their record.";
    case "no_business_slug": return "your business has no web address yet, so there is nowhere to send them.";
    case "enqueue_failed": return "the message could not be queued. Try again.";
    default:
      if (status === "suppressed") return "they have asked not to receive messages from you.";
      return reason || "it was not sent.";
  }
}
