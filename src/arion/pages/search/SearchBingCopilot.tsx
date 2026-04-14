import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function SearchBingCopilot() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, error } = useArionData(
    () => activeSiteId ? arionApi.getConsole('bing', activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = data as Record<string, any> | null;
  const summary = d?.summary ?? {};

  return (
    <div>
      {/* Copilot AI appearance highlight card */}
      <div
        style={{
          background: 'var(--ink-bg, #1a1a2e)',
          color: '#fff',
          borderRadius: 12,
          padding: '1.5rem',
          marginBottom: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7, marginBottom: 4 }}>
          Copilot AI Appearances
        </div>
        <div style={{ fontSize: 40, fontWeight: 700 }}>
          {summary.copilotAppearances ?? 0}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          Times your business appeared in Microsoft Copilot answers
        </div>
      </div>

      {/* Stat row */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatCard label="Copilot Appearances" value={summary.copilotAppearances ?? 0} />
        <StatCard label="Unique Queries" value={summary.uniqueQueries ?? summary.queries ?? '--'} />
        <StatCard label="Bing Impressions" value={summary.impressions ?? '--'} />
        <StatCard label="IndexNow Status" value={d?.connected ? 'Active' : 'Inactive'} />
      </div>

      {/* Info card */}
      <Card title="About Copilot AI Visibility">
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
          Microsoft Copilot uses Bing's index to generate AI-powered answers. When your business
          data is complete and accurate across Bing Places and your website, Copilot is more likely
          to surface your business in conversational search results. Factors that influence visibility
          include structured data markup, consistent NAP (Name, Address, Phone) information,
          and an active Bing Places listing.
        </p>
      </Card>

      <ConsultingUpsell
        headline="Copilot AI visibility grows with complete business profiles"
        subtext="IA optimizes your listings for AI-powered search."
        serviceType="Local SEO"
        triggerPage="search-bing-copilot"
      />
    </div>
  );
}
