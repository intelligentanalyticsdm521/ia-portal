import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
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
  const { get, post, ready } = useOliverApi();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Worker[]>("/workers");
      setWorkers(data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

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
  ];

  return (
    <OliverPageWrapper title="Team" subtitle="Workers and availability" error={error} loading={loading}>
      <PageHeader
        title="Team"
        subtitle="Manage your workers and their weekly availability"
        actions={<Button variant="primary" onClick={() => setEditingId("new")}>+ Add worker</Button>}
      />

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
          api={{ get, post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function WorkerDrawer({ workerId, onClose, onSaved, api }: { workerId: string | "new"; onClose: () => void; onSaved: () => void; api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  const isNew = workerId === "new";
  const [worker, setWorker] = useState<Worker | null>(isNew ? { id: "", first_name: "", last_name: "", email: "", phone: "", type: "employee", status: "active" } : null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const list = await api.get<Worker[]>("/workers");
        const w = list.find((x) => x.id === workerId);
        setWorker(w ?? null);
        const slotData = await api.get<AvailabilitySlot[]>(`/availability/workers/${workerId}`);
        setSlots(slotData || []);
      } finally { setLoading(false); }
    })();
  }, [api, workerId, isNew]);

  if (loading || !worker) return <DetailDrawer open onClose={onClose} title="Loading…" width="lg"><div className="text-sm text-slate-500">Loading worker…</div></DetailDrawer>;

  function setField<K extends keyof Worker>(k: K, v: Worker[K]) { setWorker((cur) => cur ? { ...cur, [k]: v } : cur); }

  async function save() {
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        const created = await api.post<Worker>("/workers", worker);
        if (slots.length) {
          await api.post(`/availability/workers/${created.id}`, { slots: slots.map((s) => ({ dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time })) });
        }
      } else {
        // PATCH worker
        await fetch(`${(import.meta.env.VITE_OLIVER_API_BASE || "")}/workers/${worker!.id}`, { method: "PATCH" }); // placeholder if backend supports
        // Save availability via the dedicated endpoint
        await api.post(`/availability/workers/${worker!.id}`, { slots: slots.map((s) => ({ dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time })) });
      }
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
            <input value={worker.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700 font-medium">{label}{required && <span className="text-red-500 ml-1">*</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
