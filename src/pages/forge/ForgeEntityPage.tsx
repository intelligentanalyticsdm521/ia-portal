/**
 * ForgeEntityPage — the one list/create/edit screen that serves every HESTIA
 * entity, driven by forgeConfig. The legacy app had thirteen near-identical
 * PHP files; this is that idea with types, real pagination and a proper form.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Rows3, Upload } from 'lucide-react';
import { IadmModal } from '../../components/IadmModal';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  archiveEntityRow, createEntityRow, exportEntity, listEntity, updateEntityRow,
  type EntityKey, type ListResult,
} from '../../lib/forgeApi';
import { Button, Card, EmptyState, ForgeLayout, Pill, statusTone } from './ForgeLayout';
import {
  FORGE_ENTITIES, cellValue, humanizeValue, isNumericField, money, moneyExact, shortDate, type FieldDef,
} from './forgeConfig';
import { ForgeEntityPicker } from './ForgeEntityPicker';
import { ForgeExportButton } from './ForgeExportButton';
import { ForgeImportModal } from './ForgeImportModal';
import { ForgeBulkAddModal } from './ForgeBulkAddModal';
import { csvBlankIfDash, csvFilename, downloadCsv, toCsvText } from './forgeCsv';
import { ForgeRecordModal } from './ForgeRecordModal';
import { describeError, useDebounced, useForgeApi, useForgeLookups } from './useForge';

const PAGE_SIZE = 25;

export function ForgeEntityPage({ entity, detailBase }: { entity: EntityKey; detailBase?: string }) {
  const cfg = FORGE_ENTITIES[entity];
  /** Link for a foreign-key cell — the referenced record's own page. */
  const fkHref = (f: FieldDef, row: Record<string, unknown>) => {
    if (f.type !== 'entity' || !f.entity) return null;
    const fkId = row[f.key];
    if (fkId === null || fkId === undefined || fkId === '') return null;
    return FORGE_ENTITIES[f.entity].detailRoute?.(fkId as string | number) ?? null;
  };

  const detailHref = (id: string | number) =>
    detailBase ? `${detailBase}/${id}` : cfg.detailRoute?.(id);
  const { ready, withParams } = useForgeApi();
  const { lookups } = useForgeLookups();

  const [result, setResult] = useState<ListResult | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  /* Sorting. Blanks always sink server-side, in both directions — a column
     that is 74% populated otherwise puts a wall of dashes at one end and
     reads as broken rather than incomplete. */
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const toggleSort = (col: string) => setSort((cur) =>
    !cur || cur.col !== col ? { col, dir: 'asc' }
      : cur.dir === 'asc' ? { col, dir: 'desc' }
        : null);
  // Seed filters from the URL so a link can point at a SUBSET, not just a
  // screen. The overview's "Needs review" tile links to
  // .../services?needs_review=1 and must land on those rows — a tile that
  // counts three records and then shows all ninety is worse than not
  // linking at all. Only keys the entity actually declares are accepted, so
  // a stray query string cannot inject a filter the API will reject.
  const [searchParams, setSearchParams] = useSearchParams();
  /* The open record lives in the URL (?record=<id>), the way the OLIVER
     customer modal works: a link opens the right record and the back button
     closes it, without giving the record a second home of its own. */
  const openRecordId = searchParams.get('record');
  /* useCallback because `save` now depends on it — an unstable identity would
     rebuild the save handler on every keystroke in the search box. */
  const openRecord = useCallback((rid: string | number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', String(rid));
      return next;
    });
  }, [setSearchParams]);
  const closeRecord = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('record');
    setSearchParams(next);
  };
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    const known = new Set(FORGE_ENTITIES[entity].fields.map((f) => f.key));
    searchParams.forEach((value, key) => { if (known.has(key)) seeded[key] = value; });
    return seeded;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Said out loud after an export that could not hold everything — see below.
     Not an error: the file downloaded and is correct as far as it goes. */
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const q = useDebounced(search);
  const listCols = useMemo(() => cfg.fields.filter((f) => f.inList), [cfg]);
  const filterable = useMemo(() => cfg.fields.filter((f) => f.type === 'lookup'), [cfg]);

  useEffect(() => { setPage(1); }, [q, includeArchived, filters, sort, entity]);

  /* Drop the previous screen's rows the instant the entity changes.
     Without this the fetch effect set `result` but never cleared it, and the
     loading branch below is `loading && !result` — so Providers rendered the
     CLIENT rows still sitting in state, under the Providers heading and the
     Providers column headers. Worse than a flicker: the stale <tr>s all keyed
     on `row[cfg.pk]`, which is undefined for the wrong entity, so React saw
     duplicate keys, refused to reconcile them away and orphaned them into the
     DOM permanently — every nav click stacking another screen's rows on top.
     That is the "providers page is showing clients" report, and the
     mismatched cell counts in those ghost rows are also what made the action
     buttons appear at two different x positions in one column.
     The router now also keys this component per entity (ForgeSoftwareRouter),
     which remounts it; this is the second belt, for any caller that swaps
     `entity` on a surviving instance. */
  useEffect(() => { setResult(null); }, [entity]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    /* The notice belongs to the view that was exported. Changing the search,
       a filter or the sort makes a new view, and a warning about the last
       file would then be describing rows that are no longer on screen. */
    setNotice(null);
    withParams((p) => listEntity(p, entity, {
      page, pageSize: PAGE_SIZE, q: q || undefined,
      sort: sort ? `${sort.col} ${sort.dir}` : undefined,
      includeArchived: includeArchived || undefined, ...filters,
    }))
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((err) => { if (!cancelled) setError(describeError(err, cfg.title.toLowerCase())); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, entity, page, q, includeArchived, filters, sort, refreshKey, cfg.title]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  /* THE FILE IS THE LIST, NOT THE PAGE.
     A customer asked for their active volunteers so they could email them and
     there was no way to get the list out of the software at all. The 25 rows
     on screen are a window onto the answer, not the answer — so this sends the
     same search, filters, sort and show-archived to a route that pages nothing
     and returns every matching row.
     Columns are every field the entity declares, in config order, formatted by
     the same cellValue the table uses: a date reads "Sep 8, 2025" in the file
     because that is what it reads on screen, a lookup reads "Awaiting decision"
     rather than awaiting_decision, and money carries its currency. */
  const exportCsv = useCallback(async () => {
    const r = await withParams((p) => exportEntity(p, entity, {
      q: q || undefined,
      sort: sort ? `${sort.col} ${sort.dir}` : undefined,
      includeArchived: includeArchived || undefined, ...filters,
    }));
    /* The file's columns are the screen's fields with two deliberate
       differences. A period becomes its two real dates: a spreadsheet answers
       "everything ending before December" from an end column and cannot answer
       it from the text "Sep 8, 2025 – Dec 31, 2025". And money keeps its cents —
       the grid rounds to whole dollars to stay narrow, which is the right trade
       on screen and the wrong one in a file someone reconciles against a bank
       statement or files with a funder. */
    /* One column per COLUMN, not per field definition. A period is declared
       twice on purpose — once as the list's single "Period" cell and once as
       the form's Start and End — so expanding the period and then walking the
       rest of the fields wrote both dates twice, under two sets of headers. */
    const coveredByPeriod = new Set(
      cfg.fields.filter((f) => f.type === 'daterange' && f.endKey)
        .flatMap((f) => [f.key, f.endKey as string])
    );
    const columns = cfg.fields.flatMap((f) => {
      if (f.type === 'daterange' && f.endKey) {
        const endKey = f.endKey;
        return [
          { label: `${f.label} start`, cell: (row: Record<string, unknown>) => shortDate(row[f.key]) },
          { label: `${f.label} end`, cell: (row: Record<string, unknown>) => shortDate(row[endKey]) },
        ];
      }
      if (coveredByPeriod.has(f.key)) return [];
      return [{
        label: f.label,
        cell: (row: Record<string, unknown>) => (f.type === 'money' ? moneyExact(row[f.key]) : cellValue(row, f)),
      }];
    });
    downloadCsv(
      csvFilename(cfg.title),
      toCsvText(columns, r.data, (row, col) => csvBlankIfDash(col.cell(row)))
    );
    /* A file that quietly holds less than was asked for is the one failure mode
       nobody notices until they act on it, so it is stated in rows. */
    setNotice(
      r.truncated
        ? `This file holds ${r.data.length.toLocaleString()} rows — the export limit.${
          r.total > r.data.length ? ` ${r.total.toLocaleString()} rows match in total.` : ''
        } Narrow the list with the search box or a filter to get the rest.`
        : null
    );
  }, [withParams, entity, q, sort, includeArchived, filters, cfg]);

  const save = useCallback(async (values: Record<string, unknown>, id?: string | number) => {
    /* SHOW THE USER THE RECORD THEY JUST MADE.
       Saving used to close the form and refresh the list, and that was the end
       of it — on a screen with 313 providers across 13 pages, a new row lands
       wherever the sort puts it and is invisible. The first person to use this
       in production created a provider, could not find it, and emailed to ask
       whether it had worked. It had. Twice more the same day, including once by
       us. "Did that save?" is not a question the software should leave open.
       The id comes back from the POST, so open that record: it confirms the save,
       shows what was stored, and lands you where you would go next anyway. */
    const created = await withParams(async (p) => {
      if (id) { await updateEntityRow(p, entity, id, values); return null; }
      const r = await createEntityRow(p, entity, values);
      return r?.data?.[cfg.pk] ?? null;
    });
    setCreating(false);
    setEditing(null);
    refresh();
    if (created != null) openRecord(created);
  }, [withParams, entity, refresh, cfg.pk, openRecord]);

  const toggleArchive = useCallback(async (row: Record<string, unknown>) => {
    const id = row[cfg.pk] as string | number;
    await withParams((p) => archiveEntityRow(p, entity, id, Boolean(row.is_archived)));
    refresh();
  }, [withParams, entity, cfg.pk, refresh]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  /* The Actions column is pinned to the right edge of the scroll box (below),
     so Open/Edit/Archive are reachable however wide the table gets. Its
     left-edge shadow is the only cue that columns continue underneath it: this
     wrapper reserves ZERO layout height for a scrollbar (measured — the platform
     uses overlay scrollbars) and the page itself never scrolls sideways, so
     there is otherwise nothing on screen saying there is more to the right.
     Drawing that shadow when nothing is hidden would be a lie, so it is measured
     rather than always on. */
  const scrollBox = useRef<HTMLDivElement | null>(null);
  const [canScrollX, setCanScrollX] = useState(false);
  useEffect(() => {
    const el = scrollBox.current;
    if (!el) return;
    const measure = () => setCanScrollX(el.scrollWidth - el.clientWidth > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The table, not just the box: a column can get wider without the box
    // changing size at all, and that is exactly the case worth catching.
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [result, listCols]);

  return (
    <ForgeLayout
      title={cfg.title}
      subtitle={cfg.subtitle}
      error={error}
      /* Export · Import · Bulk add · New X — the same order, left to right, as
         SPARK Contacts. One header shape across the platform means a person who
         has learned one list screen has learned all of them. */
      actions={(
        <>
          <ForgeExportButton
            subject={`the ${cfg.title.toLowerCase()} export`}
            label={<><Download className="h-3.5 w-3.5" /> Export CSV</>}
            busyLabel={<><Download className="h-3.5 w-3.5" /> Preparing…</>}
            /* Nothing to write a file about — and the list has not arrived at
               all until `result` does. */
            disabled={!result || result.total === 0}
            onExport={exportCsv}
            onError={setError}
          />
          <Button onClick={() => setImporting(true)}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <Button onClick={() => setBulkAdding(true)}>
            <Rows3 className="h-3.5 w-3.5" /> Bulk add
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New {cfg.singular}
          </Button>
        </>
      )}
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

      {result?.summary && result.summary.tiles.length > 0 && (
        /* What this screen is FOR, in its own units. Clients counts people,
           Assistance counts money committed, Services counts arrangements in
           flight — the same chain measured three ways, and each screen is the
           only place its own number is true. A grid alone never says that.
           Unfiltered on purpose: this is the screen's identity, not a readout
           of whatever filter happens to be applied. */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {result.summary.tiles.map((t) => {
            const v = result.summary?.values?.[t.key];
            const warn = Boolean(t.warnIfAny) && Number(v ?? 0) > 0;
            return (
              <div
                key={t.key}
                className={`rounded-xl border px-4 py-3 ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? 'text-amber-800' : 'text-slate-900'}`}>
                  {t.money ? money(v) : Number(v ?? 0).toLocaleString()}
                </div>
                {t.hint && <div className="mt-0.5 text-xs text-slate-500">{t.hint}</div>}
              </div>
            );
          })}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

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
          /* -mx-6 lets the table use the card's padding as table padding
             instead of losing it: 48px of width back on every screen, which is
             most of a column. The first and last cells carry px-6 so the text
             still lines up with the card's own title. */
          <div ref={scrollBox} className="-mx-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {listCols.map((f, i) => {
                    const active = sort?.col === f.key;
                    const numeric = isNumericField(f);
                    return (
                      <th key={f.key} className={`px-2.5 py-2 ${i === 0 ? "pl-5" : ""} ${numeric ? "text-right" : ""}`}>
                        <button
                          type="button"
                          onClick={() => toggleSort(f.key)}
                          className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide ${active ? "text-slate-900" : "hover:text-slate-700"}`}
                          title={`Sort by ${f.label} — empty values always last`}
                        >
                          {f.label}
                          <span className="text-[10px] leading-none">
                            {active ? (sort?.dir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  {/* Pinned, and opaque, or the scrolled columns show through it. */}
                  <th className="sticky right-0 z-20 bg-white px-2.5 py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => {
                  const id = row[cfg.pk] as string | number;
                  const archived = Boolean(row.is_archived);
                  return (
                    <tr
                      key={String(id)}
                      /* The whole ROW opens this record. Four screens lead with
                         the record's own name and three lead with a foreign key
                         (a service row starts with the CLIENT), so "click the
                         name" could never be the rule everywhere. Clicking a
                         link or a button inside the row still does its own
                         thing — a client name goes to the client. */
                      onClick={(e) => {
                        const el = e.target as HTMLElement;
                        if (el.closest('a,button')) return;
                        openRecord(id);
                      }}
                      /* `group` so the pinned Actions cell can repaint itself on
                         row hover — it needs its own opaque background to hide
                         the columns sliding under it, which otherwise swallows
                         the row highlight on exactly the cell you are aiming at. */
                      className={`group cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${archived ? 'opacity-60' : ''}`}
                    >
                      {listCols.map((f, i) => {
                        const numeric = isNumericField(f);
                        const text = cellValue(row, f);
                        return (
                          <td
                            key={f.key}
                            /* align-middle + a fixed line height keeps every row
                               the same height whether a cell holds text, a dash
                               or a pill — mixed content was making the action
                               buttons sit at different heights down the column. */
                            className={`px-2.5 py-2 align-middle leading-6 text-slate-700 ${i === 0 ? "pl-5" : ""} ${
                              numeric ? "text-right tabular-nums" : ""
                            }`}
                          >
                            {/* The cap lives on this wrapper, not the <td>: under
                                `table-layout: auto` a max-width on the cell is a
                                suggestion, but a max-width on a block INSIDE it
                                really does cap the column's max-content width.
                                min-w-0 is what lets the value shrink far enough
                                to ellipsise inside a flex row. */}
                            <div
                              className={`flex items-center gap-2 ${numeric ? "ml-auto justify-end" : ""} ${f.maxW ?? "max-w-[150px]"}`}
                              title={numeric ? undefined : text}
                            >
                              {fkHref(f, row) ? (
                                /* A NAME links to the thing it names. On a
                                   service row the client column opens the
                                   CLIENT, not the service — that is what a
                                   reader expects, and the row keeps its own
                                   way in via the Open action. */
                                <Link to={fkHref(f, row) as string} className="min-w-0 truncate font-medium text-slate-900 hover:underline">
                                  {text}
                                </Link>
                              ) : i === 0 ? (
                                /* Not a foreign key — this cell IS the record's
                                   own name, so it opens the record modal. */
                                <button
                                  type="button"
                                  onClick={() => openRecord(id)}
                                  className="min-w-0 truncate font-medium text-slate-900 hover:underline"
                                >
                                  {text}
                                </button>
                              ) : f.type === 'derived' ? (
                              <Pill tone={String(cellValue(row, f)).startsWith('Receiving') ? 'green' : 'slate'}>{cellValue(row, f)}</Pill>
                            ) : f.type === 'lookup' && f.lookup?.includes('status') ? (
                                <Pill tone={statusTone(row[f.key] as string)}>{text}</Pill>
                              ) : (
                                <span className="min-w-0 truncate">{text}</span>
                              )}
                              {i === 0 && archived && <Pill>Archived</Pill>}
                            </div>
                          </td>
                        );
                      })}
                      <td
                        className={`sticky right-0 z-10 whitespace-nowrap bg-white px-2.5 py-2 pr-4 text-right align-middle group-hover:bg-slate-50 ${
                          canScrollX ? 'shadow-[-10px_0_10px_-10px_rgba(15,23,42,0.35)]' : ''
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button size="sm" onClick={() => openRecord(id)}>Open</Button>
                          {/* Below `sm` the pinned column would eat 224px of a
                              308px scroll box and leave 84px for the data. Only
                              Open stays; Edit and Archive are on the record,
                              which is where a phone should be doing this anyway. */}
                          <span className="hidden items-center gap-1.5 sm:inline-flex">
                            <Button size="sm" onClick={() => setEditing(row)}>Edit</Button>
                            <Button size="sm" variant={archived ? 'secondary' : 'danger'} onClick={() => toggleArchive(row)}>
                              {archived ? 'Restore' : 'Archive'}
                            </Button>
                          </span>
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

      {openRecordId && (
        <ForgeRecordModal
          key={`record-${openRecordId}`}
          entity={entity}
          recordId={openRecordId}
          onClose={closeRecord}
          /* Editing or archiving from inside the record used to leave the list
             behind it showing the values it had before. */
          onChanged={refresh}
        />
      )}

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

      <ForgeImportModal
        entity={entity}
        open={importing}
        onClose={() => setImporting(false)}
        /* Whatever landed is on screen before the modal is closed — an import
           that says "142 added" over an unchanged list reads as a lie. */
        onImported={refresh}
      />

      <ForgeBulkAddModal
        entity={entity}
        open={bulkAdding}
        onClose={() => setBulkAdding(false)}
        onSaved={refresh}
      />
    </ForgeLayout>
  );
}

export function EntityForm({ cfg, row, initial, lookups, onCancel, onSave }: {
  cfg: typeof FORGE_ENTITIES[EntityKey];
  row: Record<string, unknown> | null;
  /** Pre-filled values when CREATING — e.g. the client you opened this from,
   *  so adding assistance to a client does not make you pick them again. */
  initial?: Record<string, unknown>;
  lookups: Record<string, { label: string; values: Array<{ id: number; value: string }> }>;
  onCancel: () => void;
  onSave: (values: Record<string, unknown>, id?: string | number) => Promise<void>;
}) {
  const formFields = cfg.fields.filter((f) => f.inForm);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of formFields) {
      const v = row?.[f.key] ?? initial?.[f.key];
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
      const v = row?.[f.key] ?? initial?.[f.key];
      next[f.key] = f.type === 'date' && v ? String(v).slice(0, 10) : (v ?? '');
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

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
    /* The SAME box as ForgeRecordModal, because it is literally the same
       component. This form was a hand-rolled card at max-w-3xl whose BACKDROP
       scrolled, so a long form ran to 859px at 1440x900 — bottom edge at 907,
       past the fold — and scrolling down to reach Save took the heading and the
       Save button with it. It also meant pressing Edit inside the record modal
       visibly changed the size of the panel you were looking at, which is the
       complaint that started this pass, one layer down.
       z={70}: above the record modal (z 60) it opens from, which is in turn
       above the nav drawer (z-50). */
    <IadmModal
      open
      onClose={onCancel}
      product="forge"
      eyebrow={cfg.singular}
      title={row ? `Edit ${cfg.singular}` : `New ${cfg.singular}`}
      size="info"
      z={70}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {/* The validation message belongs beside the button that triggers it,
              not above the fold of a scrolling field grid. */}
          <span className="text-sm text-red-600">{err}</span>
          <div className="flex gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : row ? 'Save changes' : `Create ${cfg.singular}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
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
    </IadmModal>
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

  if (field.type === 'entity' && field.entity) {
    /* Pick a related record by NAME. This used to be a bare number box
       labelled "Record ID" — attaching a service to a client meant knowing
       the client was number 147. The old system let you choose from a list;
       asking someone to memorise ids was a regression, not a simplification. */
    return (
      <label>
        {label}
        <ForgeEntityPicker
          entity={field.entity}
          value={value}
          onChange={onChange}
          className={cls}
        />
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

    </label>
  );
}
