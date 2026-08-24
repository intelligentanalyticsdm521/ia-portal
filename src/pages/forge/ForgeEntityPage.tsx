/**
 * ForgeEntityPage — the one list/create/edit screen that serves every HESTIA
 * entity, driven by forgeConfig. The legacy app had thirteen near-identical
 * PHP files; this is that idea with types, real pagination and a proper form.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  archiveEntityRow, createEntityRow, listEntity, updateEntityRow,
  type EntityKey, type ListResult,
} from '../../lib/forgeApi';
import { Button, Card, EmptyState, ForgeLayout, Pill, statusTone } from './ForgeLayout';
import { FORGE_ENTITIES, cellValue, humanizeValue, type FieldDef } from './forgeConfig';
import { describeError, useDebounced, useForgeApi, useForgeLookups } from './useForge';

const PAGE_SIZE = 25;

export function ForgeEntityPage({ entity, detailBase }: { entity: EntityKey; detailBase?: string }) {
  const cfg = FORGE_ENTITIES[entity];
  const detailHref = (id: string | number) =>
    detailBase ? `${detailBase}/${id}` : cfg.detailRoute?.(id);
  const { ready, withParams } = useForgeApi();
  const { lookups } = useForgeLookups();

  const [result, setResult] = useState<ListResult | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  // Seed filters from the URL so a link can point at a SUBSET, not just a
  // screen. The overview's "Needs review" tile links to
  // .../services?needs_review=1 and must land on those rows — a tile that
  // counts three records and then shows all ninety is worse than not
  // linking at all. Only keys the entity actually declares are accepted, so
  // a stray query string cannot inject a filter the API will reject.
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    const known = new Set(FORGE_ENTITIES[entity].fields.map((f) => f.key));
    searchParams.forEach((value, key) => { if (known.has(key)) seeded[key] = value; });
    return seeded;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const q = useDebounced(search);
  const listCols = useMemo(() => cfg.fields.filter((f) => f.inList), [cfg]);
  const filterable = useMemo(() => cfg.fields.filter((f) => f.type === 'lookup'), [cfg]);

  useEffect(() => { setPage(1); }, [q, includeArchived, filters, entity]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    withParams((p) => listEntity(p, entity, {
      page, pageSize: PAGE_SIZE, q: q || undefined,
      includeArchived: includeArchived || undefined, ...filters,
    }))
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((err) => { if (!cancelled) setError(describeError(err, cfg.title.toLowerCase())); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, entity, page, q, includeArchived, filters, refreshKey, cfg.title]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const save = useCallback(async (values: Record<string, unknown>, id?: string | number) => {
    await withParams(async (p) => {
      if (id) { await updateEntityRow(p, entity, id, values); return; }
      await createEntityRow(p, entity, values);
    });
    setCreating(false);
    setEditing(null);
    refresh();
  }, [withParams, entity, refresh]);

  const toggleArchive = useCallback(async (row: Record<string, unknown>) => {
    const id = row[cfg.pk] as string | number;
    await withParams((p) => archiveEntityRow(p, entity, id, Boolean(row.is_archived)));
    refresh();
  }, [withParams, entity, cfg.pk, refresh]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <ForgeLayout
      title={cfg.title}
      subtitle={cfg.subtitle}
      error={error}
      actions={<Button variant="primary" onClick={() => setCreating(true)}>New {cfg.singular}</Button>}
    >
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px] text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${cfg.title.toLowerCase()}…`}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 shadow-sm"
            />
          </label>

          {filterable.map((field) => (
            <label key={field.key} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {field.label}
              <select
                value={filters[field.key] ?? ''}
                onChange={(e) => setFilters((f) => {
                  const next = { ...f };
                  if (e.target.value) next[field.key] = e.target.value; else delete next[field.key];
                  return next;
                })}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800 shadow-sm"
              >
                <option value="">All</option>
                {(lookups[field.lookup ?? '']?.values ?? []).map((v) => (
                  <option key={v.id} value={v.value}>{humanizeValue(v.value)}</option>
                ))}
              </select>
            </label>
          ))}

          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
      </Card>

      <Card
        title={result ? `${result.total.toLocaleString()} ${result.total === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}` : cfg.title}
        action={totalPages > 1 ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
            <span>Page {page} of {totalPages}</span>
            <Button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        ) : undefined}
      >
        {loading && !result ? (
          <EmptyState>Loading…</EmptyState>
        ) : !result?.data.length ? (
          <EmptyState>No {cfg.title.toLowerCase()} match this view.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {listCols.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => {
                  const id = row[cfg.pk] as string | number;
                  const archived = Boolean(row.is_archived);
                  return (
                    <tr key={String(id)} className={`border-b border-slate-100 ${archived ? 'opacity-60' : ''}`}>
                      {listCols.map((f, i) => (
                        <td key={f.key} className={`px-3 py-2 text-slate-700 ${f.width ?? ''}`}>
                          <span className="flex flex-wrap items-center gap-2">
                            {i === 0 && detailHref(id) ? (
                              <Link to={detailHref(id) as string} className="font-medium text-slate-900 hover:underline">
                                {cellValue(row, f)}
                              </Link>
                            ) : f.type === 'lookup' && f.lookup?.includes('status') ? (
                              <Pill tone={statusTone(row[f.key] as string)}>{cellValue(row, f)}</Pill>
                            ) : (
                              <span>{cellValue(row, f)}</span>
                            )}
                            {i === 0 && archived && <Pill>Archived</Pill>}
                            {i === 0 && Boolean(row.needs_review) && <Pill tone="amber">Needs review</Pill>}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button onClick={() => setEditing(row)}>Edit</Button>
                          <Button variant={archived ? 'secondary' : 'danger'} onClick={() => toggleArchive(row)}>
                            {archived ? 'Restore' : 'Archive'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <EntityForm
          /* A NEW component instance per record. EntityForm seeds its fields
             from `row` in a useState initializer, which React runs only on
             mount — so any path that reuses the instance leaves the previous
             (or empty) values on screen. That is how the edit modal came up
             blank. The key makes reuse impossible; the effect inside the form
             is the second belt. */
          key={editing ? `edit-${String(editing[cfg.pk])}` : 'new'}
          cfg={cfg}
          row={editing}
          lookups={lookups}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSave={save}
        />
      )}
    </ForgeLayout>
  );
}

function EntityForm({ cfg, row, lookups, onCancel, onSave }: {
  cfg: typeof FORGE_ENTITIES[EntityKey];
  row: Record<string, unknown> | null;
  lookups: Record<string, { label: string; values: Array<{ id: number; value: string }> }>;
  onCancel: () => void;
  onSave: (values: Record<string, unknown>, id?: string | number) => Promise<void>;
}) {
  const formFields = cfg.fields.filter((f) => f.inForm);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of formFields) {
      const v = row?.[f.key];
      init[f.key] = f.type === 'date' && v ? String(v).slice(0, 10) : (v ?? '');
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-seed if `row` ever changes under a surviving instance. Belt and braces
  // alongside the key above — a blank edit form is not a cosmetic bug, it is a
  // save away from wiping a client's record.
  useEffect(() => {
    const next: Record<string, unknown> = {};
    for (const f of formFields) {
      const v = row?.[f.key];
      next[f.key] = f.type === 'date' && v ? String(v).slice(0, 10) : (v ?? '');
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  // Escape closes, matching every other modal in the portal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = async () => {
    const missing = formFields.find((f) => f.required && !String(values[f.key] ?? '').trim());
    if (missing) { setErr(`${missing.label} is required.`); return; }
    setSaving(true); setErr(null);
    try {
      await onSave(values, row ? (row[cfg.pk] as string | number) : undefined);
    } catch (e) {
      setErr(describeError(e, `this ${cfg.singular.toLowerCase()}`));
      console.error(e);
    } finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6"
      role="dialog"
      aria-modal="true"
      /* Backdrop click closes. onMouseDown, not onClick: a drag that STARTS on
         an input and ends on the backdrop (selecting text, say) fires a click
         on the backdrop and would otherwise discard the edit. */
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {row ? `Edit ${cfg.singular}` : `New ${cfg.singular}`}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {formFields.map((field) => (
            <FormField
              key={field.key}
              field={field}
              value={values[field.key]}
              lookups={lookups}
              onChange={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
            />
          ))}
        </div>
        {err && <div className="px-6 pb-2 text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : row ? 'Save changes' : `Create ${cfg.singular}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FormField({ field, value, lookups, onChange }: {
  field: FieldDef;
  value: unknown;
  lookups: Record<string, { label: string; values: Array<{ id: number; value: string }> }>;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {field.label}{field.required && <span className="text-red-500"> *</span>}
    </span>
  );
  const cls = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm';

  if (field.type === 'lookup') {
    const options = lookups[field.lookup ?? '']?.values ?? [];
    const current = String(value ?? '');
    return (
      <label className={field.type === 'lookup' ? '' : 'sm:col-span-2'}>
        {label}
        <select className={cls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {/* A <select> silently shows nothing when its value is not among the
              options, and the next save then writes that nothing back. If the
              record holds a value the list no longer contains — a lookup entry
              renamed or deactivated after the fact — keep it as an option so it
              stays visible and survives an unrelated edit. */}
          {current && !options.some((v) => v.value === current) && (
            <option value={current}>{humanizeValue(current)} (not in list)</option>
          )}
          {options.map((v) => (
            <option key={v.id} value={v.value}>{humanizeValue(v.value)}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'longtext') {
    return (
      <label className="sm:col-span-2">
        {label}
        <textarea className={cls} rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  const inputType = field.type === 'date' ? 'date' : (field.type === 'money' || field.type === 'number' || field.type === 'entity') ? 'number' : 'text';
  return (
    <label>
      {label}
      <input
        className={cls}
        type={inputType}
        step={field.type === 'money' ? '0.01' : undefined}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.type === 'entity' && (
        <span className="mt-1 block text-xs text-slate-400">Record ID</span>
      )}
    </label>
  );
}
