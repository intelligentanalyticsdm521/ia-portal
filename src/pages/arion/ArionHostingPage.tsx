import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { ArionEmptyState, ArionServiceLayout, SummaryCard } from './ArionServiceLayout';
import { useArionSiteData } from './useArionSiteData';

interface Props {
  service: PortalService;
  status: ServiceStatus;
}

function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (!nums.length) return null;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

export function ArionHostingPage({ service, status }: Props) {
  const { sites, selectedSiteId, selectedSite, setSelectedSiteId, dashboard, loading, error, refresh } = useArionSiteData();

  const onlineSites = sites.filter((site) => ['LIVE', 'ONLINE'].includes(String(site.health.siteStatus || site.status).toUpperCase())).length;
  const totalPluginUpdates = sites.reduce((sum, site) => sum + (site.health.pluginUpdatesAvailable || 0), 0);
  const avgPerf = average(sites.map((site) => site.health.performanceScore));
  const failingForms = sites.filter((site) => String(site.health.formDeliveryStatus || '').toUpperCase() === 'FAILING').length;

  return (
    <ArionServiceLayout service={service} status={status} loading={loading} error={error} onRefresh={refresh}>
      {!sites.length ? (
        <ArionEmptyState
          title="No hosting records yet"
          body="ARION hosting data appears here after the first website is provisioned and begins reporting health details into the platform."
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Online sites" value={onlineSites} helper="Live or online health states" />
            <SummaryCard label="Plugin updates" value={totalPluginUpdates} helper="Outstanding updates across the tenant" />
            <SummaryCard label="Avg. performance" value={avgPerf ?? '—'} helper="Current cached performance score" />
            <SummaryCard label="Forms failing" value={failingForms} helper="Sites needing deliverability attention" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[320px,1fr]">
            <div className="iadm-card">
              <div className="iadm-card-body space-y-2">
                <div className="text-sm font-semibold text-slate-900">Site selection</div>
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
                      <div className="mt-1 text-xs text-slate-500">{site.health.siteStatus || site.status}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <section className="iadm-card">
                <div className="iadm-card-body grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Hosting posture</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">{selectedSite?.primaryDomain || selectedSite?.wpUrl || '—'}</div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate-500">Hostinger site id</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.hostingerWebsiteId || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Hostinger plan</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.hostingerPlanId || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Site status</dt>
                        <dd className="font-medium text-slate-900">{dashboard?.health?.siteStatus || selectedSite?.status || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">SSL</dt>
                        <dd className="font-medium text-slate-900">{dashboard?.health?.sslStatus || selectedSite?.sslStatus || '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">WordPress</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.health?.wordpressVersion || '—'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">PHP</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.health?.phpVersion || '—'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Plugin updates</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.health?.pluginUpdatesAvailable ?? '—'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Performance</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.health?.performanceScore ?? '—'}</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="iadm-card">
                  <div className="iadm-card-body">
                    <div className="mb-3 text-sm font-semibold text-slate-900">Health checks</div>
                    <div className="space-y-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span>Last heartbeat</span>
                        <span className="font-medium text-slate-900">{dashboard?.health?.lastHealthCheckAt || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span>Form delivery</span>
                        <span className="font-medium text-slate-900">{dashboard?.health?.formDeliveryStatus || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span>Last form test</span>
                        <span className="font-medium text-slate-900">{dashboard?.health?.lastFormTestAt || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span>Last performance check</span>
                        <span className="font-medium text-slate-900">{dashboard?.health?.lastPerfCheckAt || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="iadm-card">
                  <div className="iadm-card-body">
                    <div className="mb-3 text-sm font-semibold text-slate-900">Plugin inventory</div>
                    <div className="space-y-2">
                      {(dashboard?.plugins || []).slice(0, 8).map((plugin) => (
                        <div key={plugin.sitePluginId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <div>
                            <div className="font-medium text-slate-900">{plugin.pluginName || plugin.pluginKey}</div>
                            <div className="text-xs text-slate-500">{plugin.pluginVersion || 'unknown version'}</div>
                          </div>
                          <span className="text-xs text-slate-600">{plugin.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                      ))}
                      {(!dashboard?.plugins || dashboard.plugins.length === 0) && (
                        <div className="text-sm text-slate-500">No plugin inventory has been reported yet.</div>
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
