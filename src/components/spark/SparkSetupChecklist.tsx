/**
 * SparkSetupChecklist — the onboarding checklist, on screen.
 *
 * WHY THIS EXISTS (SPARK pack 1, 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * LUMEN has had GET /api/v1/onboarding/checklist since the spring: it walks the
 * tenant's real state across SPARK and reports each step done / not done / locked
 * by tier, with progress counts. Nothing in this app called it. Not one file. The
 * endpoint's only exercise was a smoke script.
 *
 * So extending it — which is what "the checklist covers September" asks for —
 * would have added five invisible rows to an invisible list. It needed a surface,
 * and this is the smallest honest one: a card on SPARK Overview, beside the
 * suggestions and hints that already live there.
 *
 * WHAT IT IS NOT. Not a second onboarding wizard: the heavyweight flow is
 * UnifiedSetupCard on Command Center (Brandon's 2026-06-17 rule — ONE onboarding,
 * ONE design), and this does not open it. This is the after: the list you come
 * back to, whose rows say what is still switched off and take you to the screen
 * that switches it on.
 *
 * EVERY ROW LINKS. The server sends a `route` per step for exactly this reason. A
 * checklist row that names a task and does not take you to it is a to-do list, and
 * this one is dropped rather than rendered dead.
 *
 * IT DISAPPEARS WHEN IT IS DONE. Nothing is more irritating than a permanent
 * "finish setup" nag on a finished account, so with every required step done and
 * nothing optional left, the card renders nothing at all.
 *
 * THE DRAWING IS SHARED (1 Oct 2026). The card itself is components/
 * SetupChecklistCard.tsx, which STELLA's Overview draws too. This file keeps
 * what is SPARK's: the LUMEN fetch, the drop-rows-without-a-route guard, the
 * hide-when-done rule, and the two groups.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSparkApi } from '../../hooks/useSparkApi';
import { SetupChecklistCard, type SetupChecklistRow } from '../SetupChecklistCard';

const SPARK_ORANGE = '#EF6C33';
const SPARK_ORANGE_TINT = '#FFF6F0';

interface Step {
  key: string;
  label: string;
  group: string;
  required: boolean;
  done: boolean;
  locked: boolean;
  requiredTier: string | null;
  route?: string;
}
interface Progress {
  done: number;
  total: number;
  required_done: number;
  required_total: number;
  percent: number;
  required_percent: number;
}

const toRow = (s: Step): SetupChecklistRow => ({
  key: s.key,
  label: s.label,
  done: s.done,
  route: s.route,
  locked: s.locked,
  lockedTag: s.requiredTier,
});

export function SparkSetupChecklist({ className = '' }: { className?: string }) {
  const { get, ready } = useSparkApi();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: { steps: Step[]; progress: Progress } }>('/api/v1/onboarding/checklist');
      setSteps(r.data?.steps || []);
      setProgress(r.data?.progress || null);
    } catch (err) {
      // A checklist is a convenience. It says nothing rather than an error, and
      // the console carries the reason — but it is NOT silently swallowed.
      console.error('[SparkSetupChecklist] checklist unavailable', err);
      setSteps([]);
    }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  if (!steps || !progress) return null;

  // A row with no route cannot be acted on, so it is not shown. (The server sends
  // one for every step; this is the guard, not the expectation.)
  const actionable = steps.filter((s) => !!s.route);
  const outstanding = actionable.filter((s) => !s.done);
  if (outstanding.length === 0) return null;

  const requiredLeft = outstanding.filter((s) => s.required && !s.locked);
  const optionalLeft = outstanding.filter((s) => !s.required || s.locked);

  return (
    <SetupChecklistCard
      className={className}
      title="Finish setting up"
      done={progress.done}
      total={progress.total}
      percent={progress.percent}
      accent={SPARK_ORANGE}
      accentTint={SPARK_ORANGE_TINT}
      groups={[
        { heading: 'Worth doing first', rows: requiredLeft.map(toRow) },
        { heading: 'When you are ready', rows: optionalLeft.map(toRow) },
      ]}
    />
  );
}

export default SparkSetupChecklist;
