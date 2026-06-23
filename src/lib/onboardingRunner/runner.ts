// C:/dev/iadm/Portal/src/lib/onboardingRunner/runner.ts
//
// OnboardingRunner — engine. Sequential step executor with the
// retry → server-busy → notify-founder ladder Brandon locked in
// (decision #3) and a save-and-continue gate per step (decision #2).
//
// This file is engine-only. The React component lives in
// components/onboarding/OnboardingRunnerProgress.tsx and the backend
// status mirror lives in oliver-api/routes/admin/onboardRunner.js.
//
// Design notes
// ─────────────
// • Engine is single-threaded — only one step ever in flight per Runner
//   instance. Conditional fan-out (e.g. ARION + SPARK both selected) is
//   handled at step-list-build time, not at runtime.
// • Engine never throws to its caller. Failures land in the StepRecord;
//   the on_step_change callback is the single channel out.
// • All wall-clock timestamps are emitted via new Date().toISOString() so
//   they match the StepRecord SQL contract (datetime2 UTC).
// • Polling: waitFor() is invoked on a fixed cadence pulled from the
//   Step's retry_delay_ms (acts as both poll cadence and retry back-off).
//   Override per-attempt via ActionResult.retryable_after_ms.
// • Save-and-continue: every status transition is flushed through
//   on_step_change before the engine awaits any timer. That means the
//   Portal can persist the StepRecord array to localStorage / the backend
//   immediately, and rehydrating mid-run is just "find the first step
//   that isn't done|skipped and resume from there".

import type {
  ActionResult,
  Runner,
  RunnerCtx,
  Step,
  StepRecord,
  StepStatus,
} from "./types";

/* ──────────────────────────────────────────────────────────────────────
 * Utility helpers
 * ────────────────────────────────────────────────────────────────────── */

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

const nowIso = (): string => new Date().toISOString();

/**
 * Read StepRecord.status and intentionally re-widen to the full
 * StepStatus union. transition() mutates the record through
 * Object.assign which prevents TS from following the type through await
 * boundaries — so callers that compare a status against the full union
 * after an await must go through this helper.
 */
function getStatus(record: StepRecord): import("./types").StepStatus {
  return record.status;
}

/**
 * Generate a v4 UUID without pulling in a dep. Prefers crypto.randomUUID
 * (available in modern browsers + node 19+), falls back to a Math.random
 * implementation so the engine still works in older test environments.
 */
function uuid(): string {
  const g: { crypto?: { randomUUID?: () => string } } =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: { randomUUID?: () => string } }) : {};
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  // Fallback — not crypto-strong, but the run_id only needs uniqueness
  // across one user's onboarding attempts, not global uniqueness.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * Runner factory
 * ────────────────────────────────────────────────────────────────────── */

export interface CreateRunnerOptions {
  /** If supplied, engine resumes from this snapshot instead of starting
   *  from scratch. Used by the save-and-continue rehydrate path. */
  initial_records?: StepRecord[];
  /** Max poll cycles for any single waitFor() loop before the engine
   *  treats the step as stalled. Defaults to 60 — at the typical
   *  retry_delay_ms of 5s that is a 5-minute upper bound on a single
   *  attempt. */
  max_poll_cycles?: number;
}

export function createRunner(
  ctxIn: Omit<RunnerCtx, "run_id"> & { run_id?: string },
  steps: Step[],
  options: CreateRunnerOptions = {},
): Runner {
  const ctx: RunnerCtx = { ...ctxIn, run_id: ctxIn.run_id || uuid() };
  const maxPollCycles = Math.max(1, options.max_poll_cycles ?? 60);

  // Build the records map. Honour any incoming snapshot so resumed runs
  // don't lose attempt_count + evidence.
  const records: StepRecord[] = steps.map((s) => {
    const prior = options.initial_records?.find((r) => r.step_id === s.id);
    return (
      prior ?? {
        step_id: s.id,
        status: "pending" as StepStatus,
        attempt_count: 0,
      }
    );
  });

  // Index by step_id for O(1) lookup.
  const recIndex = new Map<string, StepRecord>();
  records.forEach((r) => recIndex.set(r.step_id, r));
  const stepIndex = new Map<string, Step>();
  steps.forEach((s) => stepIndex.set(s.id, s));

  // Engine state — used to guarantee only one step is in flight at a
  // time even if start()/retry() are called concurrently from the UI.
  let inFlight: string | null = null;

  function emit(record: StepRecord): void {
    // Always emit a shallow clone so subscribers can safely store the
    // reference without worrying about engine-side mutation.
    ctx.callbacks.on_step_change({ ...record, evidence: record.evidence ? { ...record.evidence } : undefined });
  }

  function transition(record: StepRecord, patch: Partial<StepRecord>): void {
    Object.assign(record, patch);
    emit(record);
  }

  /**
   * Run one full attempt of a step (action → waitFor poll → verify). On
   * any failure, returns the failure error string + retry hint so the
   * outer ladder can decide whether to retry, surface failed_retrying, or
   * tip into failed_server_busy.
   */
  async function runOneAttempt(
    step: Step,
    record: StepRecord,
  ): Promise<{ ok: boolean; error?: string; retryable_after_ms?: number; evidence?: Record<string, unknown> }> {
    // ── action() ────────────────────────────────────────────────────
    transition(record, {
      status: "running",
      started_at: record.started_at || nowIso(),
      error: undefined,
    });

    let actionRes: ActionResult;
    try {
      actionRes = await step.action(ctx);
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || "action threw" };
    }
    if (!actionRes.ok) {
      return {
        ok: false,
        error: actionRes.error || "action returned ok:false",
        retryable_after_ms: actionRes.retryable_after_ms,
      };
    }

    let lastData = actionRes.data;
    const evidence: Record<string, unknown> = {
      ...(record.evidence || {}),
      action_data: lastData,
    };

    // ── waitFor() polling loop ──────────────────────────────────────
    if (step.waitFor) {
      transition(record, { status: "waiting", evidence });
      for (let cycle = 0; cycle < maxPollCycles; cycle++) {
        let pollRes: ActionResult;
        try {
          pollRes = await step.waitFor(ctx, lastData);
        } catch (e) {
          return { ok: false, error: (e as Error)?.message || "waitFor threw", evidence };
        }
        if (pollRes.ok) {
          lastData = pollRes.data ?? lastData;
          evidence.wait_data = lastData;
          break;
        }
        // ok:false with no error means "still waiting"; ok:false with
        // an error means abort the attempt.
        if (pollRes.error) {
          return {
            ok: false,
            error: pollRes.error,
            retryable_after_ms: pollRes.retryable_after_ms,
            evidence,
          };
        }
        await sleep(pollRes.retryable_after_ms || step.retry_delay_ms);
        if (cycle === maxPollCycles - 1) {
          return { ok: false, error: "waitFor exceeded max poll cycles", evidence };
        }
      }
    }

    // ── verify() ────────────────────────────────────────────────────
    if (step.verify) {
      transition(record, { status: "verifying", evidence });
      let verifyRes: ActionResult;
      try {
        verifyRes = await step.verify(ctx, lastData);
      } catch (e) {
        return { ok: false, error: (e as Error)?.message || "verify threw", evidence };
      }
      if (!verifyRes.ok) {
        return {
          ok: false,
          error: verifyRes.error || "verify returned ok:false",
          retryable_after_ms: verifyRes.retryable_after_ms,
          evidence,
        };
      }
      evidence.verify_data = verifyRes.data;
    }

    return { ok: true, evidence };
  }

  /**
   * Retry-then-server-busy-then-notify-founder ladder for one step.
   * Brandon decision #3: every step gets its full retry budget; if the
   * budget is blown the on_failure setting picks the terminal state.
   */
  async function executeStep(step: Step): Promise<void> {
    const record = recIndex.get(step.id);
    if (!record) return;
    if (record.status === "done" || record.status === "skipped") return;

    // attempt_count is cumulative across manual retries — preserve it.
    // The ladder budget is checked against max_retries from this point
    // forward (so a manual retry after exhaustion gets a fresh budget;
    // see retry() below for that reset path).
    const budget = Math.max(1, step.max_retries);
    let attemptsThisLadder = 0;

    /* eslint-disable no-constant-condition */
    while (true) {
      record.attempt_count += 1;
      attemptsThisLadder += 1;

      const result = await runOneAttempt(step, record);
      if (result.ok) {
        transition(record, {
          status: "done",
          completed_at: nowIso(),
          error: undefined,
          evidence: result.evidence,
        });
        return;
      }

      // Failure path — decide next state on the ladder.
      const isLastAttempt = attemptsThisLadder >= budget;
      if (!isLastAttempt) {
        transition(record, {
          status: "failed_retrying",
          error: result.error,
          evidence: result.evidence,
        });
        await sleep(result.retryable_after_ms || step.retry_delay_ms);
        continue;
      }

      // Budget exhausted — terminal route per on_failure.
      if (step.on_failure === "skip_allowed") {
        // We don't auto-skip; the UI presents a Skip button. Keep the
        // step in failed_retrying so the user sees both Retry + Skip
        // affordances. Engine pauses here until retry()/skip() is
        // called from the UI.
        transition(record, {
          status: "failed_retrying",
          error: result.error,
          evidence: result.evidence,
        });
        return;
      }
      // "retry" and "notify_founder" both halt the engine; the
      // distinction is only the copy the UI shows. notify_founder also
      // flips status to failed_server_busy so the backend status emitter
      // can fan out the founder notification.
      transition(record, {
        status: step.on_failure === "notify_founder" ? "failed_server_busy" : "failed_retrying",
        error: result.error,
        evidence: result.evidence,
      });
      return;
    }
    /* eslint-enable no-constant-condition */
  }

  /* ──────────────────────────────────────────────────────────────────
   * Public API
   * ────────────────────────────────────────────────────────────────── */

  async function start(): Promise<void> {
    if (inFlight) return; // already running
    try {
      for (const step of steps) {
        const record = recIndex.get(step.id);
        if (!record) continue;
        if (record.status === "done" || record.status === "skipped") continue;

        inFlight = step.id;
        await executeStep(step);
        inFlight = null;

        // Save-and-continue gate (decision #2): if the step landed in
        // a non-terminal-success state, halt the run. The UI shows the
        // appropriate Retry / Skip / "we have been notified" copy and
        // the user (or a retry click) is what kicks the engine forward.
        // Widen via getStatus() — transition() mutates record.status
        // through Object.assign which TS can't follow.
        const afterStatus = getStatus(record);
        if (afterStatus !== "done" && afterStatus !== "skipped") {
          ctx.callbacks.on_run_complete?.(snapshot());
          return;
        }
      }
      ctx.callbacks.on_run_complete?.(snapshot());
    } finally {
      inFlight = null;
    }
  }

  async function retry(step_id: string): Promise<void> {
    if (inFlight) return;
    const step = stepIndex.get(step_id);
    const record = recIndex.get(step_id);
    if (!step || !record) return;
    if (record.status !== "failed_retrying" && record.status !== "failed_server_busy") return;

    // Manual retry gets a fresh ladder budget — Brandon's decision #3
    // explicitly said the founder/customer click is a "try again" not a
    // "give up", so we reset the per-ladder counter inside executeStep.
    inFlight = step_id;
    try {
      await executeStep(step);
    } finally {
      inFlight = null;
    }

    // After the retry resolves, continue the run from the next pending
    // step (don't restart the whole list — just walk forward).
    // Widen via getStatus() — transition() mutates via Object.assign so
    // TS can't narrow record.status through the await.
    const postRetryStatus = getStatus(record);
    if (postRetryStatus === "done" || postRetryStatus === "skipped") {
      // Find this step's index and resume from the next entry.
      const idx = steps.findIndex((s) => s.id === step_id);
      for (let i = idx + 1; i < steps.length; i++) {
        const next = steps[i];
        const nextRec = recIndex.get(next.id);
        if (!nextRec) continue;
        if (nextRec.status === "done" || nextRec.status === "skipped") continue;
        inFlight = next.id;
        try {
          await executeStep(next);
        } finally {
          inFlight = null;
        }
        const nextStatus = getStatus(nextRec);
        if (nextStatus !== "done" && nextStatus !== "skipped") {
          ctx.callbacks.on_run_complete?.(snapshot());
          return;
        }
      }
      ctx.callbacks.on_run_complete?.(snapshot());
    }
  }

  function skip(step_id: string): void {
    const step = stepIndex.get(step_id);
    const record = recIndex.get(step_id);
    if (!step || !record) return;
    if (step.on_failure !== "skip_allowed") return;
    if (record.status === "done") return;
    transition(record, {
      status: "skipped",
      completed_at: nowIso(),
    });
  }

  function snapshot(): StepRecord[] {
    return records.map((r) => ({ ...r, evidence: r.evidence ? { ...r.evidence } : undefined }));
  }

  return { start, retry, skip, snapshot };
}
