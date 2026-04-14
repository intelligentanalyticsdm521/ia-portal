import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, ConsultingUpsell } from '../../components/Ui';

export function WebsiteUpdates() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: vulnData, loading: vulnLoading } = useArionData(
    () => activeSiteId ? arionApi.getVulnerabilities(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || hostingLoading || vulnLoading) return <Loading />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const h = (hosting as Record<string, any>) ?? {};
  const plugins: any[] = Array.isArray(h.plugins) ? h.plugins : [];

  const v = (vulnData as Record<string, any>)?.data ?? (vulnData as Record<string, any>) ?? {};
  const vulnerabilities: any[] = Array.isArray(v.vulnerabilities) ? v.vulnerabilities : [];

  /* Build a slug-indexed vulnerability map */
  const vulnMap = new Map<string, any>();
  vulnerabilities.forEach((vuln: any) => {
    const slug = vuln.slug || vuln.plugin || '';
    if (slug) vulnMap.set(slug.toLowerCase(), vuln);
  });

  /* Determine status for each plugin */
  const rows = plugins.map((p: any) => {
    const slug = (p.slug || p.name || '').toLowerCase();
    const vuln = vulnMap.get(slug);
    let status: 'security' | 'update' | 'current' = 'current';
    if (vuln) status = 'security';
    else if (p.update_available || p.updateAvailable) status = 'update';
    return { ...p, vuln, status };
  });

  const statusBadge = (status: 'security' | 'update' | 'current') => {
    const styles: Record<string, { background: string; color: string; label: string }> = {
      security: { background: '#dc2626', color: '#fff', label: 'Security fix' },
      update: { background: '#f59e0b', color: '#fff', label: 'Update available' },
      current: { background: '#22c55e', color: '#fff', label: 'Current' },
    };
    const s = styles[status];
    return (
      <span style={{
        background: s.background,
        color: s.color,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
      }}>
        {s.label}
      </span>
    );
  };

  const handleRequestUpdate = async () => {
    if (!activeSiteId) return;
    setSubmitting(true);
    try {
      await arionApi.submitRequest(activeSiteId, 'update_request', '');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      alert('Failed to submit update request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Card title="Component Updates">
        {rows.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Component</th>
                <th>Current Version</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={r.slug || r.name || i}>
                  <td>{r.name || r.plugin_name || '--'}</td>
                  <td>{r.version || '--'}</td>
                  <td>{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
            No plugin data available.
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {submitted ? 'Update request submitted!' : ''}
          </span>
          <button
            className="abtn abtn-sky"
            onClick={handleRequestUpdate}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Request Immediate Update'}
          </button>
        </div>
      </Card>

      <ConsultingUpsell
        headline="All IA-managed updates are tested before deployment"
        subtext="Zero-downtime updates included with all plans."
        serviceType="IT & Hosting Management"
        triggerPage="website-updates"
      />
    </div>
  );
}
