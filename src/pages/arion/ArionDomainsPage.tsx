import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { ArionEmptyState, ArionServiceLayout, SummaryCard } from './ArionServiceLayout';
import { useArionSiteData } from './useArionSiteData';

interface Props {
  service: PortalService;
  status: ServiceStatus;
}

function connectedProfilesCount(dashboard: ReturnType<typeof useArionSiteData>['dashboard']): number {
  if (!dashboard?.presence) return 0;
  const urls = [
    dashboard.presence.googleBusinessProfileUrl,
    dashboard.presence.appleBusinessConnectUrl,
    dashboard.presence.bingPlacesUrl,
    dashboard.presence.googleMapsUrl,
    dashboard.presence.appleMapsUrl,
    dashboard.presence.bingMapsUrl
  ];
  return urls.filter(Boolean).length;
}

export function ArionDomainsPage({ service, status }: Props) {
  const { sites, selectedSiteId, selectedSite, setSelectedSiteId, dashboard, loading, error, refresh } = useArionSiteData();

  const configuredDomains = sites.filter((site) => Boolean(site.primaryDomain)).length;
  const sslActive = sites.filter((site) => ['ACTIVE', 'ISSUED', 'ENABLED'].includes(String(site.sslStatus || '').toUpperCase())).length;
  const profileCount = connectedProfilesCount(dashboard);
  const searchReady = Number(Boolean(dashboard?.seo?.ga4Connected)) + Number(Boolean(dashboard?.seo?.searchConsoleConnected)) + Number(Boolean(dashboard?.seo?.bingWebmasterConnected));

  return (
    <ArionServiceLayout service={service} status={status} loading={loading} error={error} onRefresh={refresh}>
      {!sites.length ? (
        <ArionEmptyState
          title="No domain and SSL records yet"
          body="Once ARION onboarding creates the first website and binds it to a primary domain, domain, SSL, and local presence details will appear here."
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Configured domains" value={configuredDomains} helper="Sites with a primary domain attached" />
            <SummaryCard label="SSL active" value={sslActive} helper="Sites reporting an active certificate" />
            <SummaryCard label="Presence links" value={profileCount} helper="Profiles and map links on selected site" />
            <SummaryCard label="Search connections" value={searchReady} helper="GA4 / GSC / Bing on selected site" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[320px,1fr]">
            <div className="iadm-card">
              <div className="iadm-card-body space-y-2">
                <div className="text-sm font-semibold text-slate-900">Sites</div>
                {sites.map((site) => {
                  const isActive = site.siteId === selectedSiteId;
                  return (
                    <button
                      key={site.siteId}
                      type="button"
                      onClick={() => setSelectedSiteId(site.siteId)}
                      className={`w-full rounded-lg border px-3 py-3 text-left ${
                        isActive ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">{site.primaryDomain || site.wpUrl}</div>
                      <div className="mt-1 text-xs text-slate-500">SSL: {site.sslStatus || '—'}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <section className="iadm-card">
                <div className="iadm-card-body grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Domain & SSL</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{selectedSite?.primaryDomain || 'No primary domain set'}</div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate-500">WordPress URL</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.wpUrl || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">SSL status</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.sslStatus || dashboard?.health?.sslStatus || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">GA4</dt>
                        <dd className="font-medium text-slate-900">{dashboard?.seo?.ga4Connected ? 'Connected' : 'Not connected'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Search Console</dt>
                        <dd className="font-medium text-slate-900">{dashboard?.seo?.searchConsoleConnected ? 'Connected' : 'Not connected'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Bing Webmaster</dt>
                        <dd className="font-medium text-slate-900">{dashboard?.seo?.bingWebmasterConnected ? 'Connected' : 'Not connected'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Sitemap detected</dt>
                        <dd className="font-medium text-slate-900">{dashboard?.seo?.sitemapDetected ? 'Yes' : 'No'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Local presence</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <div>{dashboard?.presence?.businessName || 'Business name not set'}</div>
                      <div>{dashboard?.presence?.phone || 'No phone captured'}</div>
                      <div>
                        {[dashboard?.presence?.addressLine1, dashboard?.presence?.addressLine2, dashboard?.presence?.city, dashboard?.presence?.state, dashboard?.presence?.postalCode]
                          .filter(Boolean)
                          .join(', ') || 'No address captured'}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="iadm-card">
                  <div className="iadm-card-body">
                    <div className="mb-3 text-sm font-semibold text-slate-900">Profile links</div>
                    <div className="space-y-2 text-sm text-slate-700">
                      {[
                        ['Google Business Profile', dashboard?.presence?.googleBusinessProfileUrl],
                        ['Apple Business Connect', dashboard?.presence?.appleBusinessConnectUrl],
                        ['Bing Places', dashboard?.presence?.bingPlacesUrl],
                        ['Google Maps', dashboard?.presence?.googleMapsUrl],
                        ['Apple Maps', dashboard?.presence?.appleMapsUrl],
                        ['Bing Maps', dashboard?.presence?.bingMapsUrl]
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <span>{label}</span>
                          {value ? (
                            <a href={value} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                              Open
                            </a>
                          ) : (
                            <span className="text-slate-500">Not set</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="iadm-card">
                  <div className="iadm-card-body">
                    <div className="mb-3 text-sm font-semibold text-slate-900">Recent ARION events</div>
                    <div className="space-y-2 text-sm text-slate-700">
                      {(dashboard?.events || []).slice(0, 6).map((event) => (
                        <div key={event.siteEventId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{event.eventType}</span>
                            <span className="text-xs text-slate-500">{event.eventStatus}</span>
                          </div>
                          <div className="mt-1 text-slate-600">{event.message || 'No message supplied.'}</div>
                        </div>
                      ))}
                      {(!dashboard?.events || dashboard.events.length === 0) && (
                        <div className="text-sm text-slate-500">No recent ARION events have been recorded yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </>
      )}
    </ArionServiceLayout>
  );
}
