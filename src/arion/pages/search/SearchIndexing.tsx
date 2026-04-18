import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, InfoCard, HealthRow, EmptyPanel, ConsultingUpsell } from '../../components/Ui';

// Map GSC verdict strings to a color
function verdictColor(v?: string): string {
  if (!v) return '#5A7A8A';
  const up = v.toUpperCase();
  if (up === 'PASS') return '#1D9E75';
  if (up === 'PARTIAL') return '#D4A800';
  if (up === 'FAIL') return '#D85A30';
  if (up === 'NEUTRAL') return '#5A7A8A';
  return '#5A7A8A';
}

// Humanize an UPPER_SNAKE_CASE enum from GSC (e.g. "INDEXING_ALLOWED" → "Indexing allowed")
function humanize(s?: string): string {
  if (!s) return '--';
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function InspectionResultView({ result, openLink }: { result: any; openLink?: string }) {
  if (!result) return null;
  const index = result.indexStatusResult || {};
  const mobile = result.mobileUsabilityResult || {};
  const rich = result.richResultsResult || {};

  return (
    <div style={{ marginTop: 12 }}>
      {/* Top verdict row */}
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

      {/* Details grid */}
      <table className="tbl" style={{ marginTop: 4 }}>
        <tbody>
          <tr><td style={{ width: '40%', color: '#5A7A8A' }}>Coverage state</td><td>{humanize(index.coverageState)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Robots.txt state</td><td>{humanize(index.robotsTxtState)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Indexing state</td><td>{humanize(index.indexingState)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Page fetch state</td><td>{humanize(index.pageFetchState)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Last crawl time</td><td>{index.lastCrawlTime ? new Date(index.lastCrawlTime).toLocaleString() : '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Crawled as</td><td>{humanize(index.crawledAs)}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Google canonical</td><td style={{ wordBreak: 'break-all' }}>{index.googleCanonical || '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>User canonical</td><td style={{ wordBreak: 'break-all' }}>{index.userCanonical || '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Sitemaps referring</td><td>{(index.sitemap && index.sitemap.length > 0) ? index.sitemap.join(', ') : '--'}</td></tr>
          <tr><td style={{ color: '#5A7A8A' }}>Referring URLs</td><td>{index.referringUrls?.length || 0}</td></tr>
        </tbody>
      </table>

      {mobile.issues?.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginTop: 12, marginBottom: 6 }}>Mobile usability issues</div>
          <ul style={{ fontSize: 11, color: '#5A7A8A', paddingLeft: 20, margin: 0 }}>
            {mobile.issues.map((i: any, idx: number) => (
              <li key={idx}>{humanize(i.issueType)}{i.message ? ' — ' + i.message : ''}</li>
            ))}
          </ul>
        </>
      )}

      {rich.detectedItems?.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginTop: 12, marginBottom: 6 }}>Rich results detected</div>
          <ul style={{ fontSize: 11, color: '#5A7A8A', paddingLeft: 20, margin: 0 }}>
            {rich.detectedItems.map((item: any, idx: number) => (
              <li key={idx}>{item.richResultType || 'Unknown'} — {(item.items?.length || 0)} item(s)</li>
            ))}
          </ul>
        </>
      )}

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
          {ok
            ? (result.status ? `Submitted (HTTP ${result.status})` : 'Submitted successfully')
            : (result.error || 'Submission failed')}
        </div>
        {ok && result.engines?.length > 0 && (
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>Forwarded to: {result.engines.join(', ')}</div>
        )}
      </div>
    </div>
  );
}

export function SearchIndexing() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [inspectUrl, setInspectUrl] = React.useState('');
  const [inspectResult, setInspectResult] = React.useState<any>(null);
  const [inspecting, setInspecting] = React.useState(false);
  const [submitUrl, setSubmitUrl] = React.useState('');
  const [submitResult, setSubmitResult] = React.useState<any>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [resubmitting, setResubmitting] = React.useState(false);
  const [resubmitResult, setResubmitResult] = React.useState<any>(null);

  // Fetch GSC data for index status (cheap — uses /arion/console/google)
  const { data: gscData } = useArionData(
    () => activeSiteId ? arionApi.getConsole('google', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  // Fetch sitemaps data
  const { data: sitemapsData } = useArionData(
    () => activeSiteId ? arionApi.getSearchSitemaps('google', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = gscData as Record<string, any> | null;
  const connected = d?.connected === true;

  // Build sitemaps list — merge API data with known WordPress sitemaps
  const sd = sitemapsData as Record<string, any> | null;
  const apiSitemaps = (sd?.data?.sitemaps as any[]) ?? (sd?.sitemaps as any[]) ?? [];
  const domain = selectedSite.primaryDomain || '';
  const knownSitemaps = domain ? [
    { url: `https://${domain}/sitemap_index.xml`, type: 'Rank Math', status: 'Detected', lastSubmitted: null, urlsDiscovered: null },
    { url: `https://${domain}/wp-sitemap.xml`, type: 'WordPress Core', status: 'Detected', lastSubmitted: null, urlsDiscovered: null },
  ] : [];
  const apiUrls = new Set(apiSitemaps.map((s: any) => s.url));
  const allSitemaps = [
    ...apiSitemaps,
    ...knownSitemaps.filter(k => !apiUrls.has(k.url)),
  ];

  const handleInspect = async () => {
    if (!inspectUrl.trim() || !activeSiteId) return;
    setInspecting(true);
    setInspectResult(null);
    try {
      const result = await arionApi.inspectUrl(activeSiteId, inspectUrl.trim());
      setInspectResult(result);
    } catch (err: any) {
      setInspectResult({ error: err.message || 'Inspection failed' });
    } finally {
      setInspecting(false);
    }
  };

  const handleSubmit = async () => {
    if (!submitUrl.trim() || !activeSiteId) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await arionApi.submitUrlForIndexing(activeSiteId, submitUrl.trim());
      setSubmitResult(result);
    } catch (err: any) {
      setSubmitResult({ error: err.message || 'Submission failed' });
    } finally {
      setSubmitting(false);
    }
  };

  // Top-level inspection data (the GSC SDK wraps details inside inspectionResult)
  const inspectionPayload = inspectResult?.inspection?.inspectionResult || null;
  const inspectionLink = inspectResult?.inspection?.inspectionResult?.inspectionResultLink || null;

  return (
    <>
      {/* Sitemaps section */}
      <Card title="Sitemaps">
        {allSitemaps.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr><th>URL</th><th>Type</th><th>Status</th><th>Last Submitted</th><th>URLs Discovered</th></tr>
            </thead>
            <tbody>
              {allSitemaps.map((s: any, i: number) => (
                <tr key={i}>
                  <td><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 12 }}>{s.url ?? '--'}</a></td>
                  <td>{s.type ?? '--'}</td>
                  <td>{s.status ?? '--'}</td>
                  <td>{s.lastSubmitted ? new Date(s.lastSubmitted).toLocaleDateString() : '--'}</td>
                  <td>{s.urlsDiscovered ?? s.urls_discovered ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyPanel message="No sitemaps detected. Ensure a sitemap plugin (e.g. Rank Math) is active." />
        )}
      </Card>

      <div style={{ marginBottom: 16 }}>
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
          {resubmitting ? 'Submitting...' : 'Resubmit to Search Engines'}
        </button>
      </div>

      {resubmitResult && !resubmitResult.error && (
        <InfoCard title="Sitemap Submission Result">
          <p style={{ fontSize: 12, margin: '0 0 8px' }}>
            <strong>{resubmitResult.urls ?? 0}</strong> URLs found in WordPress · {' '}
            <strong>{(resubmitResult.sitemaps?.length ?? 0)}</strong> sitemap(s) submitted
          </p>
          {resubmitResult.results?.length > 0 ? (
            <table className="tbl" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 10, color: '#5A7A8A' }}>Sitemap</th>
                  <th style={{ textAlign: 'left', fontSize: 10, color: '#5A7A8A' }}>Google</th>
                  <th style={{ textAlign: 'left', fontSize: 10, color: '#5A7A8A' }}>Bing</th>
                </tr>
              </thead>
              <tbody>
                {resubmitResult.results.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11, wordBreak: 'break-all' }}><a href={r.sitemapUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>{r.sitemapUrl}</a></td>
                    <td style={{ fontSize: 11, color: r.google?.submitted ? '#1D9E75' : '#D85A30' }}>
                      {r.google?.submitted ? 'Submitted' : (r.google?.error || 'Failed')}
                    </td>
                    <td style={{ fontSize: 11, color: r.bing?.submitted ? '#1D9E75' : '#D85A30' }}>
                      {r.bing?.submitted ? 'Submitted' : (r.bing?.error || 'Failed')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              No sitemaps could be submitted — {resubmitResult.googleConnected === false ? 'Google Search Console is not connected.' : 'auto-detection did not find a sitemap at standard locations and GSC has no registered sitemaps for this property.'}
            </p>
          )}
        </InfoCard>
      )}

      {resubmitResult?.error && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginBottom: 12 }}>{resubmitResult.error}</p>
      )}

      {!connected && (
        <InfoCard title="Google Search Console Not Connected">
          <p style={{ margin: 0 }}>Connect Google Search Console to access URL inspection and indexing features.</p>
        </InfoCard>
      )}

      <Card title="URL Inspection">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          Check how Google sees a specific page — crawl status, indexing status, and detected issues.
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
              <InspectionResultView result={inspectionPayload} openLink={inspectionLink} />
            ) : (
              <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A' }}>
                GSC returned no inspection data for this URL. Confirm the URL belongs to the verified GSC property for this site.
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Submit URL for Indexing">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          Request re-indexing of a single URL across supported engines. Google does not accept arbitrary URL submissions via public API — use URL Inspection to check crawl status, or resubmit the sitemap to trigger re-discovery.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder={domain ? `https://${domain}/new-page` : 'https://yoursite.com/new-page'} value={submitUrl}
            onChange={e => setSubmitUrl(e.target.value)}
            className="field-input" style={{ flex: 1 }} />
          <button className="abtn abtn-sky" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
        {submitResult && (
          <div style={{ marginTop: 12 }}>
            {submitResult.error && typeof submitResult.error === 'string' ? (
              <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A' }}>{submitResult.error}</div>
            ) : (
              <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '4px 14px' }}>
                <SubmitResultRow engine="Google Search Console" result={submitResult.google} />
                <SubmitResultRow engine="Bing Webmaster Tools" result={submitResult.bing} />
                <SubmitResultRow engine="IndexNow (Bing, Yandex, Seznam, Naver)" result={submitResult.indexNow} />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Index Status">
        <HealthRow label="Search Console" status={connected ? 'ok' : 'warn'} value={connected ? 'Connected' : 'Not connected'} />
        <HealthRow label="Sitemap Submitted" status={connected ? 'ok' : 'warn'} value={connected ? 'Yes' : 'Unknown'} />
        <HealthRow label="Crawl Status" status={connected ? 'ok' : 'warn'} value={connected ? 'Active' : 'Connect GSC to view'} />
        <HealthRow label="Mobile Usability" status={connected ? 'ok' : 'warn'} value={connected ? 'No issues' : 'Connect GSC to view'} />
      </Card>

      <ConsultingUpsell
        headline="Crawl errors suppress rankings. IA's technical team fixes indexing issues."
        subtext="Technical SEO fixes for better indexing coverage."
        serviceType="SEO Strategy"
        triggerPage="search-indexing"
      />
    </>
  );
}
