/**
 * SetupChecklistCard — the ONE "Finish setting up" card.
 *
 * Drawn first for SPARK (SparkSetupChecklist, 2026-09-08) and lifted out here
 * on 1 Oct 2026 when STELLA needed the same card on its Overview — Brandon:
 * "STELLA is the only section that doesn't have its own overview … this is
 * helpful for things like 'Finish Setup'". Two products, one drawing: each
 * product decides WHICH steps there are and whether each is done; this file
 * only draws them. Do not fork a third copy — add a prop.
 *
 * Every actionable row is a link to the screen that does the step. A row
 * without a route is drawn as plain text (SPARK drops those before they get
 * here). A tier-locked row names the plan it needs and is not clickable.
 *
 * Pure presentation: no fetching, no storage, no MSAL — so a render test can
 * draw it (test/stella-overview-setup).
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, ListChecks, Lock } from "lucide-react";

export interface SetupChecklistRow {
  key: string;
  /** The step, as a short instruction. */
  label: string;
  /** One plain sentence under the label (optional). */
  detail?: string;
  done: boolean;
  /** Where the step is done. */
  route?: string;
  /** Where the link goes, in words ("Settings → Bank and card accounts"). Without it, a chevron. */
  linkLabel?: string;
  locked?: boolean;
  /** The plan a locked row needs. */
  lockedTag?: string | null;
}

export interface SetupChecklistGroup {
  /** Small caps heading over the rows (optional). */
  heading?: string;
  rows: SetupChecklistRow[];
}

export function SetupChecklistCard({
  title = "Finish setting up",
  done,
  total,
  percent,
  groups,
  accent,
  accentTint,
  borderColor,
  headerRight,
  footer,
  numbered = false,
  className = "",
  dataTour,
}: {
  title?: string;
  done: number;
  total: number;
  /** Defaults to done / total. */
  percent?: number;
  groups: SetupChecklistGroup[];
  /** The product's colour — icon, progress bar, row hover, link text. */
  accent: string;
  /** A pale wash of the accent for row hover. */
  accentTint: string;
  borderColor?: string;
  headerRight?: ReactNode;
  footer?: ReactNode;
  /** Number the steps (1, 2, 3 …) in order across groups. */
  numbered?: boolean;
  className?: string;
  dataTour?: string;
}) {
  const pct = percent ?? (total > 0 ? Math.round((done / total) * 100) : 0);
  const vars = { "--ck-accent": accent, "--ck-tint": accentTint } as CSSProperties;
  let n = 0;
  return (
    <section
      data-tour={dataTour}
      aria-label={title}
      className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}
      style={{ ...vars, ...(borderColor ? { borderColor } : null) }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ListChecks className="h-4 w-4" style={{ color: accent }} />
          {title}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {done} of {total} done
          </span>
          {headerRight}
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: accent }}
        />
      </div>

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g, gi) => (
          <div key={g.heading || gi}>
            {g.heading && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.heading}</p>
            )}
            <ul className={`${g.heading ? "mt-1.5" : "mt-3"} space-y-1`}>
              {g.rows.map((r) => {
                n += 1;
                return <Row key={r.key} row={r} index={numbered ? n : undefined} accent={accent} />;
              })}
            </ul>
          </div>
        ))}

      {footer}
    </section>
  );
}

function Tick({ done, index }: { done: boolean; index?: number }) {
  if (done) {
    return (
      <span
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500"
        aria-label="Done"
      >
        <Check className="h-2.5 w-2.5 text-white" />
      </span>
    );
  }
  return (
    <span
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-500"
      aria-label="Not done yet"
    >
      {index ?? ""}
    </span>
  );
}

function Row({ row, index, accent }: { row: SetupChecklistRow; index?: number; accent: string }) {
  // A tier-locked step says which plan it needs and does not pretend to be
  // clickable — the nav's own wall would bounce it anyway.
  if (row.locked) {
    return (
      <li className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Lock className="h-3 w-3 flex-shrink-0" />
        <span className="flex-1">{row.label}</span>
        {row.lockedTag && (
          <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
            {row.lockedTag}
          </span>
        )}
      </li>
    );
  }

  const body = (
    <>
      <span className={row.detail ? "mt-0.5" : undefined}>
        <Tick done={row.done} index={index} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{row.label}</span>
        {row.detail && <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{row.detail}</span>}
        {/* On a phone the destination sits under the sentence; wider, at the right. */}
        {row.route && row.linkLabel && (
          <span className="mt-1 block text-[11px] font-semibold sm:hidden" style={{ color: accent }}>
            {row.linkLabel} →
          </span>
        )}
      </span>
      {row.route &&
        (row.linkLabel ? (
          <span className="hidden flex-shrink-0 self-center whitespace-nowrap text-[11px] font-semibold sm:inline" style={{ color: accent }}>
            {row.linkLabel} →
          </span>
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 self-center text-slate-400" />
        ))}
    </>
  );

  const rowClass = `flex ${row.detail ? "items-start" : "items-center"} gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700`;
  if (!row.route) return <li className={rowClass}>{body}</li>;
  return (
    <li>
      <Link
        to={row.route}
        className={`${rowClass} hover:border-[var(--ck-accent)] hover:bg-[var(--ck-tint)]`}
      >
        {body}
      </Link>
    </li>
  );
}

export default SetupChecklistCard;
