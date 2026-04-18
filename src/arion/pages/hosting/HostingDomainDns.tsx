import React, { useState } from 'react';
import {
  Card, HealthRow, InfoCard, EmptyPanel, Loading, meetsMinTier, ConsultingUpsell,
} from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

// Session-scoped acknowledgement: "I understand DNS edits could break my site."
// Persisted to sessionStorage so it survives page nav during a single login but
// requires re-acknowledgement on next login.
const DNS_ACK_KEY = 'arion.dns_edit_ack';
function hasAckedDnsEdits(): boolean {
  try { return sessionStorage.getItem(DNS_ACK_KEY) === '1'; } catch { return false; }
}
function ackDnsEdits() {
  try { sessionStorage.setItem(DNS_ACK_KEY, '1'); } catch { /* noop */ }
}

function DnsWarningModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: 10, maxWidth: 480, width: '90vw', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FFF3CD', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B88A00', fontWeight: 700 }}>!</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0B1C24' }}>DNS Record Updates Are Not Recommended</div>
        </div>
        <p style={{ fontSize: 13, color: '#5A7A8A', lineHeight: 1.6, marginTop: 4 }}>
          DNS records control where your domain sends traffic and how your email is delivered. An incorrect change can take your website offline or stop email from being delivered.
        </p>
        <p style={{ fontSize: 13, color: '#5A7A8A', lineHeight: 1.6, marginTop: 10 }}>
          <strong style={{ color: '#0B1C24' }}>We recommend reaching out to Intelligent Analytics to update DNS records.</strong> Our team will review the change, apply it safely, and roll back if anything breaks.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 12, color: '#0B1C24', lineHeight: 1.5 }}>
            I understand DNS record edits could cause configuration issues for my website.
          </span>
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="abtn" onClick={onCancel}>Cancel</button>
          <button
            className="abtn abtn-sky"
            disabled={!checked}
            onClick={() => { ackDnsEdits(); onConfirm(); }}
            style={{ opacity: checked ? 1 : 0.5, cursor: checked ? 'pointer' : 'not-allowed' }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// Normalize + validate record content based on type. Returns { value, error? }.
// CNAME/MX content must be a hostname (we append trailing dot if missing).
// A requires IPv4, AAAA requires IPv6, TXT accepts anything.
function normalizeContent(type: string, raw: string): { value: string; error?: string } {
  const v = (raw || '').trim();
  if (!v) return { value: v, error: 'Content is required' };
  if (type === 'A') {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return { value: v, error: 'A record requires an IPv4 address (e.g. 93.184.216.34)' };
    return { value: v };
  }
  if (type === 'AAAA') {
    if (!/^[0-9a-fA-F:]+$/.test(v) || !v.includes(':')) return { value: v, error: 'AAAA record requires an IPv6 address' };
    return { value: v };
  }
  if (type === 'CNAME' || type === 'MX' || type === 'NS' || type === 'ALIAS') {
    // Must be a hostname (letters, digits, dashes, dots). Append trailing dot for canonical form.
    const cleaned = v.replace(/\/+$/, ''); // strip trailing slashes users sometimes paste
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+$/.test(cleaned.replace(/\.$/, ''))) {
      return { value: cleaned, error: `${type} record needs a valid hostname like example.com — got "${v}"` };
    }
    const withDot = cleaned.endsWith('.') ? cleaned : cleaned + '.';
    return { value: withDot };
  }
  if (type === 'TXT') {
    return { value: v };
  }
  return { value: v };
}

function placeholderForType(type: string): string {
  switch (type) {
    case 'A':     return '93.184.216.34';
    case 'AAAA':  return '2606:2800:220:1::1';
    case 'CNAME': return 'target.example.com';
    case 'MX':    return 'mail.example.com';
    case 'TXT':   return 'v=spf1 include:_spf.example.com ~all';
    default:      return '';
  }
}

// Small inline editor for a single record — appears in place of the row when Edit clicked
function EditRecordRow({ rec, onSave, onCancel, saving, errorMsg }: { rec: any; onSave: (r: any) => void; onCancel: () => void; saving: boolean; errorMsg: string | null }) {
  const [content, setContent] = useState(rec.content || '');
  const [ttl, setTtl] = useState(String(rec.ttl || 14400));
  const norm = normalizeContent(rec.type, content);
  const canSave = !saving && !norm.error;
  return (
    <>
      <tr style={{ background: '#FFF8E1' }}>
        <td>{rec.type}</td>
        <td>{rec.name}</td>
        <td>{rec.priority ?? '--'}</td>
        <td>
          <input value={content} onChange={e => setContent(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
        </td>
        <td>
          <input value={ttl} onChange={e => setTtl(e.target.value)} style={{ width: 70, fontSize: 12 }} />
        </td>
        <td>
          <button
            className="text-btn primary"
            disabled={!canSave}
            style={{ opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
            onClick={() => onSave({ ...rec, content: norm.value, ttl: parseInt(ttl, 10) || 14400 })}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="text-btn" style={{ marginLeft: 8 }} onClick={onCancel}>Cancel</button>
        </td>
      </tr>
      {(norm.error || errorMsg) && (
        <tr style={{ background: '#FFF8E1' }}>
          <td colSpan={6} style={{ padding: '4px 8px 8px', fontSize: 11, color: '#D85A30' }}>
            {norm.error || errorMsg}
          </td>
        </tr>
      )}
    </>
  );
}

export function HostingDomainDns() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const currentTier = selectedSite?.arionTier || 'standard';
  const isPro = meetsMinTier(currentTier, 'pro');

  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Warning modal state
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);

  // DNS form state
  const [newType, setNewType] = useState('A');
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTtl, setNewTtl] = useState('14400');

  // Edit-in-place state (keyed by type|name|content to identify row uniquely)
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const { data: hosting, loading: hostingLoading } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId, refreshKey]
  );

  if (hostingLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const domainInfo = h.domain ?? {};
  const dnsRecords: any[] = Array.isArray(h.dns) ? h.dns : [];

  const domainName = domainInfo.name ?? '--';
  const registrar = domainInfo.registrar ?? '--';
  const domainExpiry = domainInfo.expiresAt ?? '--';
  const autoRenew = domainInfo.autoRenew;
  const whoisPrivacy = domainInfo.whoisPrivacy;
  const nameservers: string[] = Array.isArray(domainInfo.nameservers) ? domainInfo.nameservers : [];

  const term = searchTerm.toLowerCase();
  const filteredRecords = term
    ? dnsRecords.filter(r =>
        (r.type ?? '').toLowerCase().includes(term) ||
        (r.name ?? '').toLowerCase().includes(term) ||
        (r.content ?? '').toLowerCase().includes(term)
      )
    : dnsRecords;

  // Gate any DNS mutation behind the session-scoped acknowledgement
  const withDnsAck = (fn: () => void) => {
    if (hasAckedDnsEdits()) { fn(); return; }
    setPendingAction(() => fn);
  };

  const addValidation = normalizeContent(newType, newContent);

  const runAdd = async () => {
    if (!activeSiteId || !newName || !newContent) return;
    const norm = normalizeContent(newType, newContent);
    if (norm.error) { setMutationError(norm.error); return; }
    setMutating(true);
    setMutationError(null);
    try {
      await arionApi.createDnsRecords(activeSiteId, [{
        type: newType,
        name: newName.trim(),
        content: norm.value,
        ttl: parseInt(newTtl, 10) || 14400,
      }]);
      setNewType('A');
      setNewName('');
      setNewContent('');
      setNewTtl('14400');
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      setMutationError(e?.message || 'Add failed');
    } finally {
      setMutating(false);
    }
  };

  const runDelete = async (rec: any) => {
    if (!activeSiteId) return;
    setMutating(true);
    setMutationError(null);
    try {
      await arionApi.deleteDnsRecords(activeSiteId, [{
        type: rec.type,
        name: rec.name,
        content: rec.content,
      }]);
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      setMutationError(e?.message || 'Delete failed');
    } finally {
      setMutating(false);
    }
  };

  const runEdit = async (rec: any) => {
    if (!activeSiteId) return;
    setMutating(true);
    setMutationError(null);
    try {
      // Edit: PUT with overwrite=true so Hostinger replaces the existing record
      // at (name, type) with the new content/ttl. Without overwrite the API
      // rejects with 4008 conflict.
      await arionApi.createDnsRecords(activeSiteId, [{
        type: rec.type,
        name: rec.name,
        content: rec.content,
        ttl: rec.ttl,
      }], true);
      setEditingKey(null);
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      setMutationError(e?.message || 'Edit failed');
    } finally {
      setMutating(false);
    }
  };

  const handleAddRecord = () => withDnsAck(runAdd);
  const handleDeleteRecord = (rec: any) => withDnsAck(() => runDelete(rec));
  const handleEditSave = (r: any) => withDnsAck(() => runEdit(r));

  return (
    <div>
      <h2 className="section-title">Manage DNS Records</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        These records define how your domain behaves &mdash; where traffic is routed, how email is delivered, and which services are verified.
      </p>

      {mutationError && (
        <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
          <strong style={{ color: '#D85A30' }}>DNS change failed:</strong> {mutationError}
        </div>
      )}

      {/* Add Record Form (Pro+) */}
      {isPro && (
        <>
          <div className="dns-form-row">
            <select value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="A">A</option>
              <option value="AAAA">AAAA</option>
              <option value="CNAME">CNAME</option>
              <option value="MX">MX</option>
              <option value="TXT">TXT</option>
            </select>
            <input placeholder="Name (e.g. subdomain or @ for root)" value={newName} onChange={e => setNewName(e.target.value)} />
            <input placeholder={placeholderForType(newType)} value={newContent} onChange={e => setNewContent(e.target.value)} />
            <input placeholder="14400" value={newTtl} onChange={e => setNewTtl(e.target.value)} style={{ width: 90 }} />
            <button className="abtn abtn-sky" disabled={mutating || !!addValidation.error} onClick={handleAddRecord}>
              {mutating ? 'Saving...' : 'Add Record'}
            </button>
          </div>
          {addValidation.error && newContent && (
            <div style={{ fontSize: 11, color: '#D85A30', margin: '4px 0 10px', paddingLeft: 2 }}>
              {addValidation.error}
            </div>
          )}
        </>
      )}

      {/* DNS Records Table */}
      <Card>
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
              {filteredRecords.map((rec: any, i: number) => {
                const rowKey = `${rec.type}|${rec.name}|${rec.content}`;
                if (editingKey === rowKey) {
                  return (
                    <EditRecordRow
                      key={i}
                      rec={rec}
                      saving={mutating}
                      errorMsg={mutationError}
                      onSave={(r) => handleEditSave(r)}
                      onCancel={() => { setEditingKey(null); setMutationError(null); }}
                    />
                  );
                }
                return (
                  <tr key={i}>
                    <td>{rec.type ?? '--'}</td>
                    <td>{rec.name ?? '--'}</td>
                    <td>{rec.priority ?? '--'}</td>
                    <td>{rec.content ?? '--'}</td>
                    <td>{rec.ttl ?? '--'}</td>
                    {isPro && (
                      <td>
                        <button className="text-btn danger" onClick={() => handleDeleteRecord(rec)}>Delete</button>
                        <button
                          className="text-btn primary"
                          style={{ marginLeft: 8 }}
                          onClick={() => withDnsAck(() => setEditingKey(rowKey))}
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
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

      {/* Domain Info */}
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

      {/* Warning modal — session-scoped */}
      {pendingAction && (
        <DnsWarningModal
          onConfirm={() => { const fn = pendingAction; setPendingAction(null); fn(); }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
