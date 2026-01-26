import type { PortalService } from '../../config/serviceCatalog';

export function ComingSoonPage({ service }: { service: PortalService }) {
  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body">
        <h1 className="text-2xl font-semibold">{service.displayName}</h1>
        <p className="mt-2 text-sm text-gray-600">Coming soon.</p>
        </div>
      </section>

      <section className="iadm-card">
        <div className="iadm-card-body">
        <h2 className="text-base font-semibold">Status</h2>
        <p className="mt-2 text-sm text-gray-700">
          This section is a placeholder for upcoming software. When the full build is released, this placeholder will be
          replaced with the linked experience.
        </p>
        </div>
      </section>
    </div>
  );
}
