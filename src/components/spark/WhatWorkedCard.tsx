// WhatWorkedCard — "What worked in <Month>", the monthly report as a card.
//
// Reads GET /api/v1/insights/findings, which is the SAME payload the monthly
// email is rendered from, so the card and the client's inbox can never
// disagree. One fetch, per the portal data-fetching convention.
//
// TIER: the server has already stripped what this business may not see, and it
// says WHICH gate applied — `lead_intelligence: false` means Hot / Warm / Cold
// is a Pro feature, `narrative_available: false` means the paragraph is a
// Standard one. Two reasons, never collapsed into one "locked". This component
// reads those flags; it never decides entitlement for itself.
//
// L4: nothing on this card acts. The plays link to the screen where the owner
// can do the thing, and Done / Dismiss only record what they decided.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { IL_FINDINGS_PATHS, type IlFindingsReport } from "../../lib/ilFindingsApi";

const WHAT_WORKED_ROUTE = "/app/services/spark_what_worked";

export function WhatWorkedCard({ className = "" }: { className?: string } = {}) {
  const { get, ready } = useLumenApi();
  const [report, setReport] = useState<IlFindingsReport | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setReport(await get<IlFindingsReport>(IL_FINDINGS_PATHS.report()));
    } catch {
      // Quiet: this is a card on a dashboard, not the dashboard.
      setReport(null);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  // Nothing to say yet is not a card. A business in its first month should not
  // be shown an empty box once a month telling it so.
  if (!report || report.empty || !report.findings.length) return null;

  const openPlays = report.playbooks.filter((p) => p.status === "open");
  const headline = report.findings.slice(0, 3);

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <BarChart3 className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-900">What worked in {report.label}</h2>
        {openPlays.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {openPlays.length} {openPlays.length === 1 ? "thing to do" : "things to do"}
          </span>
        )}
        <Link
          to={WHAT_WORKED_ROUTE}
          className="ml-auto text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
        >
          See the whole report
        </Link>
      </div>

      <div className="px-4 py-3">
        {report.narrative ? (
          <p className="text-sm leading-relaxed text-slate-700">{report.narrative}</p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-700">
            Here is where the work came from last month, what it cost and what got a response.
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {headline.map((f) => (
            <li key={f.finding_id} className="text-sm text-slate-900">
              <span className="font-medium">{f.title_plain}</span>
              <span className="block text-xs text-slate-600">{f.body_plain}</span>
            </li>
          ))}
        </ul>

        {report.findings.length > headline.length && (
          <Link
            to={WHAT_WORKED_ROUTE}
            className="mt-3 inline-block text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
          >
            {report.findings.length - headline.length} more, with the numbers behind each one
          </Link>
        )}

        <p className="mt-3 text-[11px] text-slate-400">Powered by ARGUS AI</p>
      </div>
    </div>
  );
}

export default WhatWorkedCard;
