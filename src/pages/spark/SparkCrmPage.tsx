import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { SparkServiceLayout } from './SparkServiceLayout';

interface SparkCrmPageProps {
  service: PortalService;
  status: ServiceStatus;
}

/**
 * Read-only CRM list pulled from SPARK.
 * For v1 this is wired with placeholder rows so that the table, sorting,
 * and pagination can be verified from the portal side.
 */
export function SparkCrmPage({ service, status }: SparkCrmPageProps) {
  // Placeholder people so the grid feels real even before SPARK is wired up.
  const exampleRows = [
    { name: 'Alexis Baker', email: 'alexis@example.com', created: 'Jan 10, 2026', tags: ['Lead'] },
    {
      name: 'Jordan Rivera',
      email: 'jordan@example.com',
      created: 'Jan 12, 2026',
      tags: ['Customer', 'Recurring']
    },
    {
      name: 'Taylor Kim',
      email: 'taylor@example.com',
      created: 'Jan 15, 2026',
      tags: ['Lead', 'High intent']
    }
  ];

  return (
    <SparkServiceLayout service={service} status={status}>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">Contacts</span>
            <span className="text-xs text-slate-500">
              Read-only mirror of SPARK contacts and basic engagement.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Search contacts"
              className="h-8 rounded-md border border-slate-300 bg-slate-50 px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <table className="min-w-full text-left text-xs text-slate-700">
          <thead>
            <tr>
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Email</th>
              <th className="py-2 pr-3 font-semibold">Created</th>
              <th className="py-2 pr-3 font-semibold">Tags</th>
            </tr>
          </thead>
          <tbody>
            {exampleRows.map((row) => (
              <tr key={row.email} className="border-t border-slate-100">
                <td className="py-2 pr-3 text-slate-900">{row.name}</td>
                <td className="py-2 pr-3 text-slate-700">{row.email}</td>
                <td className="py-2 pr-3 text-slate-500">{row.created}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {row.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}

            {exampleRows.length === 0 && (
              <tr className="border-t border-dashed border-slate-200">
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No contacts yet. Once SPARK is connected, your CRM records will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SparkServiceLayout>
  );
}