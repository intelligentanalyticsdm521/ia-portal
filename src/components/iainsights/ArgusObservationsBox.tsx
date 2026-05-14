// ArgusObservationsBox — v8.0 reusable dark ARGUS Intelligence section.
//
// Renders the same dark-themed numbered-observations + recommended-actions
// box that appears at the bottom of every IA Insights report modal. Used
// by ARION, SPARK, OLIVER, and eventually ARGUS itself.
//
// The legacy ARION ArgusInsightBox computes observations inline from raw
// data. v8.0 moves to the rule-library pattern: callers pass pre-computed
// observations + actions (from evaluateRules()). This component is now
// pure presentation.

interface Props {
  /** Pre-computed observation strings (max 5-8 typically). */
  observations: string[];
  /** Pre-computed action strings (max 3-5 typically). */
  actions: string[];
  /** Display label for the report (e.g. "Contact Health"). */
  reportLabel: string;
  /** Tenant identifier shown in the box header (domain or workspace name). */
  tenantLabel?: string;
  /** Period label shown in the header (e.g. "Q1 2026"). */
  periodLabel?: string;
}

export function ArgusObservationsBox({
  observations,
  actions,
  reportLabel,
  tenantLabel,
  periodLabel = "Latest period",
}: Props) {
  return (
    <div className="rounded-lg bg-slate-900 text-slate-100 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
          style={{ background: "#84CC1620", color: "#A3E635" }}
        >
          ARGUS
        </span>
        <span className="text-sm text-slate-200">
          Intelligence for {tenantLabel || "your workspace"} · {periodLabel}
        </span>
      </div>

      {observations.length === 0 && actions.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          Not enough data yet — observations populate after the first scoring period.
        </p>
      ) : (
        <>
          {observations.length > 0 && (
            <ol className="space-y-3 mb-4">
              {observations.map((obs, i) => (
                <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
                  <span
                    className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "#EA580C", color: "white" }}
                  >
                    {i + 1}
                  </span>
                  <span>{obs}</span>
                </li>
              ))}
            </ol>
          )}

          {actions.length > 0 && (
            <div className="border-t border-slate-700 pt-3 mt-1">
              <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A3E635" }}>
                Recommended actions
              </div>
              <ul className="space-y-2">
                {actions.map((act, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
                    <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full" style={{ background: "#EA580C" }} />
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="border-t border-slate-700 mt-4 pt-3 flex items-center justify-between text-[10px] text-slate-500">
        <span>Report: {reportLabel}</span>
        <span>Powered by ARGUS</span>
      </div>
    </div>
  );
}

export default ArgusObservationsBox;
