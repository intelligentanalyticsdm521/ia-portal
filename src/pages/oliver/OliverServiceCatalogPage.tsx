import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";

interface Category {
  category_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sort_order: number;
  is_active: boolean;
}

interface PriceVariant {
  price_id: string;
  pricing_model: "one_time" | "recurring";
  unit_amount: number;
  currency: string;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  trial_days?: number | null;
  label?: string | null;
  is_default: boolean;
  is_active: boolean;
  stripe_price_id?: string | null;
}

interface Offering {
  offering_id: string;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  name: string;
  description?: string | null;
  default_duration_minutes?: number | null;
  is_active: boolean;
  is_self_bookable: boolean;
  requires_quote: boolean;
  stripe_product_id?: string | null;
  image_url?: string | null;
  prices?: PriceVariant[];
}

function fmtPrice(p: PriceVariant): string {
  const amt = `$${Number(p.unit_amount).toFixed(2)}`;
  if (p.pricing_model === "one_time") return `${amt} one-time`;
  const interval = p.recurring_interval_count && p.recurring_interval_count > 1
    ? `every ${p.recurring_interval_count} ${p.recurring_interval}s`
    : `/${p.recurring_interval}`;
  return `${amt} ${interval}`;
}

export function OliverServiceCatalogPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [categories, setCategories] = useState<Category[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");

  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, o] = await Promise.all([
        get<Category[]>("/catalog/categories"),
        get<Offering[]>("/catalog/offerings?include_prices=1"),
      ]);
      setCategories(c);
      setOfferings(o);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filteredOfferings = useMemo(() => {
    let list = offerings;
    if (activeCategoryId) {
      if (activeCategoryId === "__uncategorized__") list = list.filter((o) => !o.category_id);
      else list = list.filter((o) => o.category_id === activeCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
    }
    return list;
  }, [offerings, activeCategoryId, search]);

  const pills = useMemo(() => {
    const all = { key: "", label: "All", count: offerings.length };
    const cats = categories.map((c) => ({
      key: c.category_id,
      label: c.name,
      count: offerings.filter((o) => o.category_id === c.category_id).length,
    }));
    const uncategorized = offerings.filter((o) => !o.category_id).length;
    return uncategorized > 0
      ? [all, ...cats, { key: "__uncategorized__", label: "Uncategorized", count: uncategorized }]
      : [all, ...cats];
  }, [offerings, categories]);

  function openNew() {
    setEditingOffering({
      offering_id: "",
      category_id: null,
      name: "",
      description: "",
      default_duration_minutes: 60,
      is_active: true,
      is_self_bookable: false,
      requires_quote: false,
      prices: [],
    });
  }

  const columns: Column<Offering>[] = [
    {
      key: "name",
      header: "Service",
      sortable: true,
      sortAccessor: (o) => o.name.toLowerCase(),
      render: (o) => (
        <div>
          <div className="font-medium text-oliver-teal">{o.name}</div>
          {o.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{o.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      sortAccessor: (o) => o.category_name?.toLowerCase() ?? "",
      render: (o) => o.category_name
        ? (
          <span
            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
            style={o.category_color ? { backgroundColor: `${o.category_color}1A`, color: o.category_color } : {}}
          >
            {o.category_name}
          </span>
        )
        : <span className="text-xs text-slate-400">—</span>,
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      render: (o) => o.default_duration_minutes ? `${o.default_duration_minutes} min` : "—",
    },
    {
      key: "pricing",
      header: "Pricing",
      render: (o) => {
        const ps = o.prices ?? [];
        if (!ps.length) return <span className="text-xs text-amber-600">No prices</span>;
        const dflt = ps.find((p) => p.is_default) ?? ps[0];
        const more = ps.length > 1 ? <span className="text-xs text-slate-500"> · +{ps.length - 1} more</span> : null;
        return <span className="text-sm">{fmtPrice(dflt)}{more}</span>;
      },
    },
    {
      key: "flags",
      header: "Flags",
      render: (o) => (
        <div className="flex gap-1 flex-wrap">
          {o.is_self_bookable && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Self-bookable</span>}
          {o.requires_quote && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200">Quote required</span>}
          {!o.stripe_product_id && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ring-1 ring-slate-200">Stripe pending</span>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => <StatusBadge status={o.is_active ? "active" : "inactive"} />,
    },
  ];

  return (
    <OliverPageWrapper title="Service Catalog" subtitle="Tenant-defined services" error={error} loading={loading}>
      <PageHeader
        title="Service Catalog"
        subtitle="Define what your business sells. Each offering syncs to a Stripe Product on your connected account."
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowCategoryManager(true)}>Manage categories</Button>
            <Button variant="primary" onClick={openNew}>+ Add offering</Button>
          </>
        }
      />

      {!offerings.length ? (
        <EmptyState
          title="No services defined yet"
          description="Add your first service to start sending quotes and invoices. Each service can have one or more pricing variants — one-time or recurring."
          action={
            <div className="flex gap-2 justify-center">
              <Button variant="ghost" onClick={() => setShowCategoryManager(true)}>+ Add category first</Button>
              <Button variant="primary" onClick={openNew}>+ Add offering</Button>
            </div>
          }
        />
      ) : (
        <>
          <FilterBar
            pills={pills}
            activePill={activeCategoryId}
            onPillChange={setActiveCategoryId}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search services…"
          />
          <DataTable
            rows={filteredOfferings}
            columns={columns}
            rowKey={(o) => o.offering_id}
            onRowClick={(o) => setEditingOffering(o)}
          />
        </>
      )}

      {editingOffering && (
        <OfferingDrawer
          offering={editingOffering}
          categories={categories}
          onClose={() => setEditingOffering(null)}
          onSaved={() => { setEditingOffering(null); reload(); }}
          api={{ post, patch, del }}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerDrawer
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onSaved={() => reload()}
          api={{ post, patch, del }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Offering drawer (create + edit + manage prices)
// ──────────────────────────────────────────────────────────────────────────────

interface OfferingDrawerProps {
  offering: Offering;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  api: {
    post: <T>(path: string, body?: unknown) => Promise<T>;
    patch: <T>(path: string, body: unknown) => Promise<T>;
    del: <T>(path: string) => Promise<T>;
  };
}

function OfferingDrawer({ offering, categories, onClose, onSaved, api }: OfferingDrawerProps) {
  const [draft, setDraft] = useState(offering);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const isNew = !draft.offering_id;

  async function save() {
    setErr(null);
    if (!draft.name.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description ?? null,
        categoryId: draft.category_id || null,
        defaultDurationMinutes: draft.default_duration_minutes ?? null,
        isSelfBookable: draft.is_self_bookable,
        requiresQuote: draft.requires_quote,
        imageUrl: draft.image_url ?? null,
        isActive: draft.is_active,
      };
      if (isNew) await api.post("/catalog/offerings", body);
      else await api.patch(`/catalog/offerings/${draft.offering_id}`, body);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addPrice(p: { pricingModel: "one_time" | "recurring"; unitAmount: number; recurringInterval?: string; recurringIntervalCount?: number; trialDays?: number; label?: string; isDefault?: boolean; }) {
    if (isNew) { setErr("Save the offering first, then add prices"); return; }
    await api.post(`/catalog/offerings/${draft.offering_id}/prices`, p);
    setShowAddPrice(false);
    onSaved();
  }

  async function togglePriceDefault(price: PriceVariant) {
    await api.patch(`/catalog/prices/${price.price_id}`, { isDefault: !price.is_default });
    onSaved();
  }
  async function archivePrice(price: PriceVariant) {
    if (!confirm("Archive this price? Stripe Prices can't be deleted — this hides it from new sales.")) return;
    await api.patch(`/catalog/prices/${price.price_id}`, { isActive: false });
    onSaved();
  }

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={isNew ? "New offering" : draft.name}
      subtitle={isNew ? "Add a service your business sells" : "Edit details and pricing"}
      width="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {isNew ? "Create offering" : "Save changes"}
          </Button>
        </>
      }
    >
      {err && <div className="mb-4 rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-2 text-sm text-red-800">{err}</div>}

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Service name" required>
            <input
              type="text" value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Category">
            <select
              value={draft.category_id ?? ""}
              onChange={(e) => setDraft({ ...draft, category_id: e.target.value || null })}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm">
              <option value="">— Uncategorized —</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Default duration (minutes)">
            <input
              type="number" min="0" step="5"
              value={draft.default_duration_minutes ?? ""}
              onChange={(e) => setDraft({ ...draft, default_duration_minutes: e.target.value ? Number(e.target.value) : null })}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Image URL">
            <input
              type="url" value={draft.image_url ?? ""}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value || null })}
              placeholder="https://…"
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Description" full>
            <textarea
              rows={3} value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <Toggle label="Self-bookable by customers" checked={draft.is_self_bookable}
            onChange={(v) => setDraft({ ...draft, is_self_bookable: v })} />
          <Toggle label="Requires quote first" checked={draft.requires_quote}
            onChange={(v) => setDraft({ ...draft, requires_quote: v })} />
          <Toggle label="Active" checked={draft.is_active}
            onChange={(v) => setDraft({ ...draft, is_active: v })} />
        </div>

        {!isNew && (
          <section className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-oliver-teal">Pricing variants</h3>
                <p className="text-xs text-slate-500 mt-0.5">One-time or recurring. Stripe Prices are immutable — to change an amount, archive the old and add a new.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setShowAddPrice(true)}>+ Add price</Button>
            </div>

            {(draft.prices ?? []).length === 0 ? (
              <div className="text-sm text-slate-500 italic py-3">No price variants yet — add one to enable selling this service.</div>
            ) : (
              <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
                {(draft.prices ?? []).map((p) => (
                  <div key={p.price_id} className={`px-3 py-2 flex items-center gap-3 ${!p.is_active ? "opacity-50" : ""}`}>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">
                        {fmtPrice(p)}
                        {p.label && <span className="ml-2 text-xs text-slate-500">({p.label})</span>}
                      </div>
                      {p.trial_days ? <div className="text-xs text-slate-500">{p.trial_days}-day trial</div> : null}
                    </div>
                    {p.is_default && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-oliver-gold-100 text-oliver-gold-700 ring-1 ring-oliver-gold-300">DEFAULT</span>}
                    {p.stripe_price_id && <span className="text-[10px] font-mono text-slate-400">{p.stripe_price_id}</span>}
                    {!p.is_default && p.is_active && (
                      <button onClick={() => togglePriceDefault(p)} className="text-xs text-slate-500 hover:text-oliver-teal">Make default</button>
                    )}
                    {p.is_active && (
                      <button onClick={() => archivePrice(p)} className="text-xs text-red-500 hover:text-red-700">Archive</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showAddPrice && (
              <AddPriceForm onSubmit={addPrice} onCancel={() => setShowAddPrice(false)} />
            )}
          </section>
        )}
      </div>
    </DetailDrawer>
  );
}

function AddPriceForm({ onSubmit, onCancel }: { onSubmit: (p: { pricingModel: "one_time" | "recurring"; unitAmount: number; recurringInterval?: string; recurringIntervalCount?: number; trialDays?: number; label?: string; isDefault?: boolean; }) => void; onCancel: () => void; }) {
  const [model, setModel] = useState<"one_time" | "recurring">("one_time");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<"day" | "week" | "month" | "year">("month");
  const [intervalCount, setIntervalCount] = useState("1");
  const [trial, setTrial] = useState("");
  const [label, setLabel] = useState("");
  const [setDefault, setSetDefault] = useState(false);

  return (
    <div className="mt-3 rounded-lg ring-1 ring-oliver-gold-300 bg-oliver-gold-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setModel("one_time")}
          className={`px-3 py-1 text-xs rounded-full font-medium ${model === "one_time" ? "bg-oliver-teal text-white" : "bg-white text-slate-600 ring-1 ring-gray-300"}`}>
          One-time
        </button>
        <button onClick={() => setModel("recurring")}
          className={`px-3 py-1 text-xs rounded-full font-medium ${model === "recurring" ? "bg-oliver-teal text-white" : "bg-white text-slate-600 ring-1 ring-gray-300"}`}>
          Recurring
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (USD)" required>
          <input type="number" min="0" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="Label (optional)">
          <input type="text" value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Monthly Pro" className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
        </Field>
        {model === "recurring" && (
          <>
            <Field label="Billing interval">
              <select value={interval} onChange={(e) => setInterval(e.target.value as never)}
                className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </Field>
            <Field label="Every N intervals">
              <input type="number" min="1" value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
                className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
            </Field>
            <Field label="Trial days (optional)">
              <input type="number" min="0" value={trial}
                onChange={(e) => setTrial(e.target.value)}
                className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
            </Field>
          </>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={setDefault} onChange={(e) => setSetDefault(e.target.checked)} />
        Set as default price for this offering
      </label>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={() => onSubmit({
          pricingModel: model,
          unitAmount: Number(amount),
          recurringInterval: model === "recurring" ? interval : undefined,
          recurringIntervalCount: model === "recurring" ? Number(intervalCount) : undefined,
          trialDays: trial ? Number(trial) : undefined,
          label: label || undefined,
          isDefault: setDefault,
        })}>Add price</Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Category manager
// ──────────────────────────────────────────────────────────────────────────────

function CategoryManagerDrawer({ categories, onClose, onSaved, api }: { categories: Category[]; onClose: () => void; onSaved: () => void; api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T>; del: <T>(p: string) => Promise<T>; }; }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#1A3A4A");

  async function add() {
    if (!newName.trim()) return;
    await api.post("/catalog/categories", { name: newName.trim(), color: newColor });
    setNewName("");
    onSaved();
  }
  async function rename(c: Category, name: string) {
    await api.patch(`/catalog/categories/${c.category_id}`, { name });
    onSaved();
  }
  async function recolor(c: Category, color: string) {
    await api.patch(`/catalog/categories/${c.category_id}`, { color });
    onSaved();
  }
  async function remove(c: Category) {
    if (!confirm(`Delete category "${c.name}"? Offerings in this category will become uncategorized.`)) return;
    await api.del(`/catalog/categories/${c.category_id}`);
    onSaved();
  }

  return (
    <DetailDrawer open onClose={onClose} title="Manage categories" width="md">
      <div className="space-y-4">
        <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
          {categories.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500 italic">No categories yet — add one below.</div>
          )}
          {categories.map((c) => (
            <div key={c.category_id} className="px-3 py-2 flex items-center gap-2">
              <input type="color" value={c.color || "#1A3A4A"}
                onChange={(e) => recolor(c, e.target.value)}
                className="h-8 w-10 rounded ring-1 ring-gray-300" />
              <input type="text" defaultValue={c.name}
                onBlur={(e) => { if (e.target.value !== c.name) rename(c, e.target.value); }}
                className="flex-1 rounded ring-1 ring-gray-300 px-2 py-1 text-sm" />
              <button onClick={() => remove(c)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-slate-50 ring-1 ring-gray-200 p-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Add a category</div>
          <div className="flex items-center gap-2">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              className="h-8 w-10 rounded ring-1 ring-gray-300" />
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Cleaning, Repairs, Design"
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="flex-1 rounded ring-1 ring-gray-300 px-2 py-1 text-sm" />
            <Button size="sm" variant="primary" onClick={add} disabled={!newName.trim()}>Add</Button>
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tiny form helpers
// ──────────────────────────────────────────────────────────────────────────────

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${full ? "col-span-2" : ""}`}>
      <span className="text-slate-700 font-medium">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="rounded text-oliver-teal focus:ring-oliver-gold" />
      {label}
    </label>
  );
}
