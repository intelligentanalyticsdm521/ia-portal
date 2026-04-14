import { useArionContext } from '../../useArionContext';
import { StatCard, Card, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

export function SearchCoreWebVitals() {
  const { selectedSite, activeSiteId } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  return (
    <>
      <div className="stat-row">
        <StatCard label="LCP" value="--" delta="Largest Contentful Paint" />
        <StatCard label="INP" value="--" delta="Interaction to Next Paint" />
        <StatCard label="CLS" value="--" delta="Cumulative Layout Shift" />
      </div>

      <InfoCard title="Info">Core Web Vitals are sourced from the Chrome UX Report (CrUX), which reflects real user experience data collected from Chrome browsers. Data may take up to 28 days to populate.</InfoCard>

      <Card title="Core Web Vitals by Page">
        <EmptyPanel message="Page-level Core Web Vitals data is not yet available. Data will appear once the CrUX API integration is configured." />
      </Card>

      <ConsultingUpsell
        headline="Core Web Vitals affect your rankings. IA's team resolves failing metrics."
        subtext="Core Web Vitals optimization for better rankings."
        serviceType="Performance Optimization"
        triggerPage="search-core-web-vitals"
      />
    </>
  );
}
