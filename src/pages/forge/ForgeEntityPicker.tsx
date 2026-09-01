/**
 * ForgeEntityPicker — choose a related record by NAME.
 *
 * Entity reference fields used to render a bare number box labelled
 * "Record ID": to attach a service to a client you had to know that the client
 * was number 147. The old system let you pick from a list, so this was a
 * straight regression against the thing being replaced.
 *
 * Searches SERVER-SIDE as you type, and stores the id. The chosen record is
 * shown by name, including when the value was pre-filled from the record you
 * opened the form from.
 *
 * It used to fetch `pageSize: 500` once and filter that array locally. The list
 * route caps pageSize at 200 (routes/entities.js) and returns the cap silently,
 * so the picker only ever held the first 200 rows in default sort order and
 * anything past that could not be chosen AT ALL. For MS Moments that was 99 of
 * 299 providers and 83 of 283 clients — a third of their records, unselectable,
 * with no error and no empty state to hint at it. It surfaced when someone added
 * a provider called "Teka Medulan", position 262 by name, and could not then
 * attach it to a client.
 *
 * So: the SERVER does the matching, and the picker then pages until it holds
 * EVERY match rather than the first page of them. A picker that shows some of
 * the answers is the same defect wearing a smaller number — 50 instead of 200 —
 * and it fails silently in exactly the same way. The response carries `total`,
 * so "did I get all of it" is a fact here rather than an assumption; if a set is
 * ever large enough to hit the safety bound, the list says so out loud instead
 * of quietly ending.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getEntityRow, listEntity, type EntityKey } from '../../lib/forgeApi';
import { FORGE_ENTITIES } from './forgeConfig';
import { useForgeApi } from './useForge';

type Row = Record<string, unknown>;

export function ForgeEntityPicker({
  entity, value, onChange, className,
}: { entity: EntityKey; value: unknown; onChange: (v: unknown) => void; className?: string }) {
  const cfg = FORGE_ENTITIES[entity];
  const { ready, withParams } = useForgeApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /* True only if a set was so large we stopped before the end. It has never
     been true in practice; it exists so that if it ever is, the user is told
     rather than shown a list that quietly stops. */
  const [truncated, setTruncated] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /* Debounced so typing does not fire a request per keystroke, but the search
     itself is the server's job — see the note at the top of this file. */
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setTruncated(false);
      withParams(async (p) => {
        const PAGE = 200;          // the route's cap; asking for more returns this silently
        const BOUND = 5000;        // a stop, not a limit — see setTruncated below
        const q = query.trim() || undefined;
        const first = await listEntity<Row>(p, entity, { pageSize: PAGE, q });
        const all = [...first.data];
        const total = Number(first.total ?? all.length);
        for (let page = 2; all.length < total && all.length < BOUND; page++) {
          const next = await listEntity<Row>(p, entity, { pageSize: PAGE, q, page });
          if (!next.data.length) break;
          all.push(...next.data);
        }
        return { all, total };
      })
        .then(({ all, total }) => {
          if (cancelled) return;
          setRows(all);
          setTruncated(total > all.length);
        })
        .catch((e) => console.error(e))
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 200 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [ready, withParams, entity, query]);

  /* The selected record may not be in the current search results — you picked
     it, then typed something else, or the form opened with it pre-filled. Fetch
     it by id so the box shows a NAME rather than falling back to "#316". */
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  useEffect(() => {
    if (!ready || !value) { setSelectedRow(null); return; }
    let cancelled = false;
    withParams((p) => getEntityRow<Row>(p, entity, value as string | number))
      .then((r) => { if (!cancelled) setSelectedRow((r as { data?: Row })?.data ?? (r as Row)); })
      .catch(() => { if (!cancelled) setSelectedRow(null); });
    return () => { cancelled = true; };
  }, [ready, withParams, entity, value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const labelOf = (r: Row) => String(r[cfg.primaryField] ?? r[cfg.pk] ?? '');
  const selected = useMemo(
    () => rows.find((r) => String(r[cfg.pk]) === String(value ?? '')) ?? selectedRow ?? undefined,
    [rows, value, cfg.pk, selectedRow]
  );

  /* No local filtering — the server returned exactly what matched. Filtering
     again here would re-introduce the same bug in miniature: the API searches
     more fields than the display label, so a row matched on city or contact
     would be dropped for not containing the typed text in its NAME. */
  const matches = rows;

  return (
    <div ref={boxRef} className="relative">
      <input
        className={className}
        value={open ? query : (selected ? labelOf(selected) : (value ? `#${String(value)}` : ''))}
        placeholder={loading ? 'Loading…' : `Search ${cfg.title.toLowerCase()}…`}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700"
          onMouseDown={(e) => { e.preventDefault(); onChange(''); setQuery(''); }}
        >
          ×
        </button>
      ) : null}

      {open && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">
              {loading ? 'Loading…' : 'No matches'}
            </li>
          ) : (<>
            {matches.length > 20 && (
              <li className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">
                {truncated
                  ? `Showing ${matches.length} — narrow your search to see the rest`
                  : `${matches.length} ${matches.length === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}`}
              </li>
            )}
            {matches.map((r) => (
            <li key={String(r[cfg.pk])}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(r[cfg.pk]);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {labelOf(r)}
              </button>
            </li>
            ))}
          </>)}
        </ul>
      )}
    </div>
  );
}

export default ForgeEntityPicker;
