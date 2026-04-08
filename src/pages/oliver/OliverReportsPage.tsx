import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface JobReport {
  status: string;
  count: number;
}

interface RevenueReport {
  total_revenue: number;
  payment_count: number;
  revenue_last_30d: number;
  revenue_last_7d: number;
  open_invoices: number;
  total_outstanding: number;
}

interface CompletionReport {
  total_jobs: number;
  completed_jobs: number;
  completion_rate: number;
}

export function OliverReportsPage() {
  const { get, ready } = useOliverApi();
  const [jobReport, setJobReport] = useState<JobReport[]>([]);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [completion, setCompletion] = useState<CompletionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [j, r, c] = await Promise.all([
          get<JobReport[]>("/reports/jobs"),
          get<RevenueReport>("/reports/revenue"),
          get<CompletionReport>("/reports/completion"),
        ]);
        if (!cancelled) { setJobReport(j); setRevenue(r); setCompletion(c); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl bg-white ring-1 ring-gray-200 p-5 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-5 text-red-700">{error}</div>
      </div>
    );
  }

  const maxJobCount = Math.max(1, ...jobReport.map((j) => j.count));

  const statusColors: Record<string, string> = {
    inquiry: "bg-purple-400",
    quoted: "bg-amber-400",
    scheduled: "bg-blue-400",
    in_progress: "bg-cyan-400",
    completed: "bg-green-400",
    invoiced: "bg-indigo-400",
    paid: "bg-emerald-500",
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <p className="text-sm text-slate-500">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-green-600">${(revenue?.total_revenue ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <p className="text-sm text-slate-500">Revenue (30d)</p>
          <p className="mt-1 text-2xl font-bold text-green-600">${(revenue?.revenue_last_30d ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <p className="text-sm text-slate-500">Completion Rate</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{completion?.completion_rate ?? 0}%</p>
        </div>
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <p className="text-sm text-slate-500">Total Jobs</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{completion?.total_jobs ?? 0}</p>
        </div>
      </div>

      {/* Job Volume by Status — CSS Bar Chart */}
      <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Job Volume by Status</h2>
        {jobReport.length === 0 ? (
          <p className="text-sm text-slate-400">No job data available.</p>
        ) : (
          <div className="space-y-3">
            {jobReport.map((j) => (
              <div key={j.status} className="flex items-center gap-3">
                <span className="w-24 text-xs text-slate-600 text-right">{j.status.replace("_", " ")}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${statusColors[j.status] ?? "bg-gray-400"}`}
                    style={{ width: `${(j.count / maxJobCount) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-xs text-slate-600">{j.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completion Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Completion</h2>
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="16" fill="none" stroke="#3b82f6" strokeWidth="3"
                  strokeDasharray={`${(completion?.completion_rate ?? 0)} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
                {completion?.completion_rate ?? 0}%
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-slate-600">Completed: <span className="font-medium text-slate-800">{completion?.completed_jobs ?? 0}</span></p>
              <p className="text-slate-600">Total: <span className="font-medium text-slate-800">{completion?.total_jobs ?? 0}</span></p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Revenue Summary</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50">
                <td className="py-2 text-slate-600">Total Revenue</td>
                <td className="py-2 text-right font-medium text-slate-800">${(revenue?.total_revenue ?? 0).toLocaleString()}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-2 text-slate-600">Last 30 Days</td>
                <td className="py-2 text-right font-medium text-slate-800">${(revenue?.revenue_last_30d ?? 0).toLocaleString()}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-2 text-slate-600">Last 7 Days</td>
                <td className="py-2 text-right font-medium text-slate-800">${(revenue?.revenue_last_7d ?? 0).toLocaleString()}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-2 text-slate-600">Open Invoices</td>
                <td className="py-2 text-right font-medium text-amber-600">{revenue?.open_invoices ?? 0}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-2 text-slate-600">Outstanding</td>
                <td className="py-2 text-right font-medium text-red-600">${(revenue?.total_outstanding ?? 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
