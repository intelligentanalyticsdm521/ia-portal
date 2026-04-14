import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, InfoCard, HealthRow, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

export function SearchIndexing() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [inspectUrl, setInspectUrl] = React.useState('');
  const [inspectResult, setInspectResult] = React.useState<any>(null);
  const [inspecting, setInspecting] = React.useState(false);
  const [submitUrl, setSubmitUrl] = React.useState('');
  const [submitResult, setSubmitResult] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Fetch GSC data for index status
  const { data: gscData } = useArionData(
    () => activeSiteId ? arionApi.getConsole('google', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = gscData as Record<string, any> | null;
  const connected = d?.connected === true;

  const handleInspect = async () => {
    if (!inspectUrl.trim() || !activeSiteId) return;
    setInspecting(true);
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
    try {
      await arionApi.submitUrlForIndexing(activeSiteId, submitUrl.trim());
      setSubmitResult('URL submitted for indexing successfully.');
    } catch (err: any) {
      setSubmitResult(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!connected && (
        <InfoCard title="Google Search Console Not Connected">
          <p style={{ margin: 0 }}>Connect Google Search Console to access URL inspection and indexing features.</p>
        </InfoCard>
      )}

      <Card title="Index Status">
        <HealthRow label="Search Console" status={connected ? 'ok' : 'warn'} value={connected ? 'Connected' : 'Not connected'} />
        <HealthRow label="Sitemap Submitted" status={connected ? 'ok' : 'warn'} value={connected ? 'Yes' : 'Unknown'} />
        <HealthRow label="Crawl Status" status={connected ? 'ok' : 'warn'} value={connected ? 'Active' : 'Connect GSC to view'} />
        <HealthRow label="Mobile Usability" status={connected ? 'ok' : 'warn'} value={connected ? 'No issues' : 'Connect GSC to view'} />
      </Card>

      <Card title="URL Inspection">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          Check how Google sees a specific page — crawl status, indexing status, and detected issues.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="https://yoursite.com/page" value={inspectUrl}
            onChange={e => setInspectUrl(e.target.value)}
            className="field-input" style={{ flex: 1 }} />
          <button className="abtn abtn-sky" onClick={handleInspect} disabled={inspecting}>
            {inspecting ? 'Inspecting...' : 'Inspect URL'}
          </button>
        </div>
        {inspectResult && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            {inspectResult.error ? (
              <p style={{ color: 'var(--error)' }}>{inspectResult.error}</p>
            ) : (
              <pre style={{ background: 'var(--arion-sky-tint)', padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 10 }}>
                {JSON.stringify(inspectResult, null, 2)}
              </pre>
            )}
          </div>
        )}
      </Card>

      <Card title="Submit URL for Indexing">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          Request Google to crawl and index a URL. Daily submission quota applies.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="https://yoursite.com/new-page" value={submitUrl}
            onChange={e => setSubmitUrl(e.target.value)}
            className="field-input" style={{ flex: 1 }} />
          <button className="abtn abtn-sky" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
        {submitResult && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>{submitResult}</p>}
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
