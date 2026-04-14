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
          Services management will be available once the GBP Services API integration is configured.
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
