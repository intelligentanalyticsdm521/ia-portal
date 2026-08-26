/**
 * ForgeRecordModal — THE record view for HESTIA.
 *
 * Brandon, twice: clicking a record opens a MODAL with tabs, the way every
 * other platform's customer modal works — Overview / its children / Notes /
 * History — and you edit from inside it. I built pages instead the first time;
 * this is the thing that was asked for.
 *
 * One modal for every entity, driven by forgeConfig exactly like the list and
 * the form are. The tabs after Overview come from the entity's `related`
 * declaration, so a client shows Assistance and Services, a provider shows
 * Services delivered, a funder shows Funding applications — without a line of
 * per-entity code.
 *
 * Deep-linkable, like the OLIVER customer modal: the list URL carries
 * ?record=<id>, so a link still opens the right record and the back button
 * closes it. The old /<screen>/<id> URLs redirect into that, so nothing that
 * was already shared breaks.
 *
 * Styling matches the platform's .ptab pattern by hand rather than by reusing
 * it: those rules live under .arion-page, which carries ARION's whole design
 * system and would restyle the cards inside this modal.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addNote, createEntityRow, getActivity, getEntityRow, getNotes, listEntity, updateEntityRow,
  type ActivityRow, type EntityKey, type NoteRow,
} from '../../lib/forgeApi';
import { Button, EmptyState, Pill, statusTone } from './ForgeLayout';
import { FORGE_ENTITIES, cellValue, humanizeValue, shortDate } from './forgeConfig';
import { EntityForm } from './ForgeEntityPage';
import { describeError, useForgeApi, useForgeLookups } from './useForge';

type Row = Record<string, unknown>;

export function ForgeRecordModal({
  entity, recordId, onClose,
}: { entity: EntityKey; recordId: string; onClose: () => void }) {
  const cfg = FORGE_ENTITIES[entity];
  const { ready, withParams } = useForgeApi();
  const { lookups } = useForgeLookups();

  const [row, setRow] = useState<Row | null>(null);
  const [related, setRelated] = useState<Record<string, Row[]>>({});
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [tab, setTab] = useState('overview');
  const [noteText, setNoteText] = useState('');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState<{ entity: EntityKey; initial: Row } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const relatedDefs = useMemo(() => cfg.related ?? [], [cfg]);

  useEffect(() => {
    if (!ready || !recordId) return;
    let cancelled = false;
    setLoading(true); setError(null);
    Promise.all([
      withParams((p) => getEntityRow<Row>(p, entity, recordId)),
      withParams((p) => getNotes(p, entity, recordId)),
      withParams((p) => getActivity(p, entity, recordId)),
      ...relatedDefs.map((r) =>
        withParams((p) => listEntity<Row>(p, r.entity, { [r.foreignKey]: recordId, pageSize: 200 }))),
    ])
      .then(([r, n, a, ...rest]) => {
        if (cancelled) return;
        setRow(r); setNotes(n); setActivity(a);
        const map: Record<string, Row[]> = {};
        relatedDefs.forEach((def, i) => { map[def.entity] = (rest[i] as { data: Row[] })?.data ?? []; });
        setRelated(map);
      })
      .catch((err) => { if (!cancelled) setError(describeError(err, `this ${cfg.singular.toLowerCase()}`)); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, entity, recordId, refreshKey, relatedDefs, cfg]);

  // Escape closes — unless a nested form is open, which closes itself first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing || creating) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing, creating]);

  const saveRecord = useCallback(async (values: Row) => {
    await withParams((p) => updateEntityRow(p, entity, recordId, values));
    setEditing(false);
    setRefreshKey((k) => k + 1);
  }, [withParams, entity, recordId]);

  const createChild = useCallback(async (values: Row) => {
    if (!creating) return;
    await withParams((p) => createEntityRow(p, creating.entity, values));
    setCreating(null);
    setRefreshKey((k) => k + 1);
  }, [withParams, creating]);

  const submitNote = useCallback(async () => {
    if (!noteText.trim()) return;
    try {
      await withParams((p) => addNote(p, entity, recordId, noteText.trim()));
      setNoteText('');
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(describeError(err, 'this note')); console.error(err); }
  }, [withParams, entity, recordId, noteText]);

  const title = row ? String(row[cfg.primaryField] ?? `${cfg.singular} ${recordId}`) : cfg.singular;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...relatedDefs.map((d) => ({ key: d.entity, label: `${d.title} (${(related[d.entity] ?? []).length})` })),
    { key: 'notes', label: `Notes (${notes.length})` },
    { key: 'history', label: `History (${activity.length})` },
  ];

  const linkFor = (field: { type: string; entity?: EntityKey }, value: unknown) => {
    if (field.type !== 'entity' || !field.entity || !value) return null;
    return FORGE_ENTITIES[field.entity].detailRoute?.(value as string | number) ?? null;
  };

  return (
    <div
      /* z-[60], above the nav drawer. That drawer is `fixed … z-50` and stays
         mounted off-screen at desktop widths, so at z-40 it sat ON TOP of this
         modal and swallowed clicks on the tabs. Caught by the walkthrough, not
         by looking at it — the drawer is invisible, only its hit area is not. */
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${cfg.singular} details`}
      // onMouseDown, not onClick: releasing a text selection outside the card
      // must not discard the record.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{cfg.singular}</div>
            <h2 className="mt-0.5 text-xl font-semibold text-slate-900">{title}</h2>
            {row && Boolean(row.is_archived) && <Pill>Archived</Pill>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="primary" onClick={() => setEditing(true)}>Edit</Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>

        {/* Tabs — same shape as the platform's .ptab row, written in Tailwind
            so this modal doesn't inherit ARION's page-level design system. */}
        <div className="border-b border-slate-100 px-6 pt-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 text-xs font-medium transition ${
                  tab === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading {cfg.singular.toLowerCase()}…</div>
          ) : !row ? (
            <EmptyState>This {cfg.singular.toLowerCase()} could not be loaded.</EmptyState>
          ) : (
            <>
              {tab === 'overview' && (
                <>
                  {Boolean(row.needs_review) && (
                    <NeedsReviewBanner
                      reason={row.review_reason as string | null}
                      entity={entity}
                      recordId={recordId}
                      onResolved={() => setRefreshKey((k) => k + 1)}
                    />
                  )}
                  <dl className="grid gap-4 sm:grid-cols-3">
                    {cfg.fields.filter((f) => f.key !== 'needs_review').map((f) => {
                      const href = linkFor(f, row[f.key]);
                      return (
                        <div key={f.key}>
                          <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
                          <dd className="mt-0.5 text-sm text-slate-800">
                            {href ? (
                              <Link to={href} className="font-medium text-slate-900 underline underline-offset-2">{cellValue(row, f)}</Link>
                            ) : f.type === 'lookup' && f.lookup?.includes('status') && row[f.key] ? (
                              <Pill tone={statusTone(row[f.key] as string)}>{humanizeValue(String(row[f.key]))}</Pill>
                            ) : cellValue(row, f)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </>
              )}

              {relatedDefs.map((def) => {
                if (tab !== def.entity) return null;
                const rows = related[def.entity] ?? [];
                const rcfg = FORGE_ENTITIES[def.entity];
                const cols = rcfg.fields.filter((f) => f.inList && f.key !== def.foreignKey).slice(0, 6);
                return (
                  <div key={def.entity}>
                    <div className="mb-3 flex justify-end">
                      <Button onClick={() => setCreating({ entity: def.entity, initial: { [def.foreignKey]: recordId } })}>
                        New {rcfg.singular}
                      </Button>
                    </div>
                    {rows.length === 0 ? <EmptyState>No {def.title.toLowerCase()} recorded.</EmptyState> : (
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            {cols.map((f) => <th key={f.key} className="py-2 pr-4 font-semibold">{f.label}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((r) => (
                            <tr key={String(r[rcfg.pk])} className="hover:bg-slate-50">
                              {cols.map((f) => (
                                <td key={f.key} className="whitespace-nowrap py-2 pr-4 text-slate-700">
                                  {f.type === 'lookup' && f.lookup?.includes('status') && r[f.key]
                                    ? <Pill tone={statusTone(r[f.key] as string)}>{humanizeValue(String(r[f.key]))}</Pill>
                                    : cellValue(r, f)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

              {tab === 'notes' && (
                <>
                  <div className="mb-4 flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Add a note…"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                    <Button variant="primary" onClick={submitNote} disabled={!noteText.trim()}>Add note</Button>
                  </div>
                  {notes.length === 0 ? <EmptyState>No notes yet.</EmptyState> : (
                    <ul className="space-y-3">
                      {notes.map((n) => (
                        <li key={n.note_id} className="border-l-2 border-slate-200 pl-3">
                          <p className="text-sm text-slate-700">{n.body}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{n.created_by ?? 'unknown'} · {shortDate(n.note_date)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tab === 'history' && (
                activity.length === 0 ? <EmptyState>No changes recorded yet.</EmptyState> : (
                  <ul className="space-y-2 text-sm">
                    {activity.map((a) => (
                      <li key={a.activity_id} className="flex flex-wrap gap-x-2 text-slate-600">
                        <span className="text-slate-400">{new Date(a.occurred_at).toLocaleString()}</span>
                        <span className="font-medium text-slate-800">{a.actor ?? 'system'}</span>
                        <span>{a.action}{a.field_name ? ` ${a.field_name}` : ''}</span>
                        {a.old_value !== null && <span className="text-slate-400">from {a.old_value}</span>}
                        {a.new_value !== null && <span>to {a.new_value}</span>}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </>
          )}
        </div>
      </div>

      {editing && row && (
        <EntityForm
          key={`edit-${recordId}`}
          cfg={cfg}
          row={row}
          lookups={lookups}
          onCancel={() => setEditing(false)}
          onSave={saveRecord}
        />
      )}
      {creating && (
        <EntityForm
          key={`new-${creating.entity}`}
          cfg={FORGE_ENTITIES[creating.entity]}
          row={null}
          initial={creating.initial}
          lookups={lookups}
          onCancel={() => setCreating(null)}
          onSave={createChild}
        />
      )}
    </div>
  );
}

/**
 * "Needs review" told you a row was suspect but never why, and gave no way to
 * say it had been dealt with — so the flag could only ever accumulate.
 *
 * The reason has been stored since the migration; it just wasn't shown. Marking
 * it reviewed clears the flag and writes a note, so the decision is recorded
 * against the record rather than living in someone's memory.
 */
function NeedsReviewBanner({
  reason, entity, recordId, onResolved,
}: { reason: string | null; entity: EntityKey; recordId: string; onResolved: () => void }) {
  const { withParams } = useForgeApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const markReviewed = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      await withParams(async (p) => {
        await addNote(p, entity, recordId,
          `Reviewed and confirmed. Flag cleared. Original reason: ${reason ?? '(none recorded)'}`);
        await updateEntityRow(p, entity, recordId, { needs_review: 0, review_reason: null });
      });
      onResolved();
    } catch (e) {
      setErr(describeError(e, 'this review'));
      console.error(e);
    } finally { setBusy(false); }
  }, [withParams, entity, recordId, reason, onResolved]);

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">This record needs review</p>
          <p className="mt-1 text-sm text-amber-800">
            {reason ?? 'No reason was recorded.'}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Flagged during the migration from the old system. Check the details are right,
            correct anything that is not, then mark it reviewed — that clears the flag and
            records the decision in Notes.
          </p>
        </div>
        <Button onClick={markReviewed} disabled={busy}>
          {busy ? 'Saving…' : 'Mark reviewed'}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

export default ForgeRecordModal;
