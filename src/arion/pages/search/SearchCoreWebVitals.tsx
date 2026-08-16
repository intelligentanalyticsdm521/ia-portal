import { useArionContext } from '../../useArionContext';
import { StatCard, Card, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';

export function SearchCoreWebVitals() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  return (
    <>
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'pagespeed_scores', label: 'All four scores' },
        { id: 'core_web_vitals', label: 'Core Web Vitals' },
        { id: 'pagespeed_field_data', label: 'Real visitor speed' },
        { id: 'pagespeed_performance_audits', label: 'What is slowing it down' },
        { id: 'pagespeed_opportunities', label: 'Speed fixes' },
        { id: 'pagespeed_accessibility_audits', label: 'Accessibility checks' },
        { id: 'pagespeed_seo_audits', label: 'Technical SEO checks' },
        { id: 'pagespeed_best_practice_audits', label: 'Best practice checks' },
      ]} />
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
