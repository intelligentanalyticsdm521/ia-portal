/**
 * Needs attention — every flagged record in one place, with a way to close it out.
 *
 * The flag existed from the migration onward but could only ever accumulate: it
 * said a row was suspect, never why, and offered no way to say it had been
 * dealt with. This is the other half — the queue, and the three answers a
 * person actually has when they look at one:
 *
 *   Correct it       the data is wrong  -> open the record and fix it
 *   Correct as-is    the data is right  -> dismiss, and record who decided
 *   Archive          the row should not be here at all (a duplicate, usually)
 *
 * Every outcome writes a note, so the decision lands on the record instead of
 * in someone's memory, and the queue never asks the same question twice.
 *
 * Which entities appear is read from the config, not listed here. Today only
 * services carries `needs_review`; when the person collapse starts flagging
 * possible duplicate humans on clients and volunteers, they appear here with no
 * change to this file.
 *
 * It deliberately does NOT ask the API for `?needs_review=1` on an entity whose
 * config lacks the field. An unknown filter key is silently DROPPED by the list
 * route rather than rejected, so that request returns every row in the table —
 * which on this screen would read as "all 283 clients need attention".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, ForgeLayout, Pill } from './ForgeLayout';
import { FORGE_ENTITIES, cellValue } from './forgeConfig';
import { screenRoute } from './forgeSoftware';
import { describeError, useForgeApi } from './useForge';
import { addNote, archiveEntityRow, listEntity, updateEntityRow, type EntityKey } from '../../lib/forgeApi';
import { ForgeRecordModal } from './ForgeRecordModal';

type Flagged = {
  entity: EntityKey;
  id: string;
  title: string;
  reason: string | null;
};

/** Entities that actually carry the flag — see the note above about why this matters. */
const FLAGGABLE = (Object.keys(FORGE_ENTITIES) as EntityKey[])
  .filter((k) => FORGE_ENTITIES[k].fields.some((f) => f.key === 'needs_review'));

export function ForgeAttentionPage() {
  const { ready, withParams } = useForgeApi();
  const [items, setItems] = useState<Flagged[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const openRecordId = searchParams.get('record');
  const openEntity = searchParams.get('entity') as EntityKey | null;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setError(null);
    withParams(async (p) => {
      const per = await Promise.all(FLAGGABLE.map(async (entity) => {
        const cfg = FORGE_ENTITIES[entity];
        const r = await listEntity(p, entity, { pageSize: 200, needs_review: 1 });
        const nameField = cfg.fields.find((f) => f.key === cfg.primaryField) ?? cfg.fields[0];
        return r.data.map((row) => ({
          entity,
          id: String(row[cfg.pk]),
          title: String(cellValue(row, nameField) || `${cfg.singular} ${row[cfg.pk]}`),
          reason: (row.review_reason as string | null) ?? null,
        }));
      }));
      return per.flat();
    })
      .then((all) => { if (!cancelled) setItems(all); })
      .catch((e) => { if (!cancelled) { setError(describeError(e, 'the attention queue')); console.error(e); } });
    return () => { cancelled = true; };
  }, [ready, withParams, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  /* Dismissing is a decision, not a delete — it is recorded against the record
     so the next person can see that someone looked and said it was fine. */
  const correctAsIs = useCallback(async (it: Flagged) => {
    setBusy(it.entity + it.id); setError(null);
    try {
      await withParams(async (p) => {
        await addNote(p, it.entity, it.id,
          `Reviewed and confirmed correct as-is. Flag cleared. Original reason: ${it.reason ?? '(none recorded)'}`);
        await updateEntityRow(p, it.entity, it.id, { needs_review: 0, review_reason: null });
      });
      refresh();
    } catch (e) { setError(describeError(e, 'this record')); console.error(e); }
    finally { setBusy(null); }
  }, [withParams, refresh]);

  const archive = useCallback(async (it: Flagged) => {
    setBusy(it.entity + it.id); setError(null);
    try {
      await withParams(async (p) => {
        await addNote(p, it.entity, it.id,
          `Archived from the attention queue. Original reason: ${it.reason ?? '(none recorded)'}`);
        await updateEntityRow(p, it.entity, it.id, { needs_review: 0, review_reason: null });
        await archiveEntityRow(p, it.entity, it.id, false);
      });
      refresh();
    } catch (e) { setError(describeError(e, 'this record')); console.error(e); }
    finally { setBusy(null); }
  }, [withParams, refresh]);

  const byEntity = useMemo(() => {
    const m = new Map<EntityKey, Flagged[]>();
    for (const it of items ?? []) m.set(it.entity, [...(m.get(it.entity) ?? []), it]);
    return [...m.entries()];
  }, [items]);

  const total = items?.length ?? 0;

  return (
    <ForgeLayout
      title="Needs attention"
      subtitle={
        items === null ? 'Checking…'
          : total === 0 ? 'Nothing needs attention. Everything that was flagged has been dealt with.'
          : `${total} record${total === 1 ? '' : 's'} flagged. Each one says what is wrong and how to close it.`
      }
      error={error}
    >

      {items === null ? (
        <Card><EmptyState>Loading…</EmptyState></Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState>
            Nothing needs attention right now. Records get flagged when something about them
            could not be resolved automatically — you will see them here with the reason.
          </EmptyState>
        </Card>
      ) : (
        byEntity.map(([entity, list]) => {
          const cfg = FORGE_ENTITIES[entity];
          return (
            <Card key={entity} title={`${cfg.title} (${list.length})`}>
              <ul className="divide-y divide-slate-100">
                {list.map((it) => {
                  const working = busy === it.entity + it.id;
                  return (
                    <li key={it.entity + it.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSearchParams({ entity, record: it.id })}
                            className="text-sm font-semibold text-slate-900 hover:underline"
                          >
                            {it.title}
                          </button>
                          <Pill tone="amber">Needs review</Pill>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">
                          {it.reason ?? 'No reason was recorded.'}
                        </p>
                        <Link
                          to={`${screenRoute('hestia', entity)}?record=${it.id}`}
                          className="mt-1 inline-block text-xs text-slate-500 hover:underline"
                        >
                          See it on the {cfg.title.toLowerCase()} screen →
                        </Link>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button size="sm" variant="primary" onClick={() => setSearchParams({ entity, record: it.id })}>
                          Correct it
                        </Button>
                        <Button size="sm" onClick={() => correctAsIs(it)} disabled={working}>
                          {working ? 'Saving…' : 'Correct as-is'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => archive(it)} disabled={working}>
                          Archive
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}

      {openRecordId && openEntity && (
        <ForgeRecordModal
          entity={openEntity}
          recordId={openRecordId}
          onClose={() => { setSearchParams({}); refresh(); }}
        />
      )}
    </ForgeLayout>
  );
}

export default ForgeAttentionPage;
