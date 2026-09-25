// JobColorGuide + JobStatusPill — the visible side of src/oliver/jobStatusColors.
//
// The guide sits at the bottom of every job calendar (Brandon, W-OB-05: "in the
// calendar we can put a guide at the bottom"): the four colours in his words,
// then one quiet line for the states that are not asking for anything.
import { JOB_COLOR_GUIDE, JOB_COLOR_OTHERS, jobColor, type JobColorFacts } from "../../oliver/jobStatusColors";

export function JobColorGuide({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 ${className}`}
      aria-label="What the colours mean"
    >
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">What the colours mean</div>
      <ul className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {JOB_COLOR_GUIDE.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-xs text-slate-700">
            <span
              aria-hidden
              className="mt-0.5 inline-block h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ background: c.solid, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
            />
            <span>
              <strong className="font-semibold text-slate-900">{c.name} — {c.label}.</strong>{" "}
              {c.meaning}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>Also:</span>
        {JOB_COLOR_OTHERS.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: c.solid, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
            />
            {c.name.toLowerCase()} = {c.label.toLowerCase()}{c.key === "done" ? " (completed, invoiced or paid)" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A job's status pill, coloured by the one map. The text stays the status. */
export function JobStatusPill({ status, facts }: { status: string; facts: JobColorFacts }) {
  const c = jobColor({ ...facts, status });
  return (
    <span
      className="status-pill"
      style={{ background: c.soft, color: c.softText }}
      title={`${c.label}: ${c.meaning}`}
    >
      {String(status || "").replace(/_/g, " ")}
    </span>
  );
}
