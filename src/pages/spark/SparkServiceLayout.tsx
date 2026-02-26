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
 * Purely a UI wrapper – it does NOT change authentication or backend behaviour.
 * It renders the normal page content and, when status !== 'enabled', overlays a
 * read-only banner:
 *   • coming_soon    → generic “Coming soon” message
 *   • not_subscribed → SPARK marketing banner + CTA
 */
export function SparkServiceLayout({
  service,
  status,
  children
}: SparkServiceLayoutProps) {
  const isLocked = status !== 'enabled';

  let overlayTitle: string | null = null;
  let overlayBody: string | null = null;

  if (status === 'coming_soon') {
    overlayTitle = 'Coming soon';
    overlayBody =
      'This SPARK surface is planned but not available yet. As soon as the module ships, this page will light up with live data.';
  } else if (status === 'not_subscribed') {
    overlayTitle =
      'Scale Smarter, Not Harder—Power Your Success with SPARK';
    overlayBody =
      'Build deeper relationships with your audience by delivering the right message at exactly the right time. From automated follow-ups to precision targeting, SPARK gives you the power to turn cold prospects into lifelong brand advocates.';
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {service.displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {service.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/app/spark/pricing" className="iadm-btn-secondary text-xs">
            View SPARK pricing
          </Link>
          <a
            href="https://spark.intelligentanalyticsdm.com"
            target="_blank"
            rel="noreferrer"
            className="iadm-btn-primary text-xs"
          >
            Open SPARK platform
          </a>
        </div>
      </div>

      {/* Content + overlay */}
      <div className="relative">
        <div className={isLocked ? 'pointer-events-none select-none opacity-40' : ''}>
          {children}
        </div>

        {isLocked && overlayTitle && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto max-w-md rounded-xl bg-white/95 p-6 text-center shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">
                {overlayTitle}
              </h2>

              {status === 'not_subscribed' ? (
                <>
                  {overlayBody && (
                    <p className="mt-2 text-sm text-slate-600">{overlayBody}</p>
                  )}

                  <ul className="mt-4 grid gap-2 text-left text-sm text-slate-800 md:grid-cols-2">
                    <li>
                      <span className="font-semibold">CRM</span> — keep every
                      contact and interaction organised.
                    </li>
                    <li>
                      <span className="font-semibold">Custom Email Campaigns</span>{' '}
                      — design, schedule and track email outreach.
                    </li>
                    <li>
                      <span className="font-semibold">Custom SMS Campaigns</span>{' '}
                      — reach customers instantly on mobile.
                    </li>
                    <li>
                      <span className="font-semibold">Lead Generation</span> —
                      capture, qualify and route new leads.
                    </li>
                    <li>
                      <span className="font-semibold">Customer Segmentation</span>{' '}
                      — group contacts by behaviour and intent.
                    </li>
                    <li>
                      <span className="font-semibold">IADM Reporting</span> —
                      understand performance across campaigns and channels.
                    </li>
                    <li>
                      <span className="font-semibold">So Much More</span> —
                      built to grow with your business.
                    </li>
                  </ul>
                </>
              ) : (
                overlayBody && (
                  <p className="mt-2 text-sm text-slate-600">{overlayBody}</p>
                )
              )}

              {status === 'not_subscribed' && (
                <div className="mt-6 flex justify-center gap-3">
                  <Link to="/app/spark/pricing" className="iadm-btn-primary">
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