import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { StatCard, Card, HealthRow, Loading, ConsultingUpsell } from '../../components/Ui';

export function PerformanceImages() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (loading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  /* Placeholder ShortPixel stats until API integration */
  const totalImages = '--';
  const optimized = '--';
  const pending = '--';
  const sizeSaved = '--';

  const handleOptimize = async () => {
    if (!activeSiteId) return;
    setSubmitting(true);
    try {
      await arionApi.submitRequest(activeSiteId, 'image_optimize', '');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      alert('Failed to submit optimization request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Stat Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Images" value={totalImages} />
        <StatCard label="Optimized" value={optimized} deltaType="positive" />
        <StatCard label="Pending" value={pending} deltaType={pending !== '--' && Number(pending) > 0 ? 'negative' : 'neutral'} />
        <StatCard label="Size Saved" value={sizeSaved} />
      </div>

      {/* Image Health */}
      <Card title="Image Optimization Status">
        <HealthRow status="ok" label="WebP Conversion" value="Enabled" />
        <HealthRow status="ok" label="Lazy Loading" value="Active" />
        <HealthRow status="warn" label="Large Images (> 1 MB)" value="--" />
        <HealthRow status="ok" label="Monthly Credits" value="--" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {submitted ? 'Optimization request submitted!' : ''}
          </span>
          <button
            className="abtn abtn-sky"
            onClick={handleOptimize}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Optimize All Now'}
          </button>
        </div>
      </Card>

      <ConsultingUpsell
        headline="Large unoptimized images slow your mobile rankings"
        subtext="IA handles image optimization across your entire site."
        serviceType="Performance Optimization"
        triggerPage="performance-images"
      />
    </div>
  );
}
