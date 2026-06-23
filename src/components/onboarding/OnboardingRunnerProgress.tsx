// C:/dev/iadm/Portal/src/components/onboarding/OnboardingRunnerProgress.tsx
//
// OnboardingRunnerProgress — vertical timeline that renders the live
// status of every Step in the post-checkout setup flow.
//
// Engine pairing: this component is read-only. It receives StepRecord[]
// + current_step_id from the caller (the wizard page that owns the
// Runner instance) and surfaces Retry / Skip / Save-and-continue
// affordances back up via callbacks. The Runner itself lives in
// lib/onboardingRunner/runner.ts and is created/owned by the wizard.
//
// Brandon-locked copy:
//   • failed_server_busy →
//       "We are trying — this is taking longer than usual. We have been
//        notified and will reach out shortly. You can also try again."
//   • failed_retrying →
//       "Retrying… attempt N of M"
//   • Save-and-continue is a per-step affordance (decision #2) — every
//     step that is not "done" or "skipped" shows a small "Save and
//     continue later" link that calls onSaveAndContinue(step_id).
//
// Visuals — minimal, no design dependencies. Uses inline Tailwind-ish
// classes that match the rest of the Portal (the project ships Tailwind
// via index.css; consistent with other onboarding/wizard components).
// Icons come from lucide-react, the library already in the bundle.

import type { StepRecord, StepStatus } from "../../lib/onboardingRunner/types";
import { getLabel } from "../../lib/onboardingRunner/labels";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  CloudOff,
  SkipForward,
  RotateCw,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────── */

export interface OnboardingRunnerProgressProps {
  steps: StepRecord[];
  current_step_id?: string | null;
  /** Author-supplied max_retries per step so the "attempt N of M" copy
   *  can show the cap. Keyed by step_id. */
  max_retries_by_step?: Record<string, number>;
  /** Author-supplied fallback labels per step_id when a registry hit
   *  misses (paired with the Step.label_user_facing). */
  fallback_labels_by_step?: Record<string, string>;
  /** Step ids that may be skipped (on_failure === "skip_allowed"). */
  skip_allowed_step_ids?: string[];

  onRetry?: (step_id: string) => void;
  onSkip?: (step_id: string) => void;
  onSaveAndContinue?: (step_id: string) => void;
}

/* ──────────────────────────────────────────────────────────────────────
 * Status presentation
 * ────────────────────────────────────────────────────────────────────── */

function statusIcon(status: StepStatus): JSX.Element {
  const cls = "h-5 w-5 shrink-0";
  switch (status) {
    case "done":
      return <CheckCircle2 className={`${cls} text-emerald-600`} aria-label="Done" />;
    case "skipped":
      return <SkipForward className={`${cls} text-slate-400`} aria-label="Skipped" />;
    case "running":
    case "waiting":
    case "verifying":
      return <Loader2 className={`${cls} text-blue-600 animate-spin`} aria-label="In progress" />;
    case "failed_retrying":
      return <AlertTriangle className={`${cls} text-amber-600`} aria-label="Retrying" />;
    case "failed_server_busy":
      return <CloudOff className={`${cls} text-rose-600`} aria-label="Server busy" />;
    case "pending":
    default:
      return <Circle className={`${cls} text-slate-300`} aria-label="Pending" />;
  }
}

function statusSubtext(
  rec: StepRecord,
  maxRetries: number | undefined,
): string | null {
  switch (rec.status) {
    case "running":
      return "Working on it…";
    case "waiting":
      return "Waiting for things to finish…";
    case "verifying":
      return "Double-checking…";
    case "failed_retrying": {
      const n = rec.attempt_count || 1;
      const m = maxRetries && maxRetries > 0 ? maxRetries : "—";
      return `Retrying… attempt ${n} of ${m}`;
    }
    case "failed_server_busy":
      return "We are trying — this is taking longer than usual. We have been notified and will reach out shortly. You can also try again.";
    case "skipped":
      return "Skipped for now.";
    case "done":
      return null;
    case "pending":
    default:
      return null;
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────── */

export default function OnboardingRunnerProgress(props: OnboardingRunnerProgressProps): JSX.Element {
  const {
    steps,
    current_step_id,
    max_retries_by_step,
    fallback_labels_by_step,
    skip_allowed_step_ids,
    onRetry,
    onSkip,
    onSaveAndContinue,
  } = props;

  const skipSet = new Set(skip_allowed_step_ids || []);

  return (
    <ol className="relative border-l border-slate-200 ml-3 pl-6 space-y-5" role="list">
      {steps.map((rec) => {
        const isCurrent = current_step_id === rec.step_id;
        const label = getLabel(rec.step_id, fallback_labels_by_step?.[rec.step_id]);
        const sub = statusSubtext(rec, max_retries_by_step?.[rec.step_id]);
        const showRetry =
          rec.status === "failed_retrying" || rec.status === "failed_server_busy";
        const showSkip =
          skipSet.has(rec.step_id) &&
          (rec.status === "failed_retrying" || rec.status === "failed_server_busy");
        const showSave =
          rec.status !== "done" && rec.status !== "skipped" && !!onSaveAndContinue;

        return (
          <li
            key={rec.step_id}
            className={`relative ${isCurrent ? "" : ""}`}
            aria-current={isCurrent ? "step" : undefined}
          >
            {/* dot on the rail */}
            <span
              className={`absolute -left-[34px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                isCurrent ? "ring-2 ring-blue-300 bg-white" : "bg-white"
              }`}
            >
              {statusIcon(rec.status)}
            </span>

            <div className="flex flex-col">
              <span
                className={`text-sm font-medium ${
                  rec.status === "done"
                    ? "text-slate-500"
                    : rec.status === "skipped"
                    ? "text-slate-400 line-through"
                    : "text-slate-900"
                }`}
              >
                {label}
              </span>

              {sub ? (
                <span
                  className={`mt-0.5 text-xs ${
                    rec.status === "failed_server_busy"
                      ? "text-rose-700"
                      : rec.status === "failed_retrying"
                      ? "text-amber-700"
                      : "text-slate-500"
                  }`}
                >
                  {sub}
                </span>
              ) : null}

              {rec.error && rec.status !== "failed_server_busy" ? (
                <span className="mt-0.5 text-xs text-slate-400" title={rec.error}>
                  {rec.error.length > 80 ? `${rec.error.slice(0, 80)}…` : rec.error}
                </span>
              ) : null}

              {/* affordances row */}
              {(showRetry || showSkip || showSave) ? (
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {showRetry ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                      onClick={() => onRetry?.(rec.step_id)}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      Try again
                    </button>
                  ) : null}
                  {showSkip ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                      onClick={() => onSkip?.(rec.step_id)}
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip for now
                    </button>
                  ) : null}
                  {showSave ? (
                    <button
                      type="button"
                      className="text-slate-500 underline-offset-2 hover:underline"
                      onClick={() => onSaveAndContinue?.(rec.step_id)}
                    >
                      Save and continue later
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
