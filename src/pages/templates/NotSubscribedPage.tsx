import type { PortalService } from '../../config/serviceCatalog';

export function NotSubscribedPage({ service }: { service: PortalService }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">{service.displayName}</h1>
        <p className="mt-2 text-sm text-gray-600">You are not subscribed to this service.</p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold">Request setup</h2>
        <p className="mt-2 text-sm text-gray-700">
          To request access, contact <span className="font-medium">info@intelligentanalyticsdm.com</span>.
        </p>
        <p className="mt-2 text-sm text-gray-600">Include your business name, desired service, and preferred start date.</p>
      </section>
    </div>
  );
}
