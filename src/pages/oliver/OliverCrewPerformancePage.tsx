import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface CrewStat {
  worker_id: string;
  first_name: string;
  last_name: string;
  type: string;
  total_assignments: number;
  completed_jobs: number;
}

export function OliverCrewPerformancePage() {
  const { get, ready } = useOliverApi();
  const [crew, setCrew] = useState<CrewStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<CrewStat[]>("/reports/crew");
        if (!cancelled) setCrew(data);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  const maxAssignments = Math.max(1, ...crew.map((c) => c.total_assignments));

  return (
    <OliverPageWrapper title="Crew Performance" subtitle="Per-worker completion stats" error={error} loading={loading}>
      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Worker</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Assigned</th>
              <th className="px-4 py-3 text-right">Completed</th>
              <th className="px-4 py-3 w-48">Completion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {crew.map((c) => {
              const pct = c.total_assignments > 0 ? Math.round((c.completed_jobs / c.total_assignments) * 100) : 0;
              const barWidth = (c.total_assignments / maxAssignments) * 100;
              return (
                <tr key={c.worker_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.first_name} {c.last_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.type === "employee" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.total_assignments}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.completed_jobs}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${barWidth}%` }}
                        >
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 w-10 text-right">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {crew.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No crew performance data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </OliverPageWrapper>
  );
}
