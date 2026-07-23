import { useArionContext } from '../../useArionContext';
import { Card, TierGate, EmptyPanel, ConsultingUpsell } from '../../components/Ui';

export function BusinessServices() {
  const { selectedSite } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  return (
    <TierGate currentTier={tier} requiredTier="pro" featureName="Services & products management">
      <Card title="Services & Products">
        <p style={{ color: 'var(--text-muted)' }}>
          Coming soon — manage the services and products shown on your Google
          Business Profile right from here. In the meantime you can edit them
          directly in your{' '}
          <a href="https://business.google.com" target="_blank" rel="noopener noreferrer">
            Google Business Profile
          </a>
          ; everything you set there still appears on Google today.
        </p>
      </Card>

      <ConsultingUpsell
        headline="Complete service listings drive more leads. IA manages your business services."
        subtext="Service listing optimization for local search."
        serviceType="Local SEO"
        triggerPage="business-services"
      />
    </TierGate>
  );
}
