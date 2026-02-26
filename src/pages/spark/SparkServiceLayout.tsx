import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';

interface SparkServiceLayoutProps extends PropsWithChildren {
  service: PortalService;
  status: ServiceStatus;
}

/**
 * Shared layout for SPARK read-only pages.
 *
 * - Always renders the underlying page content
 * - If status !== 'enabled', dims the content and shows an overlay:
 *   - coming_soon: generic "coming soon" message
 *   - not_subscribed: grey overlay + CTA to SPARK pricing
 *
 * This does NOT change authentication or backend behaviour; it is purely a
 * visual/read-only layer.
 */
export function SparkServiceLayout({ service, status, children }: SparkServiceLayoutProps) {
  const isLocked = status !== 'enabled';

  let overlayTitle: string | null = null;
  let overlayBody: string | null = null;

  if (status === 'coming_soon') {
    overlayTitle = 'Coming soon';
    overlayBody =
      'This SPARK surface is planned but not available yet. As soon as the module ships, this page will light up with live data.';
  } else if (status === 'not_subscribed') {
    overlayTitle = 'SPARK is not enabled for this tenant yet';
    overlayBody =
      'You are viewing example data only. Add SPARK — Growth Platform to your subscription to unlock live CRM, campaigns, and reporting for your account.';
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{service.displayName}</h1>
          <p className="mt-1 text-sm text-slate-600">{service.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/app/spark/pricing"
            className="rounded-md border border-sky-500 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50"
          >
            View SPARK pricing
          </Link>
          <a
            href="https://spark.intelligentanalyticsdm.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            Open SPARK platform
          </a>
        </div>
      </div>

      <div className="relative">
        <div className={isLocked ? 'pointer-events-none select-none opacity-40' : ''}>{children}</div>

        {isLocked && overlayTitle && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto max-w-md rounded-xl bg-white/95 p-6 text-center shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">{overlayTitle}</h2>
              <p className="mt-2 text-sm text-slate-600">{overlayBody}</p>
              {status === 'not_subscribed' && (
                <div className="mt-4 flex justify-center gap-3">
                  <Link
                    to="/app/spark/pricing"
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    Add SPARK to my account
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}