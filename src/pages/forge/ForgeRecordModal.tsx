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
import { IadmModal } from '../../components/IadmModal';
import { Link } from 'react-router-dom';
import {
  addNote, archiveEntityRow, createEntityRow, getActivity, getEntityRow, getNotes, listEntity,
  updateEntityRow, type ActivityRow, type EntityKey, type NoteRow,
} from '../../lib/forgeApi';
import { Button, EmptyState, Pill, statusTone } from './ForgeLayout';
import { FORGE_ENTITIES, cellValue, humanizeValue, shortDate } from './forgeConfig';
import { ForgeExportButton } from './ForgeExportButton';
import { csvBlankIfDash, csvFilename, downloadCsv, toCsvText } from './forgeCsv';
import { EntityForm } from './ForgeEntityPage';
import { describeError, useForgeApi, useForgeLookups } from './useForge';

type Row = Record<string, unknown>;

export function ForgeRecordModal({
  entity, recordId, onClose, onChanged,
}: {
  entity: EntityKey;
  recordId: string;
  onClose: () => void;
  /** Told when this record was written, so the list underneath can refetch. */
  onChanged?: () => void;
}) {
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
  /* Editing a row on a CHILD tab. The child tables rendered as plain <tr> with
     no way in at all: you could see a client's assistance and add another, but
     not open or change one that already existed — which is the single thing
     this modal was built for. Reported from production the day after go-live:
     "I can add a new one but I can't edit anything they currently have." */
  const [editingChild, setEditingChild] = useState<{ entity: EntityKey; row: Row } | null>(null);
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
      /* Page to completion. This asked for 500 and the list route silently caps
         at 200, so a provider with 215 services showed "Services delivered
         (200)" and fifteen of them simply did not exist from that record — the
         same silent-truncation bug as the picker, one screen over. Raising the
         number does nothing; the cap has to be paged past. */
      ...relatedDefs.map((r) =>
        withParams(async (p) => {
          const PAGE = 200;
          const first = await listEntity<Row>(p, r.entity, { [r.foreignKey]: recordId, pageSize: PAGE });
          const data = [...first.data];
          const total = Number(first.total ?? data.length);
          for (let pg = 2; data.length < total && data.length < 5000; pg++) {
            const nxt = await listEntity<Row>(p, r.entity,
              { [r.foreignKey]: recordId, pageSize: PAGE, page: pg });
            if (!nxt.data.length) break;
            data.push(...nxt.data);
          }
          return { ...first, data };
        })),
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

  /* Escape and the backdrop belong to IadmModal now, but its handler is
     unconditional and this modal can have a form open on top of it — one
     Escape would otherwise dismiss both, throwing away the edit AND the record
     behind it. Guarding here rather than in IadmModal keeps every other call
     site untouched. */
  const closeUnlessNested = useCallback(() => {
    if (editing || creating || editingChild) return;
    onClose();
  }, [onClose, editing, creating, editingChild]);

  const saveRecord = useCallback(async (values: Row) => {
    await withParams((p) => updateEntityRow(p, entity, recordId, values));
    setEditing(false);
    setRefreshKey((k) => k + 1);
    onChanged?.();
  }, [withParams, entity, recordId, onChanged]);

  const saveChild = useCallback(async (values: Row) => {
    if (!editingChild) return;
    const cfgChild = FORGE_ENTITIES[editingChild.entity];
    const childId = editingChild.row[cfgChild.pk] as string | number;
    await withParams((p) => updateEntityRow(p, editingChild.entity, childId, values));
    setEditingChild(null);
    setRefreshKey((k) => k + 1);
    onChanged?.();
  }, [withParams, editingChild, onChanged]);

  /* Archive lives HERE as well as in the list row, and that is not a
     convenience. The row's Archive button is the last control in the last
     column, so on six of seven screens it sat past the right edge of the
     table's scroll box — and this modal offered Edit and Close and nothing
     else. Archiving a record was therefore unreachable without discovering a
     horizontal scrollbar the platform does not draw. It is also the only
     archive path left on a phone, where the row keeps just Open. */
  const [archiving, setArchiving] = useState(false);
  const archived = Boolean(row?.is_archived);
  const toggleArchive = useCallback(async () => {
    if (!row) return;
    setArchiving(true);
    try {
      await withParams((p) => archiveEntityRow(p, entity, recordId, Boolean(row.is_archived)));
      setRefreshKey((k) => k + 1);
      onChanged?.();
    } catch (err) { setError(describeError(err, `this ${cfg.singular.toLowerCase()}`)); console.error(err); }
    finally { setArchiving(false); }
  }, [withParams, entity, recordId, row, cfg.singular, onChanged]);

  const createChild = useCallback(async (values: Row) => {
    if (!creating) return;
    await withParams((p) => createEntityRow(p, creating.entity, values));
    setCreating(null);
    setRefreshKey((k) => k + 1);
    onChanged?.();
  }, [withParams, creating, onChanged]);

  const submitNote = useCallback(async () => {
    if (!noteText.trim()) return;
    try {
      await withParams((p) => addNote(p, entity, recordId, noteText.trim()));
      setNoteText('');
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(describeError(err, 'this note')); console.error(err); }
  }, [withParams, entity, recordId, noteText]);

  const title = row ? String(row[cfg.primaryField] ?? `${cfg.singular} ${recordId}`) : cfg.singular;

  /* ONE record's children as a file — this client's services, this funder's
     applications. The same mechanism as the list screens, with two differences
     that come from where it sits: the rows are already in memory (the effect
     above pages them to completion, so there is nothing to fetch), and the
     foreign key that got us here is dropped because it holds the same parent on
     every row. The table shows six columns for width; the file carries every
     field the child entity declares, because a spreadsheet has no right edge. */
  const exportChild = useCallback(async (def: { entity: EntityKey; foreignKey: string; title: string }) => {
    const rcfg = FORGE_ENTITIES[def.entity];
    downloadCsv(
      csvFilename(`${title} ${def.title}`),
      toCsvText(
        rcfg.fields.filter((f) => f.key !== def.foreignKey),
        related[def.entity] ?? [],
        (r, f) => csvBlankIfDash(cellValue(r, f))
      )
    );
  }, [related, title]);

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
    <>
      {/* IadmModal, not a bespoke card. This modal was hand-rolled, which is
          why it never matched the OLIVER customer modal: its own chrome, its
          own sizing rules, and a canvas that re-measured itself on every tab.
          F-107 already settled this — "info" is 1200 x 80vh, fixed, the same
          box every open, whitespace on a light record by design. Sharing the
          component is what makes Clients, Services, Providers and Funders
          identical without anyone maintaining four copies of the rule.
          z={60} because the nav drawer is also z-50 and stays mounted
          off-screen at desktop widths — a tie is broken by DOM order, which is
          not ours to control, and the losing side is an invisible hit area
          sitting over the tab strip. */}
      <IadmModal
        open
        onClose={closeUnlessNested}
        product="forge"
        eyebrow={cfg.singular}
        title={title}
        subtitle={row && Boolean(row.is_archived) ? 'Archived' : undefined}
        size="info"
        z={60}
        headerActions={
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
            >
              Edit
            </button>
            {row && (
              <button
                type="button"
                onClick={toggleArchive}
                disabled={archiving}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                {archiving ? 'Saving…' : archived ? 'Restore' : 'Archive'}
              </button>
            )}
          </>
        }
      >
        {/* Tabs — same shape as the platform's .ptab row, written in Tailwind
            so this modal doesn't inherit ARION's page-level design system.
            The strip SCROLLS sideways rather than squashing: as flex items with
            no shrink control the buttons compressed on a phone and their labels
            wrapped to two and three lines, so "Funding applications (2)" alone
            rendered 60px tall and pushed the strip from 43px to 75px. */}
        {/* sticky, not shrink-0: IadmModal gives its children ONE scrolling
            box, so a plain strip would scroll away with the content. */}
        <div className="sticky top-0 z-10 overflow-x-auto border-b border-slate-100 bg-white px-6 pt-3">
          <div className="inline-flex flex-nowrap overflow-hidden rounded-lg border border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 text-xs font-medium transition ${
                  tab === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
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
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* daterange is a LIST convenience — one column instead of
                        two on the screens that could least afford the width. The
                        record shows the two real fields it folds together, so
                        skipping it here is what keeps Start and End from being
                        printed twice. */}
                    {cfg.fields.filter((f) => f.key !== 'needs_review' && f.type !== 'daterange').map((f) => {
                      const href = linkFor(f, row[f.key]);
                      return (
                        <div key={f.key}>
                          <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
                          <dd className="mt-0.5 text-sm text-slate-800">
                            {href ? (
                              <Link to={href} className="font-medium text-slate-900 underline underline-offset-2">{cellValue(row, f)}</Link>
                            ) : f.type === 'derived' ? (
                              <Pill tone={String(cellValue(row, f)).startsWith('Receiving') ? 'green' : 'slate'}>{cellValue(row, f)}</Pill>
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
                    <div className="mb-3 flex justify-end gap-2">
                      <ForgeExportButton
                        subject={`these ${def.title.toLowerCase()}`}
                        disabled={rows.length === 0}
                        onExport={() => exportChild(def)}
                        onError={setError}
                      />
                      <Button onClick={() => setCreating({ entity: def.entity, initial: { [def.foreignKey]: recordId } })}>
                        New {rcfg.singular}
                      </Button>
                    </div>
                    {rows.length === 0 ? <EmptyState>No {def.title.toLowerCase()} recorded.</EmptyState> : (
                      /* The TABLE scrolls sideways, not the modal body. Without
                         this wrapper a six-column child table (610px natural)
                         made the whole 358px body scroll horizontally on a
                         phone, taking the field labels with it. The list screen
                         has always wrapped its table; this one did not. */
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                              {cols.map((f) => <th key={f.key} className="whitespace-nowrap py-2 pr-4 font-semibold">{f.label}</th>)}
                              <th className="py-2 pr-2 text-right font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rows.map((r) => (
                              <tr key={String(r[rcfg.pk])} className="cursor-pointer hover:bg-slate-50"
                                  onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a')) setEditingChild({ entity: def.entity, row: r }); }}>
                                {cols.map((f) => (
                                  <td key={f.key} className="whitespace-nowrap py-2 pr-4 text-slate-700">
                                    {f.type === 'lookup' && f.lookup?.includes('status') && r[f.key]
                                      ? <Pill tone={statusTone(r[f.key] as string)}>{humanizeValue(String(r[f.key]))}</Pill>
                                      : cellValue(r, f)}
                                  </td>
                                ))}
                                <td className="whitespace-nowrap py-2 pr-2 text-right">
                                  <Button size="sm" onClick={() => setEditingChild({ entity: def.entity, row: r })}>Edit</Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
      </IadmModal>

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
      {editingChild && (
        <EntityForm
          key={`editchild-${editingChild.entity}-${String(editingChild.row[FORGE_ENTITIES[editingChild.entity].pk])}`}
          cfg={FORGE_ENTITIES[editingChild.entity]}
          row={editingChild.row}
          lookups={lookups}
          onCancel={() => setEditingChild(null)}
          onSave={saveChild}
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
    </>
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
