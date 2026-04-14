import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { Card, InfoCard, HealthRow, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

export function SearchIndexing() {
  const { selectedSite, activeSiteId } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [inspectUrl, setInspectUrl] = useState('');
  const [submitUrl, setSubmitUrl] = useState('');
  const [inspectResult, setInspectResult] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const handleInspect = () => {
    if (!inspectUrl.trim()) return;
    setInspectResult('URL inspection endpoint is not yet available. This feature is coming soon.');
  };

  const handleSubmit = () => {
    if (!submitUrl.trim()) return;
    setSubmitResult('URL submission endpoint is not yet available. This feature is coming soon.');
  };

  return (
    <>
      <Card title="URL Inspection">
        <InfoCard title="Info">URL Inspection checks how Google sees a specific page on your site. It shows crawl status, indexing status, and any issues detected.</InfoCard>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <input
            type="text"
            placeholder="Enter a URL to inspect..."
            value={inspectUrl}
            onChange={(e) => setInspectUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="abtn abtn-sky" onClick={handleInspect}>Inspect URL</button>
        </div>
        {inspectResult && <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>{inspectResult}</p>}
      </Card>

      <Card title="Submit URL for Indexing">
        <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Submit a URL to request Google to crawl and index it. Note: submission does not guarantee indexing, and there is a daily quota limit.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Enter a URL to submit..."
            value={submitUrl}
            onChange={(e) => setSubmitUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="abtn abtn-sky" onClick={handleSubmit}>Submit</button>
        </div>
        {submitResult && <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>{submitResult}</p>}
      </Card>

      <Card title="Index Status">
        <HealthRow label="Crawl Status" status="warn" value="Pending" />
        <HealthRow label="Index Coverage" status="warn" value="Pending" />
        <HealthRow label="Mobile Usability" status="warn" value="Pending" />
        <HealthRow label="Rich Results" status="warn" value="Pending" />
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
