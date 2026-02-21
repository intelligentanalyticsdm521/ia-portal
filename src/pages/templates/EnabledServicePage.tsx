import type { PortalService } from '../../config/serviceCatalog';

export function EnabledServicePage({ service }: { service: PortalService }) {
  const sparkCrmUrl = (import.meta.env.VITE_SPARK_CRM_URL as string | undefined)?.trim();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">{service.displayName}</h1>
        <p className="mt-2 text-sm text-gray-600">{service.description}</p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold">v1 Access</h2>
        <p className="mt-2 text-sm text-gray-700">
          This is an enabled section for your tenant. Full embedded experiences are delivered by the dedicated software
          build for this service and will be linked here when available.
        </p>

        {service.section === 'LUMEN' && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            {sparkCrmUrl ? (
              <a
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
                href={sparkCrmUrl}
              >
                Open SPARK CRM
              </a>
            ) : (
              <div className="text-sm text-gray-600">
                SPARK app URL is not configured. Set <span className="font-mono">VITE_SPARK_CRM_URL</span> to enable the
                launch button.
              </div>
            )}

            <a
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
              href="mailto:info@intelligentanalyticsdm.com"
            >
              Manage subscription
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
