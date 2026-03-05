import { useMemo, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { ArionEmptyState, ArionServiceLayout, SummaryCard } from './ArionServiceLayout';
import { useArionSiteData } from './useArionSiteData';

interface Props {
  service: PortalService;
  status: ServiceStatus;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

export function ArionWebsitesPage({ service, status }: Props) {
  const { sites, selectedSiteId, selectedSite, setSelectedSiteId, dashboard, loading, error, refresh, submitRequest, submittingRequest } = useArionSiteData();
  const [requestType, setRequestType] = useState('SUPPORT');
  const [notes, setNotes] = useState('');
  const [requestSent, setRequestSent] = useState<string | null>(null);

  const liveSites = useMemo(() => sites.filter((site) => String(site.status).toUpperCase() === 'LIVE').length, [sites]);
  const ecommerceSites = useMemo(() => sites.filter((site) => site.isEcommerceEnabled).length, [sites]);
  const openRequests = useMemo(() => sites.reduce((sum, site) => sum + (site.openRequestCount || 0), 0), [sites]);

  async function handleSubmitRequest() {
    if (!selectedSiteId || !notes.trim()) return;
    await submitRequest({ siteId: selectedSiteId, requestType, notes: notes.trim() });
    setNotes('');
    setRequestSent('Request submitted successfully.');
  }

  return (
    <ArionServiceLayout service={service} status={status} loading={loading} error={error} onRefresh={refresh}>
      {!sites.length ? (
        <ArionEmptyState
          title="No ARION websites yet"
          body="Your ARION workspace is live, but this tenant does not have any website records yet. Once onboarding creates the first site, it will appear here automatically."
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Websites" value={sites.length} helper="Sites attached to this tenant" />
            <SummaryCard label="Live" value={liveSites} helper="Currently marked live" />
            <SummaryCard label="Ecommerce" value={ecommerceSites} helper="Store capability enabled" />
            <SummaryCard label="Open requests" value={openRequests} helper="Support and change requests" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[320px,1fr]">
            <div className="iadm-card">
              <div className="iadm-card-body space-y-3">
                <div className="text-sm font-semibold text-slate-900">Sites</div>
                <div className="space-y-2">
                  {sites.map((site) => {
                    const isActive = site.siteId === selectedSiteId;
                    return (
                      <button
                        key={site.siteId}
                        type="button"
                        onClick={() => setSelectedSiteId(site.siteId)}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                          isActive ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {site.primaryDomain || site.wpUrl}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500">{site.wpUrl}</div>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-700">
                            {site.packageCode || '—'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <span>Status: {site.status}</span>
                          <span>{site.openRequestCount} open requests</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <section className="iadm-card">
                <div className="iadm-card-body grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected site</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {selectedSite?.primaryDomain || selectedSite?.wpUrl || '—'}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{selectedSite?.wpUrl || '—'}</div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate-500">Package</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.packageCode || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Price</dt>
                        <dd className="font-medium text-slate-900">{formatCurrency(selectedSite?.packagePriceUsd)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Primary domain</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.primaryDomain || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">SSL</dt>
                        <dd className="font-medium text-slate-900">{selectedSite?.sslStatus || '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Sessions</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.analytics.latest?.sessions ?? '—'}</div>
                      <div className="mt-1 text-xs text-slate-500">Latest snapshot</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Leads</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.analytics.latest?.leads ?? '—'}</div>
                      <div className="mt-1 text-xs text-slate-500">Captured lead events</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Orders</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.analytics.latest?.orders ?? '—'}</div>
                      <div className="mt-1 text-xs text-slate-500">Commerce snapshots</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Revenue</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(dashboard?.analytics.latest?.revenueUsd)}</div>
                      <div className="mt-1 text-xs text-slate-500">Latest cached amount</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="iadm-card">
                  <div className="iadm-card-body">
                    <div className="mb-3 text-sm font-semibold text-slate-900">Connected integrations</div>
                    <div className="flex flex-wrap gap-2">
                      {(dashboard?.integrations || []).map((integration) => (
                        <span
                          key={integration.siteIntegrationId}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          {integration.providerCode.replaceAll('_', ' ')} · {integration.status}
                        </span>
                      ))}
                      {(!dashboard?.integrations || dashboard.integrations.length === 0) && (
                        <div className="text-sm text-slate-500">No integrations connected yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="iadm-card">
                  <div className="iadm-card-body">
                    <div className="mb-3 text-sm font-semibold text-slate-900">Recent requests</div>
                    <div className="space-y-2 text-sm text-slate-700">
                      {(dashboard?.requests || []).slice(0, 4).map((request) => (
                        <div key={request.siteRequestId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{request.requestType}</span>
                            <span className="text-xs text-slate-500">{request.requestStatus}</span>
                          </div>
                          <div className="mt-2 text-slate-600">{request.notes || '—'}</div>
                        </div>
                      ))}
                      {(!dashboard?.requests || dashboard.requests.length === 0) && (
                        <div className="text-sm text-slate-500">No support or change requests have been submitted yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="iadm-card">
                <div className="iadm-card-body space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Submit ARION request</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Use this to create a support or change request tied directly to the selected website.
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[180px,1fr]">
                    <select
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="SUPPORT">Support</option>
                      <option value="CONTENT">Content change</option>
                      <option value="DOMAIN">Domain / SSL</option>
                      <option value="PLUGIN">Plugin / theme</option>
                    </select>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Describe what you need us to help with."
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-emerald-600">{requestSent}</div>
                    <button
                      type="button"
                      disabled={!selectedSiteId || !notes.trim() || submittingRequest}
                      onClick={handleSubmitRequest}
                      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submittingRequest ? 'Submitting…' : 'Submit request'}
                    </button>
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
