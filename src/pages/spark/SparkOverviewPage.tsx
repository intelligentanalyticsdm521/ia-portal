import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { SparkServiceLayout } from './SparkServiceLayout';

interface SparkOverviewPageProps {
  service: PortalService;
  status: ServiceStatus;
}

/**
 * SPARK Overview — high-level read-only summary.
 *
 * At the moment the metrics are static placeholders wired for v1 testing.
 * Once SPARK usage endpoints are available, this page can call platform-api
 * to populate the cards with live data.
 */
export function SparkOverviewPage({ service, status }: SparkOverviewPageProps) {
  const emailTotal = 5000;
  const emailUsed = 0;
  const emailRemaining = emailTotal - emailUsed;

  const smsTotal = 500;
  const smsUsed = 0;
  const smsRemaining = smsTotal - smsUsed;

  return (
    <SparkServiceLayout service={service} status={status}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SparkStatCard
          label="Email sends used"
          primary={`${emailUsed.toLocaleString()} / ${emailTotal.toLocaleString()}`}
          helper={`${emailRemaining.toLocaleString()} remaining in plan`}
        />
        <SparkStatCard
          label="SMS sends used"
          primary={`${smsUsed.toLocaleString()} / ${smsTotal.toLocaleString()}`}
          helper={`${smsRemaining.toLocaleString()} remaining in plan`}
        />
        <SparkStatCard label="Active audiences" primary="0" helper="Audiences will appear here." />
        <SparkStatCard
          label="Active automations"
          primary="0"
          helper="Automations will appear here once configured."
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent campaigns</h2>
            <span className="text-xs text-slate-500">Email &amp; SMS</span>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            No campaigns have been sent yet. Once SPARK campaigns go live, their results will appear
            here.
          </p>
          <table className="min-w-full text-left text-xs text-slate-600">
            <thead>
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Channel</th>
                <th className="py-2 pr-3 font-semibold">Sent</th>
                <th className="py-2 pr-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-dashed border-slate-200">
                <td className="py-3 pr-3 text-slate-400">No data yet</td>
                <td className="py-3 pr-3 text-slate-400">—</td>
                <td className="py-3 pr-3 text-slate-400">—</td>
                <td className="py-3 pr-3 text-right text-slate-400">Waiting for first send</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming campaigns</h2>
            <span className="text-xs text-slate-500">Next 30 days</span>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            This view will list any scheduled SPARK campaigns. For now it shows a simple placeholder
            so the UI can be verified end-to-end.
          </p>
          <table className="min-w-full text-left text-xs text-slate-600">
            <thead>
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Channel</th>
                <th className="py-2 pr-3 font-semibold">Scheduled</th>
                <th className="py-2 pr-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-dashed border-slate-200">
                <td className="py-3 pr-3 text-slate-400">No upcoming campaigns</td>
                <td className="py-3 pr-3 text-slate-400">—</td>
                <td className="py-3 pr-3 text-slate-400">—</td>
                <td className="py-3 pr-3 text-right text-slate-400">Nothing scheduled</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </SparkServiceLayout>
  );
}

interface StatProps {
  label: string;
  primary: string;
  helper?: string;
}

function SparkStatCard({ label, primary, helper }: StatProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{primary}</div>
      {helper && <div className="mt-1 text-xs text-slate-500">{helper}</div>}
    </div>
  );
}