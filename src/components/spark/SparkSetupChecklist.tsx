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
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, ListChecks, Lock } from 'lucide-react';
import { useSparkApi } from '../../hooks/useSparkApi';

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
    <section className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ListChecks className="h-4 w-4 text-[#EF6C33]" />
          Finish setting up
        </h2>
        <span className="text-xs text-slate-500">
          {progress.done} of {progress.total} done
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#EF6C33] transition-all"
          style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
        />
      </div>

      {requiredLeft.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Worth doing first</p>
          <ul className="mt-1.5 space-y-1">
            {requiredLeft.map((s) => <Row key={s.key} step={s} />)}
          </ul>
        </>
      )}

      {optionalLeft.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">When you are ready</p>
          <ul className="mt-1.5 space-y-1">
            {optionalLeft.map((s) => <Row key={s.key} step={s} />)}
          </ul>
        </>
      )}
    </section>
  );
}

function Row({ step }: { step: Step }) {
  // A tier-locked step says which plan it needs and does not pretend to be
  // clickable — the nav's own wall would bounce it anyway.
  if (step.locked) {
    return (
      <li className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Lock className="h-3 w-3 flex-shrink-0" />
        <span className="flex-1">{step.label}</span>
        {step.requiredTier && (
          <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
            {step.requiredTier}
          </span>
        )}
      </li>
    );
  }
  return (
    <li>
      <Link
        to={step.route as string}
        className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:border-[#EF6C33] hover:bg-[#FFF6F0]"
      >
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-slate-300">
          {step.done && <Check className="h-2.5 w-2.5 text-emerald-600" />}
        </span>
        <span className="flex-1 font-medium">{step.label}</span>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      </Link>
    </li>
  );
}

export default SparkSetupChecklist;
