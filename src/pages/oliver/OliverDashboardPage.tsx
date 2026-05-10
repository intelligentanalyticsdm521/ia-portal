import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button, StatusBadge } from "../../components/oliver/ui";

interface DashboardStats {
  activeJobs: number;
  revenue: number;
  openInvoices: number;
  workers: number;
}
interface ActivityEvent {
  id: string;
  description: string;
  type: string;
  created_at: string;
}

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function OliverDashboardPage() {
  const { get, ready } = useOliverApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [s, a] = await Promise.all([
          get<DashboardStats>("/dashboard/stats"),
          get<ActivityEvent[]>("/dashboard/activity"),
        ]);
        setStats(s);
        setActivity(a || []);
      } catch (e) { setError(e); }
      finally { setLoading(false); }
    })();
  }, [get, ready]);

  return (
    <OliverPageWrapper title="Dashboard" subtitle="Overview" error={error} loading={loading}>
      <PageHeader
        title="Dashboard"
        subtitle="What's happening in your business right now"
        actions={
          <>
            <Link to="/app/services/oliver_invoices">
              <Button variant="ghost">Invoices</Button>
            </Link>
            <Link to="/app/services/oliver_job_board">
              <Button variant="primary">Open job board</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <DashCard label="Active jobs" value={stats?.activeJobs ?? 0} link="/app/services/oliver_job_board" />
        <DashCard label="Revenue (paid)" value={fmtMoney(stats?.revenue)} link="/app/services/oliver_payments" tone="emerald" />
        <DashCard label="Open invoices" value={stats?.openInvoices ?? 0} link="/app/services/oliver_invoices" tone="teal" />
        <DashCard label="Active workers" value={stats?.workers ?? 0} link="/app/services/oliver_workers" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal">Recent activity</h3>
            <Link to="/app/services/oliver_activity_log" className="text-xs text-slate-500 hover:text-oliver-teal">View all →</Link>
          </div>
          {activity.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400 italic">No activity yet — your first job, quote, or invoice will appear here.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {activity.slice(0, 12).map((e) => (
                <li key={e.id} className="py-2.5 flex items-start gap-3">
                  <StatusBadge status={e.type || "system"} />
                  <div className="flex-1">
                    <div className="text-sm text-slate-700">{e.description}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal mb-3">Quick actions</h3>
          <div className="space-y-2">
            <QuickLink to="/app/services/oliver_catalog" label="Manage service catalog" hint="Define what you sell" />
            <QuickLink to="/app/services/oliver_quotes" label="Create a quote" hint="Send pricing to a customer" />
            <QuickLink to="/app/services/oliver_invoices" label="Send an invoice" hint="Get paid for a completed job" />
            <QuickLink to="/app/services/oliver_workers" label="Add a worker" hint="Set their weekly availability" />
            <QuickLink to="/app/services/oliver_settings" label="Connect Stripe" hint="Enable payments" />
            <QuickLink to="/app/services/oliver_reports" label="View reports" hint="Revenue trends & analytics" />
          </div>
        </aside>
      </div>
    </OliverPageWrapper>
  );
}

function DashCard({ label, value, link, tone = "teal" }: { label: string; value: React.ReactNode; link?: string; tone?: "teal" | "emerald" | "amber" }) {
  const colors: Record<string, string> = { teal: "text-oliver-teal", emerald: "text-emerald-600", amber: "text-amber-600" };
  const card = (
    <div className="rounded-xl bg-white ring-1 ring-gray-200 shadow-oliver-card px-5 py-4 hover:shadow-md transition">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${colors[tone]}`}>{value}</div>
    </div>
  );
  return link ? <Link to={link}>{card}</Link> : card;
}

function QuickLink({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link to={to} className="block rounded-lg px-3 py-2 hover:bg-oliver-gold-50 transition">
      <div className="text-sm font-medium text-oliver-teal">{label}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </Link>
  );
}
