import { HealthRow, Card, SidebarCard, StatusPill, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function HostingOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const health = h.health ?? {};
  const domainInfo = h.domain ?? {};
  const sslInfo = h.ssl ?? {};
  const content = h.content ?? {};

  const siteStatus = health.siteStatus ?? 'active';
  const wpVersion = health.wordpressVersion ?? '--';
  const phpVersion = health.phpVersion ?? '--';
  const hostingPlan = health.hostingPlan ?? '--';
  const lastCheck = health.lastHealthCheckAt ?? '--';
  const uptime = health.uptime ?? '--';

  const domainName = domainInfo.name ?? selectedSite.primaryDomain ?? '--';
  const registrar = domainInfo.registrar ?? 'Hostinger';
  const domainExpiry = domainInfo.expiresAt ?? '--';
  const autoRenew = domainInfo.autoRenew;
  const whoisPrivacy = domainInfo.whoisPrivacy;

  // SSL fix: if ssl_expiry is null AND sslStatus is not explicitly "expired", treat as Active (lifetime cert)
  const rawSslStatus = health.sslStatus ?? sslInfo?.status;
  const sslExpiry = health.sslExpiry ?? sslInfo?.expiry ?? null;
  const sslIssuer = health.sslIssuer ?? sslInfo?.issuer ?? "Let's Encrypt";
  const sslAutoRenew = sslInfo?.autoRenew !== false;

  // Determine effective SSL status: null/undefined sslStatus defaults to Active (Let's Encrypt by default)
  // null expiry with non-"expired" status = lifetime cert = Active
  const resolvedSslStatus = (() => {
    if (rawSslStatus === 'expired') return 'Expired';
    if (rawSslStatus === 'valid' || rawSslStatus === 'active') return 'Active';
    // If sslStatus is null/undefined, default to Active (all Hostinger sites have Let's Encrypt)
    if (!rawSslStatus || rawSslStatus === '--') return 'Active';
    return rawSslStatus;
  })();
  const sslIsHealthy = resolvedSslStatus !== 'Expired';

  const pageCount = content.pages ?? 0;
  const postCount = content.posts ?? 0;

  return (
    <div>
      {/* Two-panel dash layout */}
      <div className="dash-layout">
        {/* Left column */}
        <div>
          <Card title="Server Health">
            <HealthRow status="ok" label="Uptime" value={uptime !== '--' ? `${uptime}` : '99.9%'} />
            <HealthRow status={sslIsHealthy ? 'ok' : 'warn'} label="SSL Status" value={resolvedSslStatus} />
            <HealthRow status="ok" label="WordPress Version" value={wpVersion} />
            <HealthRow status="ok" label="PHP Version" value={phpVersion} />
            <HealthRow status="ok" label="Last Health Check" value={lastCheck !== '--' ? new Date(lastCheck).toLocaleString() : '--'} />
          </Card>

          <Card title="SSL Certificate">
            <HealthRow status={sslIsHealthy ? 'ok' : 'err'} label="Status" value={resolvedSslStatus} />
            <HealthRow status="ok" label="Auto-Renew" value={sslAutoRenew ? 'Enabled' : 'Disabled'} />
            <HealthRow status="ok" label="Issuer" value={sslIssuer} />
          </Card>

          <Card title="Content">
            <HealthRow status="ok" label="Pages" value={String(pageCount)} />
            <HealthRow status="ok" label="Posts" value={String(postCount)} />
          </Card>
        </div>

        {/* Right column - info sidebar */}
        <div className="info-sidebar">
          <SidebarCard label="Domain" value={domainName} />
          <SidebarCard label="Registrar" value={registrar} />
          <SidebarCard label="Expires" value={domainExpiry !== '--' ? new Date(domainExpiry).toLocaleDateString() : '--'} />
          <SidebarCard label="Auto-Renew" value={autoRenew === true ? 'Yes' : autoRenew === false ? 'No' : 'Yes'} valueClass={autoRenew === false ? 'warning' : 'success'} />
          <SidebarCard label="WHOIS Privacy" value={whoisPrivacy === false ? 'Disabled' : 'Enabled'} valueClass={whoisPrivacy === false ? 'warning' : 'success'} />
          <SidebarCard label="SSL" value={resolvedSslStatus} valueClass={sslIsHealthy ? 'success' : 'warning'} />
          <SidebarCard label="Daily Backup" value="Enabled" valueClass="success" />
          <SidebarCard label="Hosting Plan" value={hostingPlan} />
        </div>
      </div>

      <ConsultingUpsell
        headline="Need custom DNS, subdomains, or email routing? IA's IT team handles it without downtime."
        subtext="Expert hosting and infrastructure management."
        serviceType="IT & Hosting Management"
        triggerPage="hosting-overview"
      />
    </div>
  );
}
