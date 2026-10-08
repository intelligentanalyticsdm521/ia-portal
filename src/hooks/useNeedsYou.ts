// useNeedsYou — everything an employee left for the owner, from each product's
// own activity endpoint (contract ARGUS employees phase 1 §F.1, §F.4).
//
// No aggregating server: the Portal asks ARION, SPARK and OLIVER each for
// `?waiting=1` at once (Promise.allSettled), and each card's buttons call the
// route of the product that made it — one approval path per thing. A product
// the business does not have answers 403 and contributes nothing; any other
// failure is said, one line per source (lib/team.ts mergeNeedsYou). Never a
// silent empty list.
//
// Loaded once per page (and again after a decision, so the card leaves). No
// polling (convention_data_fetching).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSparkApi } from './useSparkApi';
import { useOliverApi } from './useOliverApi';
import { useArionTeam } from './useTeam';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import {
  WAITING_PATHS, approveBody, decidePathOk, mergeNeedsYou, sourceResult,
  type DecideEdits, type NeedsSource, type NeedsYouRow,
} from '../lib/team';
import type { AgentActivityPayload, AgentActivityRow } from '../components/agents/types';

export interface DecideInput {
  edits?: DecideEdits | null;
  reason?: string;
  scheduledFor?: string | null;
}

export function useNeedsYou(sources: NeedsSource[]) {
  const arion = useArionTeam();
  const spark = useSparkApi();
  const oliver = useOliverApi();
  const sourcesKey = sources.join(',');
  const [rows, setRows] = useState<NeedsYouRow[]>([]);
  const [failures, setFailures] = useState<Array<{ source: NeedsSource; words: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const fns = useRef({ arion, spark, oliver });
  fns.current = { arion, spark, oliver };

  const fetchSource = useCallback(async (s: NeedsSource): Promise<AgentActivityRow[]> => {
    const { arion: a, spark: sp, oliver: o } = fns.current;
    if (s === 'arion') return a.waiting();
    // sparkApi does NOT strip the envelope; oliverApi DOES.
    if (s === 'spark') return (await sp.get<{ data: AgentActivityPayload }>(WAITING_PATHS.spark)).data?.rows || [];
    return (await o.get<AgentActivityPayload>(WAITING_PATHS.oliver))?.rows || [];
  }, []);

  const ready = arion.ready && spark.ready && oliver.ready;

  const load = useCallback(async () => {
    const list = sourcesKey ? (sourcesKey.split(',') as NeedsSource[]) : [];
    setLoading(true);
    const settled = await Promise.allSettled(list.map((s) => fetchSource(s)));
    const merged = mergeNeedsYou(list.map((s, i) => sourceResult(s, settled[i])));
    setRows(merged.rows);
    setFailures(merged.failures);
    setLoading(false);
    setLoadedOnce(true);
  }, [sourcesKey, fetchSource]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const send = useCallback(async (source: NeedsSource, path: string, body: Record<string, unknown>) => {
    const { arion: a, spark: sp, oliver: o } = fns.current;
    if (!decidePathOk(source, path)) {
      throw new Error("That button points somewhere this item didn't come from, so nothing was sent.");
    }
    if (source === 'arion') return a.post(path, body);
    if (source === 'spark') return sp.post<{ data?: unknown; words?: string }>(path, body);
    return o.post<{ words?: string }>(path, body);
  }, []);

  /**
   * One button on one card. On success the list is read again (the item leaves,
   * or comes back offering its next step, e.g. "Put it on your website"); on a
   * refusal nothing moves and the sentence is returned for the card to show.
   */
  const decide = useCallback(async (
    row: NeedsYouRow, which: 'approve' | 'skip' | 'publish', input: DecideInput = {},
  ): Promise<{ ok: boolean; words: string }> => {
    const d = row.decide || {};
    try {
      let out: unknown;
      if (which === 'approve' && d.approve) {
        out = await send(row.source, d.approve.path,
          approveBody(row.source, d.approve.path, d.approve, input.edits || null, input.scheduledFor));
      } else if (which === 'skip' && d.skip) {
        out = await send(row.source, d.skip.path, input.reason ? { reason: input.reason } : {});
      } else if (which === 'publish' && d.publish) {
        out = await send(row.source, d.publish.path, {});
      } else {
        return { ok: false, words: "This item can't be decided here." };
      }
      const said = (out && typeof out === 'object')
        ? ((out as { words?: unknown }).words ?? ((out as { data?: { words?: unknown } }).data?.words))
        : null;
      const fallback = which === 'skip' ? "Skipped. It won't come back."
        : which === 'publish' ? 'Sent to your website.'
          : 'Done.';
      await load();
      return { ok: true, words: typeof said === 'string' && said.trim() ? said.trim() : fallback };
    } catch (err) {
      // A refused decision can still have CHANGED the item (an answered review
      // stands down). Read the list again so the card says what is true now.
      await load().catch(() => {});
      return { ok: false, words: apiErrorMessage(err) };
    }
  }, [send, load]);

  return useMemo(
    () => ({ rows, failures, loading, loadedOnce, reload: load, decide }),
    [rows, failures, loading, loadedOnce, load, decide],
  );
}
