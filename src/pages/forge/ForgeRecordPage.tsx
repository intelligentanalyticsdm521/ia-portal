/**
 * ForgeRecordPage — the detail view for any entity that doesn't have a bespoke
 * one.
 *
 * THE SHAPE OF THIS PRODUCT, since it keeps coming up:
 *
 *   Every record is a PAGE, not a modal. Pages can be linked, bookmarked and
 *   sent to a colleague; the back button works; there is room for the record's
 *   children; and a modal cannot cleanly open another modal, which you need the
 *   moment someone opens a service from inside a client.
 *
 *   EDITING stays in a modal — the same one the list uses. Reading is a place
 *   you navigate to; editing is something you do to what you are looking at.
 *
 *   Records link BOTH ways. Down: a client shows their assistance and services,
 *   a provider shows the services it delivers, a funder shows its applications.
 *   Up: every foreign-key column in every grid is a link to that record's own
 *   page, so the client name on a service row takes you to the client.
 *
 * Like the list screen, this is ONE component driven by forgeConfig — the
 * related sections are declared there, not written out per entity.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addNote, getActivity, getEntityRow, getNotes, listEntity, updateEntityRow,
  type ActivityRow, type EntityKey, type NoteRow,
} from '../../lib/forgeApi';
import { Button, Card, EmptyState, ForgeLayout, Pill, statusTone } from './ForgeLayout';
import { FORGE_ENTITIES, cellValue, humanizeValue, shortDate } from './forgeConfig';
import { EntityForm } from './ForgeEntityPage';
import { describeError, useForgeApi, useForgeLookups } from './useForge';
import { screenRoute } from './forgeSoftware';

type Row = Record<string, unknown>;

export function ForgeRecordPage({ entity, recordId }: { entity: EntityKey; recordId?: string }) {
  const params = useParams<{ id: string }>();
  const id = recordId ?? params.id;
  const cfg = FORGE_ENTITIES[entity];
  const { ready, withParams } = useForgeApi();
  const { lookups } = useForgeLookups();

  const [row, setRow] = useState<Row | null>(null);
  const [related, setRelated] = useState<Record<string, Row[]>>({});
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [noteText, setNoteText] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!ready || !id) return;
    let cancelled = false;
    setLoading(true); setError(null);

    const relatedDefs = cfg.related ?? [];
    Promise.all([
      withParams((p) => getEntityRow<Row>(p, entity, id)),
      withParams((p) => getNotes(p, entity, id)),
      withParams((p) => getActivity(p, entity, id)),
      ...relatedDefs.map((r) =>
        withParams((p) => listEntity<Row>(p, r.entity, { [r.foreignKey]: id, pageSize: 200 }))),
    ])
      .then(([r, n, a, ...rest]) => {
        if (cancelled) return;
        setRow(r);
        setNotes(n);
        setActivity(a);
        const map: Record<string, Row[]> = {};
        relatedDefs.forEach((def, i) => { map[def.entity] = (rest[i] as { data: Row[] })?.data ?? []; });
        setRelated(map);
      })
      .catch((err) => { if (!cancelled) setError(describeError(err, `this ${cfg.singular.toLowerCase()}`)); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, entity, id, refreshKey, cfg]);

  const save = useCallback(async (values: Row) => {
    if (!id) return;
    await withParams((p) => updateEntityRow(p, entity, id, values));
    setEditing(false);
    setRefreshKey((k) => k + 1);
  }, [withParams, entity, id]);

  const submitNote = useCallback(async () => {
    if (!id || !noteText.trim()) return;
    try {
      await withParams((p) => addNote(p, entity, id, noteText.trim()));
      setNoteText('');
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(describeError(err, 'this note')); console.error(err); }
  }, [withParams, entity, id, noteText]);

  const title = useMemo(() => {
    if (!row) return cfg.singular;
    const v = row[cfg.primaryField];
    return v ? String(v) : `${cfg.singular} ${id}`;
  }, [row, cfg, id]);

  /** A foreign-key value becomes a link when the target entity has a page. */
  const linkFor = (field: { type: string; entity?: EntityKey }, value: unknown) => {
    if (field.type !== 'entity' || !field.entity || !value) return null;
    return FORGE_ENTITIES[field.entity].detailRoute?.(value as string | number) ?? null;
  };

  return (
    <ForgeLayout
      title={title}
      subtitle={cfg.subtitle}
      loading={loading}
      loadingLabel={`Loading ${cfg.singular.toLowerCase()}…`}
      error={error}
      actions={
        <div className="flex gap-2">
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Link to={screenRoute('hestia', String(entity))}>
            <Button>← All {cfg.title.toLowerCase()}</Button>
          </Link>
        </div>
      }
    >
      {row && (
        <>
          <Card title="Details">
            <dl className="grid gap-4 sm:grid-cols-3">
              {cfg.fields.map((f) => {
                const href = linkFor(f, row[f.key]);
                const shown = cellValue(row, f);
                return (
                  <div key={f.key}>
                    <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
                    <dd className="mt-0.5 text-sm text-slate-800">
                      {href ? (
                        <Link to={href} className="font-medium text-slate-900 underline underline-offset-2">{shown}</Link>
                      ) : f.type === 'lookup' && f.lookup?.includes('status') && row[f.key] ? (
                        <Pill tone={statusTone(row[f.key] as string)}>{humanizeValue(String(row[f.key]))}</Pill>
                      ) : shown}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {Boolean(row.needs_review) && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Flagged for review{row.review_reason ? ` — ${String(row.review_reason)}` : ''}.
              </div>
            )}
          </Card>

          {(cfg.related ?? []).map((def) => {
            const rows = related[def.entity] ?? [];
            const rcfg = FORGE_ENTITIES[def.entity];
            const cols = rcfg.fields.filter((f) => f.inList && f.key !== def.foreignKey).slice(0, 5);
            return (
              <Card key={def.entity} title={`${def.title} (${rows.length})`}>
                {rows.length === 0 ? (
                  <EmptyState>No {def.title.toLowerCase()} recorded.</EmptyState>
                ) : (
                  <div className="-mx-5 overflow-x-auto px-5">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          {cols.map((f) => <th key={f.key} className="py-2 pr-4 font-semibold">{f.label}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => {
                          const rid = r[rcfg.pk] as string | number;
                          const href = rcfg.detailRoute?.(rid);
                          return (
                            <tr key={String(rid)} className="hover:bg-slate-50">
                              {cols.map((f, i) => (
                                <td key={f.key} className="whitespace-nowrap py-2 pr-4 text-slate-700">
                                  {i === 0 && href
                                    ? <Link to={href} className="font-medium text-slate-900 underline underline-offset-2">{cellValue(r, f)}</Link>
                                    : cellValue(r, f)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}

          <Card title="Notes" action={
            <div className="flex gap-2">
              <input
                className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                placeholder="Add a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <Button onClick={submitNote} disabled={!noteText.trim()}>Add</Button>
            </div>
          }>
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
          </Card>

          <Card title="History">
            {activity.length === 0 ? <EmptyState>No changes recorded yet.</EmptyState> : (
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
            )}
          </Card>

          {editing && (
            <EntityForm
              key={`edit-${String(id)}`}
              cfg={cfg}
              row={row}
              lookups={lookups}
              onCancel={() => setEditing(false)}
              onSave={save}
            />
          )}
        </>
      )}
    </ForgeLayout>
  );
}

export default ForgeRecordPage;
