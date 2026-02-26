import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { SparkServiceLayout } from './SparkServiceLayout';

interface SparkLeadsPageProps {
  service: PortalService;
  status: ServiceStatus;
}

/**
 * Leads — Preview
 *
 * This is intentionally minimal and marked as a preview surface. It is wired
 * through the same layout so that when OLIVER/lead tracking is implemented
 * the portal page is already in place.
 */
export function SparkLeadsPage({ service, status }: SparkLeadsPageProps) {
  return (
    <SparkServiceLayout service={service} status={status}>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Leads — Preview</h2>
        <p className="mt-2 text-sm text-slate-600">
          This area will surface leads generated from SPARK campaigns and OLIVER workflows. For now
          it&apos;s a simple placeholder wired into the navigation so we can test the full flow.
        </p>
      </div>
    </SparkServiceLayout>
  );
}