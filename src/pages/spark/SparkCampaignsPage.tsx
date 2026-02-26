import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { SparkServiceLayout } from './SparkServiceLayout';

interface SparkCampaignsPageProps {
  service: PortalService;
  status: ServiceStatus;
}

/**
 * Campaigns & Messaging — read-only summary of recent and upcoming SPARK campaigns.
 */
export function SparkCampaignsPage({ service, status }: SparkCampaignsPageProps) {
  const recent = [
    {
      name: 'Welcome series — v1',
      channel: 'Email',
      sent: '—',
      status: 'Draft'
    },
    {
      name: 'First SMS reminder (example)',
      channel: 'SMS',
      sent: '—',
      status: 'Draft'
    }
  ];

  const upcoming: typeof recent = [];

  return (
    <SparkServiceLayout service={service} status={status}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent campaigns</h2>
            <span className="text-xs text-slate-500">Email &amp; SMS</span>
          </div>
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead>
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Channel</th>
                <th className="py-2 pr-3 font-semibold">Sent</th>
                <th className="py-2 pr-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.name} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-900">{row.name}</td>
                  <td className="py-2 pr-3 text-slate-700">{row.channel}</td>
                  <td className="py-2 pr-3 text-slate-500">{row.sent}</td>
                  <td className="py-2 pl-3 text-right text-slate-600">{row.status}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr className="border-t border-dashed border-slate-200">
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No campaigns have been sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming campaigns</h2>
            <span className="text-xs text-slate-500">Next 30 days</span>
          </div>
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead>
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Channel</th>
                <th className="py-2 pr-3 font-semibold">Scheduled</th>
                <th className="py-2 pr-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => (
                <tr key={row.name} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-900">{row.name}</td>
                  <td className="py-2 pr-3 text-slate-700">{row.channel}</td>
                  <td className="py-2 pr-3 text-slate-500">{row.sent}</td>
                  <td className="py-2 pl-3 text-right text-slate-600">{row.status}</td>
                </tr>
              ))}
              {upcoming.length === 0 && (
                <tr className="border-t border-dashed border-slate-200">
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No upcoming campaigns yet. Scheduled campaigns will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SparkServiceLayout>
  );
}