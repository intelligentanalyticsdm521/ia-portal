import { useState } from 'react';
import { Card, ScoreCircle, SidebarCard, InfoCard, TierGate, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';

export function HostingPerformance() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const currentTier = selectedSite?.arionTier || 'standard';

  const [desktopResult, setDesktopResult] = useState<any>(null);
  const [mobileResult, setMobileResult] = useState<any>(null);
  const [testing, setTesting] = useState<string | null>(null);

  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const runTest = async (strategy: 'desktop' | 'mobile') => {
    if (!activeSiteId) return;
    setTesting(strategy);
    try {
      const result = await arionApi.runPageSpeed(activeSiteId, strategy);
      if (strategy === 'desktop') setDesktopResult(result);
      else setMobileResult(result);
    } catch {
      // error handled by API layer
    } finally {
      setTesting(null);
    }
  };

  const activeResult = desktopResult || mobileResult;
  const perf = activeResult ? (activeResult.performance ?? activeResult.performanceScore ?? null) : null;
  const metrics = activeResult?.metrics ?? {};
  const accessibility = activeResult?.accessibility ?? null;
  const seo = activeResult?.seo ?? null;
  const bestPractices = activeResult?.bestPractices ?? null;

  return (
    <TierGate currentTier={currentTier} requiredTier="pro" featureName="PageSpeed Insights">
      <div>
        <Card title="Website Speed Test">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Run a Google PageSpeed Insights test to measure your site's performance, accessibility, and SEO scores.
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="abtn abtn-sky"
              onClick={() => runTest('desktop')}
              disabled={testing !== null}
            >
              {testing === 'desktop' ? 'Testing...' : 'Test Desktop'}
            </button>
            <button
              className="abtn abtn-outline"
              onClick={() => runTest('mobile')}
              disabled={testing !== null}
            >
              {testing === 'mobile' ? 'Testing...' : 'Test Mobile'}
            </button>
          </div>
          {testing && <div style={{ marginTop: 12 }}><Loading message={`Running ${testing} speed test...`} /></div>}
        </Card>

        {activeResult ? (
          <div className="dash-layout">
            {/* Left: Score circles */}
            <Card title={`${desktopResult && mobileResult ? 'Latest' : desktopResult ? 'Desktop' : 'Mobile'} Results`}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <ScoreCircle score={typeof perf === 'number' ? perf : null} label="Performance" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <ScoreCircle score={typeof accessibility === 'number' ? accessibility : null} label="Accessibility" />
                <ScoreCircle score={typeof seo === 'number' ? seo : null} label="SEO" />
                <ScoreCircle score={typeof bestPractices === 'number' ? bestPractices : null} label="Best Practices" />
              </div>
            </Card>

            {/* Right: Metrics sidebar */}
            <div className="info-sidebar">
              <SidebarCard label="LCP" value={metrics.lcp ?? '--'} />
              <SidebarCard label="CLS" value={metrics.cls ?? '--'} />
              <SidebarCard label="INP" value={metrics.inp ?? '--'} />
              <SidebarCard label="FCP" value={metrics.fcp ?? '--'} />
              <SidebarCard label="Speed Index" value={metrics.speedIndex ?? '--'} />
              <SidebarCard label="TBT" value={metrics.tbt ?? '--'} />
            </div>
          </div>
        ) : (
          !testing && (
            <InfoCard title="No Results Yet">
              Click one of the buttons above to run a speed test on your website. Results will include performance scores, accessibility ratings, and Core Web Vitals metrics.
            </InfoCard>
          )
        )}
      </div>

      <ConsultingUpsell
        headline="Slow sites lose customers. IA's performance team can optimize your Core Web Vitals."
        subtext="Performance optimization with measurable results."
        serviceType="Performance Optimization"
        triggerPage="hosting-performance"
      />
    </TierGate>
  );
}
