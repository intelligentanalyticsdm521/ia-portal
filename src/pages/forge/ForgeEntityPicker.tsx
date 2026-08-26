/**
 * ForgeEntityPicker — choose a related record by NAME.
 *
 * Entity reference fields used to render a bare number box labelled
 * "Record ID": to attach a service to a client you had to know that the client
 * was number 147. The old system let you pick from a list, so this was a
 * straight regression against the thing being replaced.
 *
 * Loads the referenced entity once, filters as you type, and stores the id.
 * The chosen record is shown by name, including when the value was pre-filled
 * from the record you opened the form from.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { listEntity, type EntityKey } from '../../lib/forgeApi';
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
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    // 500 covers every list in this product comfortably; the filter is local so
    // typing stays instant rather than firing a request per keystroke.
    withParams((p) => listEntity<Row>(p, entity, { pageSize: 500 }))
      .then((r) => { if (!cancelled) setRows(r.data); })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, entity]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const labelOf = (r: Row) => String(r[cfg.primaryField] ?? r[cfg.pk] ?? '');
  const selected = useMemo(
    () => rows.find((r) => String(r[cfg.pk]) === String(value ?? '')),
    [rows, value, cfg.pk]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => labelOf(r).toLowerCase().includes(q)) : rows;
    return list.slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);

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
          ) : matches.map((r) => (
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
        </ul>
      )}
    </div>
  );
}

export default ForgeEntityPicker;
