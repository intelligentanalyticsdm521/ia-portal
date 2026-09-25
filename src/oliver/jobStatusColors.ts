// jobStatusColors — the ONE status → colour map for OLIVER jobs.
//
// Every place a job is coloured reads it from here: the Schedule calendar
// (month grid + day view), the Job Board's List and Kanban status pills, the
// Dashboard's Weekly Glance and its full calendar. Pure module (no React) so
// the rule is unit-tested.
//
// The founder's rule — Brandon, walk W-OB-05, 25 Sep 2026:
//   "Green ready to work, yellow business side attention needed, orange
//    customer side or customer issue needs attention, blue new requests
//    needing confirmed."
//
//   green  = confirmed and a worker is assigned: ready to work
//   yellow = confirmed, but the business has to act: no worker assigned yet
//   orange = the customer's side needs attention: the customer asked to
//            reschedule (a pending oliver.reschedule_request on the job), or
//            another customer issue (a booking the customer did not turn up for)
//   blue   = a new request waiting to be confirmed: an inquiry, a quote not
//            yet accepted, a booking waiting for confirmation
//
// The other states keep a colour of their own, chosen so none of them can be
// read as one of the four above: work under way (teal), done — completed,
// invoiced or paid (grey), cancelled (red). Before this map, completed and
// paid were green and invoiced was blue, which would have told the reader a
// finished job was "ready to work" or "a new request".

export type JobColorKey =
  | "ready"
  | "business_attention"
  | "customer_attention"
  | "new_request"
  | "in_progress"
  | "done"
  | "cancelled";

export interface JobColor {
  key: JobColorKey;
  /** The colour's everyday name, as the guide says it. */
  name: string;
  /** Short label for the guide and pill tooltips. */
  label: string;
  /** What it means, in plain words. */
  meaning: string;
  /** Calendar card background. */
  solid: string;
  /** Text on a calendar card. */
  onSolid: string;
  /** Status pill background. */
  soft: string;
  /** Status pill text. */
  softText: string;
}

export const JOB_COLORS: Record<JobColorKey, JobColor> = {
  ready: {
    key: "ready", name: "Green", label: "Ready to work",
    meaning: "Confirmed, and a worker is assigned.",
    solid: "#16A34A", onSolid: "#FFFFFF", soft: "#DCFCE7", softText: "#166534",
  },
  business_attention: {
    key: "business_attention", name: "Yellow", label: "Needs attention on your side",
    meaning: "Confirmed, but no worker is assigned yet.",
    solid: "#FACC15", onSolid: "#422006", soft: "#FEF9C3", softText: "#854D0E",
  },
  customer_attention: {
    key: "customer_attention", name: "Orange", label: "Needs attention on the customer's side",
    meaning: "The customer asked to reschedule, or there is another customer issue (such as a missed booking).",
    solid: "#EA580C", onSolid: "#FFFFFF", soft: "#FFEDD5", softText: "#9A3412",
  },
  new_request: {
    key: "new_request", name: "Blue", label: "New request",
    meaning: "A new request waiting for you to confirm it.",
    solid: "#2563EB", onSolid: "#FFFFFF", soft: "#DBEAFE", softText: "#1E40AF",
  },
  in_progress: {
    key: "in_progress", name: "Teal", label: "Work under way",
    meaning: "The crew has started the job.",
    solid: "#0D9488", onSolid: "#FFFFFF", soft: "#CCFBF1", softText: "#115E59",
  },
  done: {
    key: "done", name: "Grey", label: "Done",
    meaning: "Completed, invoiced or paid.",
    solid: "#64748B", onSolid: "#FFFFFF", soft: "#F1F5F9", softText: "#334155",
  },
  cancelled: {
    key: "cancelled", name: "Red", label: "Cancelled",
    meaning: "Called off.",
    solid: "#FEE2E2", onSolid: "#991B1B", soft: "#FEE2E2", softText: "#991B1B",
  },
};

/** The guide at the bottom of every job calendar: the founder's four, in his order. */
export const JOB_COLOR_GUIDE: JobColor[] = [
  JOB_COLORS.ready,
  JOB_COLORS.business_attention,
  JOB_COLORS.customer_attention,
  JOB_COLORS.new_request,
];

/** The other states, named on the guide's second line. */
export const JOB_COLOR_OTHERS: JobColor[] = [
  JOB_COLORS.in_progress,
  JOB_COLORS.done,
  JOB_COLORS.cancelled,
];

/** What the rule needs to know about a job (or a booking not yet a job). */
export interface JobColorFacts {
  /** "job" | "booking" — a booking is a request that is not a job yet. */
  kind?: string | null;
  status?: string | null;
  /** At least one worker is assigned. Unknown (null/undefined) counts as no. */
  hasWorker?: boolean | null;
  /** The customer asked to reschedule, or another customer-side issue is open. */
  customerAttention?: boolean | null;
}

const DONE = new Set(["completed", "invoiced", "paid"]);
const CANCELLED = new Set(["cancelled", "declined"]);
const NEW_REQUEST = new Set(["inquiry", "quoted", "draft", "pending", "pending_confirmation"]);

export function jobColorKey(f: JobColorFacts): JobColorKey {
  const s = String(f.status || "").toLowerCase();
  if (CANCELLED.has(s)) return "cancelled";
  if (DONE.has(s)) return "done";
  // Customer side first: a job the customer asked to move needs a decision
  // whether or not a worker is on it.
  if (f.customerAttention || s === "no_show") return "customer_attention";
  if (NEW_REQUEST.has(s)) return "new_request";
  if (s === "in_progress") return "in_progress";
  // A confirmed booking that has not become a job yet: the business has to act.
  if (f.kind === "booking") return "business_attention";
  // scheduled / dispatched / assigned (and any other live state): green only
  // when someone is on it. An "assigned" status with no assignment facts sent
  // is taken at its word.
  const worker = f.hasWorker ?? s === "assigned";
  return worker ? "ready" : "business_attention";
}

export function jobColor(f: JobColorFacts): JobColor {
  return JOB_COLORS[jobColorKey(f)];
}

// ─── Facts from each feed ────────────────────────────────────────────────────

/** A /calendar/unified event (the Schedule page). */
export interface UnifiedJobEventLike {
  kind?: string | null;
  status?: string | null;
  worker_count?: number | null;
  reschedule_requested?: boolean | null;
}

export function factsFromUnifiedEvent(
  e: UnifiedJobEventLike,
  hint?: { hasWorker?: boolean | null; customerAttention?: boolean | null } | null,
): JobColorFacts {
  return {
    kind: e.kind,
    status: e.status,
    hasWorker: e.worker_count != null ? e.worker_count > 0 : hint?.hasWorker ?? null,
    customerAttention: e.reschedule_requested ?? hint?.customerAttention ?? null,
  };
}

/** A /schedule/calendar event (the Dashboard's Weekly Glance and full calendar). */
export interface ScheduleEventLike {
  type?: string | null;
  status?: string | null;
  worker_id?: string | null;
  reschedule_requested?: boolean | null;
}

export function factsFromScheduleEvent(e: ScheduleEventLike): JobColorFacts {
  return {
    kind: e.type || "job",
    status: e.status,
    // The feed sends one row per active assignment; a row with a worker means
    // the job has one. A job with nobody on it arrives with worker_id null.
    hasWorker: e.type === "booking" ? false : !!e.worker_id,
    customerAttention: e.reschedule_requested ?? null,
  };
}

/** A GET /jobs row (the Job Board's List and Kanban). */
export interface JobRowLike {
  status?: string | null;
  assignedWorkers?: unknown[] | null;
  rescheduleRequested?: boolean | null;
}

export function factsFromJobRow(j: JobRowLike): JobColorFacts {
  return {
    kind: "job",
    status: j.status,
    hasWorker: Array.isArray(j.assignedWorkers) ? j.assignedWorkers.length > 0 : null,
    customerAttention: j.rescheduleRequested ?? null,
  };
}
