import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, EmptyPanel, ConsultingUpsell } from '../../components/Ui';

// ---------------- helpers ----------------

function verdictColor(v?: string): string {
  if (!v) return '#5A7A8A';
  const up = v.toUpperCase();
  if (up === 'PASS') return '#1D9E75';
  if (up === 'PARTIAL') return '#D4A800';
  if (up === 'FAIL') return '#D85A30';
  return '#5A7A8A';
}

function humanize(s?: string): string {
  if (!s) return '--';
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso?: string | null) {
  if (!iso) return '--';
  try { return new Date(iso).toLocaleDateString(); } catch { return '--'; }
}

// ---------------- inspection result card ----------------

function InspectionResultView({ result, openLink }: { result: any; openLink?: string }) {
  if (!result) return null;
  const index = result.indexStatusResult || {};
  const mobile = result.mobileUsabilityResult || {};
  const rich = result.richResultsResult || {};

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {[
          { label: 'Index status', verdict: index.verdict, detail: humanize(index.coverageState) || humanize(index.robotsTxtState) },
          { label: 'Mobile usability', verdict: mobile.verdict, detail: (mobile.issues?.length || 0) + ' issue(s)' },
          { label: 'Rich results', verdict: rich.verdict, detail: (rich.detectedItems?.length || 0) + ' item(s)' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + verdictColor(c.verdict) }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.label}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{humanize(c.verdict)}</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>{c.detail}</div>
          </div>
        ))}
      </div>
      <table className="tbl" style={{ marginTop: 4 }}>
        <tbody>
          <tr><td style={{ width: '40%', color: '#5A7A8A' }}>Coverage state</td><td>{humanize(index.coverageState)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Indexing state</td><td>{humanize(index.indexingState)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Last crawl time</td><td>{index.lastCrawlTime ? new Date(index.lastCrawlTime).toLocaleString() : '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Crawled as</td><td>{humanize(index.crawledAs)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Google canonical</td><td style={{ wordBreak: 'break-all' }}>{index.googleCanonical || '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Sitemaps referring</td><td>{(index.sitemap && index.sitemap.length > 0) ? index.sitemap.join(', ') : '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Referring URLs</td><td>{index.referringUrls?.length || 0}</td></tr>
        </tbody>
      </table>
      {openLink && (
        <div style={{ marginTop: 12 }}>
          <a href={openLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--arion-sky)' }}>Open in Google Search Console ↗</a>
        </div>
      )}
    </div>
  );
}

function SubmitResultRow({ engine, result }: { engine: string; result: any }) {
  if (!result) return null;
  const ok = result.submitted === true;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: ok ? '#1D9E75' : '#D85A30', marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24' }}>{engine}</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>
          {ok ? (result.status ? `Submitted (HTTP ${result.status})` : 'Submitted successfully') : (result.error || 'Submission failed')}
        </div>
        {ok && result.engines?.length > 0 && (
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>Forwarded to: {result.engines.join(', ')}</div>
        )}
      </div>
    </div>
  );
}

// ---------------- main page ----------------

export function SearchIndexing() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [inspectUrl, setInspectUrl] = React.useState('');
  const [inspectResult, setInspectResult] = React.useState<any>(null);
  const [inspecting, setInspecting] = React.useState(false);
  const [reindexResult, setReindexResult] = React.useState<any>(null);
  const [reindexing, setReindexing] = React.useState(false);
  const [resubmitting, setResubmitting] = React.useState(false);
  const [resubmitResult, setResubmitResult] = React.useState<any>(null);

  // Fast Indexing state
  const [indexNowLoading, setIndexNowLoading] = React.useState(true);
  const [indexNow, setIndexNow] = React.useState<any>(null);
  const [indexNowAction, setIndexNowAction] = React.useState<string | null>(null);
  const [indexNowMsg, setIndexNowMsg] = React.useState<string | null>(null);
  const [showIndexNowDetails, setShowIndexNowDetails] = React.useState(false);

  // GSC connection status + Google sitemaps (existing data)
  const { data: gscData } = useArionData(
    () => activeSiteId ? arionApi.getConsole('google', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId],
  );
  const { data: googleSitemapsData } = useArionData(
    () => activeSiteId ? arionApi.getSearchSitemaps('google', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId],
  );
  const { data: bingSitemapsData } = useArionData(
    () => activeSiteId ? arionApi.getSearchSitemaps('bing', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId],
  );
  const { data: bingStatsData } = useArionData(
    () => activeSiteId ? arionApi.getBingIndexingStats(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId],
  );

  const refreshIndexNow = React.useCallback(async () => {
    if (!activeSiteId) return;
    try {
      const status = await arionApi.getIndexNowStatus(activeSiteId);
      setIndexNow(status);
    } catch {
      setIndexNow(null);
    } finally {
      setIndexNowLoading(false);
    }
  }, [activeSiteId, arionApi]);

  React.useEffect(() => { refreshIndexNow(); }, [refreshIndexNow]);

  const handleEnableFastIndexing = async () => {
    if (!activeSiteId) return;
    setIndexNowAction('enable');
    setIndexNowMsg(null);
    try {
      const result = await arionApi.generateIndexNowKey(activeSiteId);
      setIndexNow(result);
      if (result.autoEnabled) {
        setIndexNowMsg('Fast Indexing enabled. URL re-indexing requests will also submit to Bing, Yandex, Seznam, and Naver.');
      } else if (result.installError) {
        setIndexNowMsg(`Install failed: ${result.installError}. Try the manual setup in Advanced.`);
      } else if (!result.verified) {
        setIndexNowMsg(`Install succeeded but verification failed: ${result.verifyError || 'unknown error'}. Try the Re-verify button.`);
      }
    } catch (e: any) {
      setIndexNowMsg(e.message || 'Failed to enable Fast Indexing');
    } finally {
      setIndexNowAction(null);
    }
  };

  const handleVerifyFastIndexing = async () => {
    if (!activeSiteId) return;
    setIndexNowAction('verify');
    setIndexNowMsg(null);
    try {
      const r = await arionApi.verifyIndexNowKey(activeSiteId);
      if (r.verified) {
        setIndexNowMsg('Verified. Fast Indexing is now active.');
        await refreshIndexNow();
      } else {
        setIndexNowMsg(r.error || 'Verification failed');
      }
    } catch (e: any) {
      setIndexNowMsg(e.message || 'Verification failed');
    } finally {
      setIndexNowAction(null);
    }
  };

  const handleDisableFastIndexing = async () => {
    if (!activeSiteId) return;
    if (!confirm('Disable Fast Indexing? We\'ll remove the key from both ARION and your site.')) return;
    setIndexNowAction('disable');
    try {
      await arionApi.deleteIndexNowKey(activeSiteId);
      setIndexNow({ key: null, verified: false });
      setIndexNowMsg(null);
      setShowIndexNowDetails(false);
    } catch (e: any) {
      setIndexNowMsg(e.message || 'Failed to disable');
    } finally {
      setIndexNowAction(null);
    }
  };

  const handleInspect = async () => {
    if (!inspectUrl.trim() || !activeSiteId) return;
    setInspecting(true);
    setInspectResult(null);
    setReindexResult(null);
    try {
      const result = await arionApi.inspectUrl(activeSiteId, inspectUrl.trim());
      setInspectResult(result);
    } catch (err: any) {
      setInspectResult({ error: err.message || 'Inspection failed' });
    } finally {
      setInspecting(false);
    }
  };

  const handleReindex = async () => {
    if (!inspectUrl.trim() || !activeSiteId) return;
    setReindexing(true);
    setReindexResult(null);
    try {
      const result = await arionApi.submitUrlForIndexing(activeSiteId, inspectUrl.trim());
      setReindexResult(result);
    } catch (err: any) {
      setReindexResult({ error: err.message || 'Submission failed' });
    } finally {
      setReindexing(false);
    }
  };

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = gscData as Record<string, any> | null;
  const connected = d?.connected === true;
  const gsd = googleSitemapsData as any;
  const bsd = bingSitemapsData as any;
  const googleSitemaps = (gsd?.data?.sitemaps as any[]) ?? (gsd?.sitemaps as any[]) ?? [];
  const bingSitemaps = (bsd?.sitemaps as any[]) ?? [];
  const bingStats = bingStatsData as any;
  const bingConnected = !!bingStats?.connected;
  const domain = selectedSite.primaryDomain || '';

  const inspectionPayload = inspectResult?.inspection?.inspectionResult || null;
  const inspectionLink = inspectResult?.inspection?.inspectionResult?.inspectionResultLink || null;

  const hasKey = !!indexNow?.key;
  const fastActive = hasKey && !!indexNow?.verified;

  return (
    <>
      {/* Intro */}
      <div style={{ background: '#F8FAFC', border: '1px solid rgba(45,156,219,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: '#5A7A8A', lineHeight: 1.6 }}>
        <strong style={{ color: '#0B1C24' }}>Indexing</strong> is about making sure search engines can find, crawl, and index your pages. Sitemaps tell engines what's on your site. URL Inspection shows what Google sees. Fast Indexing notifies Bing, Yandex, Seznam, and Naver the moment a page changes.
      </div>

      {/* Sitemaps — Google and Bing side by side */}
      <Card title="Sitemaps">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Google */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: '#2D9CDB', marginBottom: 8 }}>Google Search Console</div>
            {googleSitemaps.length > 0 ? (
              <table className="tbl" style={{ fontSize: 11 }}>
                <thead>
                  <tr><th>URL</th><th>Last Submitted</th><th>Errors</th></tr>
                </thead>
                <tbody>
                  {googleSitemaps.map((s: any, i: number) => (
                    <tr key={i}>
                      <td style={{ wordBreak: 'break-all' }}><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>{s.url}</a></td>
                      <td>{formatDate(s.lastSubmitted)}</td>
                      <td>{s.errors ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '12px 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {connected ? 'No sitemaps registered in Google Search Console for this property yet.' : 'Connect Google Search Console to see registered sitemaps.'}
              </div>
            )}
          </div>
          {/* Bing */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: '#EF6C33', marginBottom: 8 }}>Bing Webmaster Tools</div>
            {bingSitemaps.length > 0 ? (
              <table className="tbl" style={{ fontSize: 11 }}>
                <thead>
                  <tr><th>URL</th><th>Last Crawled</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {bingSitemaps.map((s: any, i: number) => (
                    <tr key={i}>
                      <td style={{ wordBreak: 'break-all' }}><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>{s.url}</a></td>
                      <td>{formatDate(s.lastSubmitted)}</td>
                      <td>{s.status ?? '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '12px 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {bingConnected ? 'No sitemaps registered in Bing Webmaster Tools for this site yet.' : 'Bing Webmaster Tools not connected.'}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            className="abtn abtn-sky"
            disabled={resubmitting || !activeSiteId}
            onClick={async () => {
              setResubmitting(true);
              setResubmitResult(null);
              try {
                const result = await arionApi.generateSitemap(activeSiteId!);
                setResubmitResult(result);
              } catch (err: any) {
                setResubmitResult({ error: err?.message || 'Failed to resubmit sitemaps' });
              } finally {
                setResubmitting(false);
              }
            }}
          >
            {resubmitting ? 'Submitting...' : 'Resubmit Sitemaps to Google + Bing'}
          </button>
        </div>

        {resubmitResult && !resubmitResult.error && resubmitResult.results?.length > 0 && (
          <table className="tbl" style={{ marginTop: 12, fontSize: 11 }}>
            <thead>
              <tr><th>Sitemap</th><th>Google</th><th>Bing</th></tr>
            </thead>
            <tbody>
              {resubmitResult.results.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ wordBreak: 'break-all' }}>{r.sitemapUrl}</td>
                  <td style={{ color: r.google?.submitted ? '#1D9E75' : '#D85A30' }}>{r.google?.submitted ? 'Submitted' : (r.google?.error || 'Failed')}</td>
                  <td style={{ color: r.bing?.submitted ? '#1D9E75' : '#D85A30' }}>{r.bing?.submitted ? 'Submitted' : (r.bing?.error || 'Failed')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {resubmitResult?.error && (
          <div style={{ marginTop: 10, background: '#FEF2F2', borderLeft: '3px solid #D85A30', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A' }}>{resubmitResult.error}</div>
        )}
      </Card>

      {/* Fast Indexing — single-button enablement */}
      <Card title="Fast Indexing">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: fastActive ? '#1D9E75' : hasKey ? '#D4A800' : '#D85A30' }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>
                {fastActive ? 'Active' : hasKey ? 'Setup in progress' : 'Not enabled'}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.6 }}>
              {fastActive
                ? 'Whenever you click Request re-indexing on a URL, it will also notify Bing, Yandex, Seznam, and Naver instantly via the IndexNow protocol.'
                : 'Tell Bing, Yandex, Seznam, and Naver about new or changed pages instantly instead of waiting for their next crawl. No setup required on your end — we handle the site configuration automatically.'}
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!hasKey && !indexNowLoading && (
              <button className="abtn abtn-sky" onClick={handleEnableFastIndexing} disabled={indexNowAction === 'enable'}>
                {indexNowAction === 'enable' ? 'Enabling...' : 'Enable Fast Indexing'}
              </button>
            )}
            {hasKey && !fastActive && (
              <>
                <button className="abtn abtn-sky" onClick={handleVerifyFastIndexing} disabled={indexNowAction === 'verify'}>
                  {indexNowAction === 'verify' ? 'Re-checking...' : 'Re-verify'}
                </button>
                <button className="abtn" onClick={handleDisableFastIndexing} disabled={indexNowAction === 'disable'} style={{ color: '#D85A30' }}>
                  Disable
                </button>
              </>
            )}
            {fastActive && (
              <button className="abtn" onClick={handleDisableFastIndexing} disabled={indexNowAction === 'disable'} style={{ color: '#D85A30' }}>
                {indexNowAction === 'disable' ? 'Disabling...' : 'Disable'}
              </button>
            )}
          </div>
        </div>

        {indexNowMsg && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 4,
            fontSize: 12,
            lineHeight: 1.6,
            background: fastActive ? 'rgba(29,158,117,0.08)' : '#FFF8E1',
            borderLeft: `3px solid ${fastActive ? '#1D9E75' : '#D4A800'}`,
            color: '#5A7A8A',
          }}>
            {indexNowMsg}
          </div>
        )}

        {hasKey && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowIndexNowDetails(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A7A8A', fontSize: 11, padding: 0 }}
            >
              {showIndexNowDetails ? '▾ Hide details' : '▸ Show details (advanced)'}
            </button>
            {showIndexNowDetails && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: '#F8FAFC', borderRadius: 4, fontSize: 11, color: '#5A7A8A', lineHeight: 1.6 }}>
                <div><strong>Key:</strong> <code>{indexNow.key}</code></div>
                <div><strong>Hosted at:</strong> <a href={indexNow.keyLocation} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>{indexNow.keyLocation}</a></div>
                <div><strong>Generated:</strong> {formatDate(indexNow.generatedAt)}</div>
                <div><strong>Verified:</strong> {indexNow.verifiedAt ? new Date(indexNow.verifiedAt).toLocaleString() : 'Not yet'}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* URL Inspection + Request re-indexing */}
      {!connected && (
        <Card title="URL Inspection">
          <div style={{ padding: 12, fontSize: 12, color: '#5A7A8A' }}>Connect Google Search Console to inspect URLs.</div>
        </Card>
      )}

      {connected && (
        <Card title="URL Inspection">
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
            Check how Google sees a specific page — crawl status, indexing status, and detected issues. After inspecting, you can request re-indexing across all supported engines.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder={domain ? `https://${domain}/page` : 'https://yoursite.com/page'} value={inspectUrl}
              onChange={e => setInspectUrl(e.target.value)}
              className="field-input" style={{ flex: 1 }} />
            <button className="abtn abtn-sky" onClick={handleInspect} disabled={inspecting}>
              {inspecting ? 'Inspecting...' : 'Inspect URL'}
            </button>
          </div>
          {inspectResult && (
            <div style={{ marginTop: 12 }}>
              {inspectResult.error ? (
                <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A' }}>{inspectResult.error}</div>
              ) : inspectionPayload ? (
                <>
                  <InspectionResultView result={inspectionPayload} openLink={inspectionLink} />
                  <div style={{ marginTop: 20, padding: '14px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px solid rgba(45,156,219,0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>Request re-indexing for this URL</div>
                        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2, lineHeight: 1.5 }}>
                          Tells search engines to re-crawl. For Google, this resubmits your sitemaps (Google's supported path). For Bing and IndexNow, the URL is submitted directly.
                        </div>
                      </div>
                      <button className="abtn abtn-sky" onClick={handleReindex} disabled={reindexing} style={{ flexShrink: 0 }}>
                        {reindexing ? 'Submitting...' : 'Request re-indexing'}
                      </button>
                    </div>
                    {reindexResult && (
                      <div style={{ marginTop: 12 }}>
                        {reindexResult.error && typeof reindexResult.error === 'string' ? (
                          <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A' }}>{reindexResult.error}</div>
                        ) : (
                          <div style={{ background: '#fff', borderRadius: 6, padding: '4px 14px', border: '1px solid #eee' }}>
                            <SubmitResultRow engine="Google (sitemap resubmit)" result={reindexResult.google} />
                            <SubmitResultRow engine="Bing Webmaster Tools" result={reindexResult.bing} />
                            <SubmitResultRow engine="IndexNow (Bing, Yandex, Seznam, Naver)" result={reindexResult.indexNow} />
                            {reindexResult.google?.message && (
                              <div style={{ fontSize: 11, color: '#5A7A8A', padding: '6px 0 10px 20px', lineHeight: 1.5 }}>
                                {reindexResult.google.message}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A' }}>
                  GSC returned no inspection data for this URL. Confirm the URL belongs to the verified GSC property for this site.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Bing crawl activity — engine-side observability */}
      {bingConnected && bingStats?.crawl && (
        <Card title="Bing Crawl Activity (last 30 days)">
          <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10, lineHeight: 1.5 }}>
            How Bing is crawling your site. Google doesn't expose equivalent data publicly — this is Bing-only.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { label: 'Pages crawled', value: bingStats.crawl.totalCrawled, color: '#2D9CDB' },
              { label: 'HTTP 200 (ok)', value: bingStats.crawl.http2xx, color: '#1D9E75' },
              { label: 'Redirects (301)', value: bingStats.crawl.http301, color: '#5A7A8A' },
              { label: 'Not found (404)', value: bingStats.crawl.http404, color: '#D4A800' },
              { label: 'Server errors (5xx)', value: bingStats.crawl.http5xx, color: '#D85A30' },
              { label: 'robots.txt blocked', value: bingStats.crawl.robotsDenied, color: '#5A7A8A' },
            ].map(c => (
              <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.color }}>
                <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value ?? '--'}</div>
              </div>
            ))}
          </div>
          {bingStats.quota && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, fontSize: 12, color: '#0C4A60' }}>
              Bing URL submission quota — <strong>{bingStats.quota.dailyRemaining ?? '--'}</strong> remaining today · <strong>{bingStats.quota.monthlyRemaining ?? '--'}</strong> remaining this month.
            </div>
          )}
        </Card>
      )}

      <ConsultingUpsell
        headline="Indexing issues suppress rankings."
        subtext="IA's technical team fixes indexing coverage and crawl errors."
        serviceType="SEO Strategy"
        triggerPage="search-indexing"
      />
    </>
  );
}
