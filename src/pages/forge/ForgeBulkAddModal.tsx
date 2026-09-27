/**
 * ForgeBulkAddModal — type (or paste) many records at once.
 *
 * The form is right for one record and wrong for twenty: open, fill, save,
 * close, open again. This is the same fields as a grid, so a volunteer
 * coordinator with a page of names can work down it, and so a block copied
 * straight out of Excel lands in one paste.
 *
 * It writes through the IMPORT route rather than posting one record at a time:
 * the rules that make an import safe — a blank cell means "leave it", a row that
 * cannot be stored names its own column, everything lands in the activity log —
 * are the rules that should apply here too, and one mechanism cannot drift from
 * itself.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { IadmModal } from '../../components/IadmModal';
import { commitImport, type EntityKey, type ImportResult, type ImportRow } from '../../lib/forgeApi';
import { Button } from './ForgeLayout';
import { FORGE_ENTITIES, humanizeValue, type FieldDef } from './forgeConfig';
import { describeError, useForgeApi, useForgeLookups } from './useForge';

const START_ROWS = 5;
/** Columns a grid cell can carry. A picker or an address block needs the form. */
const GRID_TYPES = new Set(['text', 'lookup', 'money', 'number', 'date']);

export function ForgeBulkAddModal({
  entity, open, onClose, onSaved,
}: {
  entity: EntityKey;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cfg = FORGE_ENTITIES[entity];
  const { withParams } = useForgeApi();
  const { lookups } = useForgeLookups();

  /* The fields the form would show, minus the ones a single cell cannot hold.
     Required fields first so the column you must fill is the one you land in. */
  const columns: FieldDef[] = useMemo(() => {
    const usable = cfg.fields.filter((f) => f.inForm !== false && GRID_TYPES.has(f.type));
    return [...usable].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required))).slice(0, 7);
  }, [cfg]);

  const blank = useCallback(() => columns.map(() => ''), [columns]);
  const [rows, setRows] = useState<string[][]>(() => Array.from({ length: START_ROWS }, () => columns.map(() => '')));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const reset = useCallback(() => {
    setRows(Array.from({ length: START_ROWS }, () => blank()));
    setError(null); setResult(null);
  }, [blank]);

  const close = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, reset, onClose]);

  const setCell = (r: number, c: number, v: string) =>
    setRows((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));

  const addRow = () => setRows((prev) => [...prev, blank()]);

  /* Tab off the last cell of the last row starts another row, so a long list is
     typed without ever reaching for the mouse. */
  const onKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === 'Tab' && !e.shiftKey && r === rows.length - 1 && c === columns.length - 1) {
      e.preventDefault();
      addRow();
      setTimeout(() => cellRefs.current[`${r + 1}:0`]?.focus(), 0);
    }
  };

  /* A block pasted from Excel arrives as TSV. Fill across and down from the cell
     the paste started in, growing the grid to fit — anything else silently drops
     the rows past the bottom of it. */
  const onPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || !/[\t\r\n]/.test(text)) return;     // a single value pastes normally
    e.preventDefault();
    const block = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
    setRows((prev) => {
      const next = prev.map((row) => [...row]);
      while (next.length < r + block.length) next.push(blank());
      block.forEach((line, ri) => line.forEach((val, ci) => {
        if (c + ci < columns.length) next[r + ri][c + ci] = val.trim();
      }));
      return next;
    });
  };

  /** Rows with something in them. Empty rows are scaffolding, never records. */
  const filled = useMemo(
    () => rows.filter((row) => row.some((cell) => cell.trim() !== '')),
    [rows]
  );
  const missingRequired = useMemo(() => {
    const required = columns.map((f, i) => ({ i, f })).filter((x) => x.f.required);
    return filled.filter((row) => required.some((x) => !row[x.i].trim())).length;
  }, [filled, columns]);

  const save = useCallback(async () => {
    if (busy || !filled.length) return;
    setBusy(true); setError(null);
    try {
      const payload: ImportRow[] = filled.map((row) => {
        const out: ImportRow = {};
        columns.forEach((f, i) => { const v = row[i].trim(); if (v !== '') out[f.key] = v; });
        return out;
      });
      const r = await withParams((p) => commitImport(p, entity, payload));
      setResult(r);
      onSaved();
      if (r.failed === 0) setRows(Array.from({ length: START_ROWS }, () => blank()));
    } catch (e) {
      setError(describeError(e, `these ${cfg.title.toLowerCase()}`));
      console.error(e);
    } finally { setBusy(false); }
  }, [busy, filled, columns, withParams, entity, onSaved, blank, cfg.title]);

  return (
    <IadmModal
      open={open}
      onClose={close}
      product="forge"
      eyebrow={`HESTIA · ${cfg.title.toUpperCase()}`}
      title={`Bulk add ${cfg.title.toLowerCase()}`}
      subtitle="Tab across the fields — Tab on the last one starts a new row. Paste a block from Excel and it fills in. Nothing saves until you press Save."
      size="info"
      z={60}
      footer={(
        <>
          <button
            type="button"
            onClick={addRow}
            disabled={busy}
            className="mr-auto text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
          >
            Add another row
          </button>
          <Button onClick={close} disabled={busy}>{result ? 'Done' : 'Cancel'}</Button>
          <Button variant="primary" onClick={save} disabled={busy || !filled.length}>
            {busy ? 'Saving…'
              : `Save ${filled.length || ''} ${filled.length === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}`.replace('  ', ' ')}
          </Button>
        </>
      )}
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}

        {result && (
          <div className={`rounded-lg border px-3 py-2 ${result.failed
            ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
          >
            <div className="font-medium">
              {result.created.toLocaleString()} added
              {result.updated > 0 && ` · ${result.updated.toLocaleString()} matched an existing record and were updated`}
              {result.failed > 0 && ` · ${result.failed.toLocaleString()} could not be saved`}
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {result.errors.slice(0, 20).map((e) => <li key={e.index}>Row {e.index + 1}: {e.message}</li>)}
              </ul>
            )}
          </div>
        )}

        {missingRequired > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {missingRequired} row{missingRequired === 1 ? '' : 's'} still need
            {missingRequired === 1 ? 's' : ''} {columns.filter((f) => f.required).map((f) => f.label).join(' and ')}.
            Those rows will be reported back rather than saved.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-8 px-2 py-2 text-left font-semibold">#</th>
                {columns.map((f) => (
                  <th key={f.key} className="px-2 py-2 text-left font-semibold">
                    {f.label}{f.required && <span className="text-red-500"> *</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, r) => (
                <tr key={r}>
                  <td className="px-2 py-1 text-slate-400">{r + 1}</td>
                  {columns.map((f, c) => (
                    <td key={f.key} className="px-1 py-1">
                      {f.type === 'lookup' ? (
                        <select
                          ref={(el) => { cellRefs.current[`${r}:${c}`] = el; }}
                          value={row[c]}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, r, c)}
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          aria-label={`${f.label}, row ${r + 1}`}
                        >
                          <option value="">—</option>
                          {(lookups[f.lookup ?? '']?.values ?? []).map((v) => (
                            <option key={v.id} value={v.value}>{humanizeValue(v.value)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          ref={(el) => { cellRefs.current[`${r}:${c}`] = el; }}
                          value={row[c]}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, r, c)}
                          onPaste={(e) => onPaste(e, r, c)}
                          type={f.type === 'date' ? 'date' : 'text'}
                          inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined}
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          aria-label={`${f.label}, row ${r + 1}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          A row that matches an existing {cfg.singular.toLowerCase()} — same email, or the same
          name — updates that record instead of adding a second one.
        </p>
      </div>
    </IadmModal>
  );
}

export default ForgeBulkAddModal;
