import { useState } from 'react';
import {
  Card, HealthRow, InfoCard, EmptyPanel, Loading, meetsMinTier, ConsultingUpsell,
} from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function HostingDomainDns() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const currentTier = selectedSite?.arionTier || 'standard';
  const isPro = meetsMinTier(currentTier, 'pro');

  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  /* DNS form state */
  const [newType, setNewType] = useState('A');
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTtl, setNewTtl] = useState('14400');

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId, refreshKey]
  );

  if (hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const domainInfo = h.domain ?? {};
  const dnsRecords: any[] = Array.isArray(h.dns) ? h.dns : [];

  /* Domain info fields */
  const domainName = domainInfo.name ?? '--';
  const registrar = domainInfo.registrar ?? '--';
  const domainExpiry = domainInfo.expiresAt ?? '--';
  const autoRenew = domainInfo.autoRenew;
  const whoisPrivacy = domainInfo.whoisPrivacy;
  const nameservers: string[] = Array.isArray(domainInfo.nameservers) ? domainInfo.nameservers : [];

  /* Client-side filter */
  const term = searchTerm.toLowerCase();
  const filteredRecords = term
    ? dnsRecords.filter(r =>
        (r.type ?? '').toLowerCase().includes(term) ||
        (r.name ?? '').toLowerCase().includes(term) ||
        (r.content ?? '').toLowerCase().includes(term)
      )
    : dnsRecords;

  /* Mutations */
  const handleAddRecord = async () => {
    if (!activeSiteId || !newName || !newContent) return;
    try {
      await arionApi.createDnsRecords(activeSiteId, [{
        type: newType,
        name: newName,
        content: newContent,
        ttl: parseInt(newTtl, 10) || 14400,
      }]);
      setNewType('A');
      setNewName('');
      setNewContent('');
      setNewTtl('14400');
      setRefreshKey(k => k + 1);
    } catch {
      // error handled by API layer
    }
  };

  const handleDeleteRecord = async (rec: any) => {
    if (!activeSiteId) return;
    try {
      await arionApi.deleteDnsRecords(activeSiteId, [{
        type: rec.type,
        name: rec.name,
        content: rec.content,
      }]);
      setRefreshKey(k => k + 1);
    } catch {
      // error handled by API layer
    }
  };

  return (
    <div>
      {/* ── Section title ── */}
      <h2 className="section-title">Manage DNS Records</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        These records define how your domain behaves &mdash; where traffic is routed, how email is delivered, and which services are verified.
      </p>

      {/* ── Add Record Form (Pro+) ── */}
      {isPro && (
        <div className="dns-form-row">
          <select value={newType} onChange={e => setNewType(e.target.value)}>
            <option value="A">A</option>
            <option value="AAAA">AAAA</option>
            <option value="CNAME">CNAME</option>
            <option value="MX">MX</option>
            <option value="TXT">TXT</option>
          </select>
          <input
            placeholder="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            placeholder="Points to"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
          />
          <input
            placeholder="14400"
            value={newTtl}
            onChange={e => setNewTtl(e.target.value)}
            style={{ width: 90 }}
          />
          <button className="abtn abtn-sky" onClick={handleAddRecord}>
            Add Record
          </button>
        </div>
      )}

      {/* ── DNS Records Table ── */}
      <Card>
        {/* Search */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search records..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', maxWidth: 320 }}
          />
        </div>

        {filteredRecords.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Priority</th>
                <th>Content</th>
                <th>TTL</th>
                {isPro && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec: any, i: number) => (
                <tr key={i}>
                  <td>{rec.type ?? '--'}</td>
                  <td>{rec.name ?? '--'}</td>
                  <td>{rec.priority ?? '--'}</td>
                  <td>{rec.content ?? '--'}</td>
                  <td>{rec.ttl ?? '--'}</td>
                  {isPro && (
                    <td>
                      <button
                        className="text-btn danger"
                        onClick={() => handleDeleteRecord(rec)}
                      >
                        Delete
                      </button>
                      <button className="text-btn primary" style={{ marginLeft: 8 }}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyPanel message="No DNS records match your search." />
        )}

        {!isPro && (
          <InfoCard title="DNS Editing">
            DNS record editing requires a Pro plan or above. Upgrade your plan to add, edit, or remove DNS records.
          </InfoCard>
        )}
      </Card>

      {/* ── Domain Info ── */}
      <Card title="Domain Info">
        <HealthRow status={domainName !== '--' ? 'ok' : 'warn'} label="Domain" value={domainName} />
        <HealthRow status="ok" label="Registrar" value={registrar} />
        <HealthRow
          status={domainExpiry !== '--' ? 'ok' : 'warn'}
          label="Expiry"
          value={domainExpiry !== '--' ? new Date(domainExpiry).toLocaleDateString() : '--'}
        />
        <HealthRow
          status={autoRenew === true ? 'ok' : 'warn'}
          label="Auto-Renew"
          value={autoRenew === true ? 'Yes' : autoRenew === false ? 'No' : '--'}
        />
        <HealthRow
          status={whoisPrivacy === true ? 'ok' : 'warn'}
          label="WHOIS Privacy"
          value={whoisPrivacy === true ? 'Enabled' : whoisPrivacy === false ? 'Disabled' : '--'}
        />
        {nameservers.length > 0 && (
          <HealthRow status="ok" label="Nameservers" value={nameservers.join(', ')} />
        )}
      </Card>

      <ConsultingUpsell
        headline="Need DNS configuration help? IA handles complex domain setups safely."
        subtext="DNS management with zero-downtime migrations."
        serviceType="IT & Hosting Management"
        triggerPage="hosting-domain-dns"
      />
    </div>
  );
}
