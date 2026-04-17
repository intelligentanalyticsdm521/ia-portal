import { useArionContext } from '../useArionContext';
import { useArionData } from '../useArionData';

interface ArionPageHeaderProps {
  section: string;
  page: string;
}

export function ArionPageHeader({ section, page }: ArionPageHeaderProps) {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const domain = selectedSite?.primaryDomain || '--';
  const created = selectedSite?.createdAt ? new Date(selectedSite.createdAt).toLocaleDateString() : '--';
  const updated = selectedSite?.updatedAt ? new Date(selectedSite.updatedAt).toLocaleDateString() : '--';

  const handleWpAdmin = async () => {
    if (!activeSiteId) return;
    try {
      const res = await arionApi.getAdminLink(activeSiteId) as any;
      const url = res?.data?.admin_url || res?.admin_url || res?.url;
      if (url) window.open(url, '_blank');
      else window.open(`https://${domain}/wp-admin`, '_blank');
    } catch {
      window.open(`https://${domain}/wp-admin`, '_blank');
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#fff', border: '1px solid rgba(45,156,219,0.12)',
      borderRadius: 10, padding: '14px 18px', marginBottom: 16,
    }}>
      {/* LEFT: Site info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 7, background: '#F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#464646',
        }}>W</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', textDecoration: 'none' }}>
              {domain}
            </a>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#2D9CDB" strokeWidth="1.5">
              <path d="M4.5 1.5H2a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V7.5M7.5 1.5H10.5V4.5M10.5 1.5L5 7"/>
            </svg>
          </div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 1 }}>
            Created: {created} &middot; Last updated: {updated}
          </div>
        </div>
      </div>

      {/* CENTER: Breadcrumb */}
      <div style={{ fontSize: 13, color: '#5A7A8A' }}>
        <span style={{ color: '#0B1C24', fontWeight: 500 }}>ARION</span>
        <span style={{ margin: '0 6px', color: '#ccc' }}>&rsaquo;</span>
        <span>{section}</span>
        <span style={{ margin: '0 6px', color: '#ccc' }}>&rsaquo;</span>
        <span style={{ color: '#0B1C24', fontWeight: 500 }}>{page}</span>
      </div>

      {/* RIGHT: WP Admin button */}
      <button
        onClick={handleWpAdmin}
        style={{
          background: '#0C4A60', color: '#fff', border: 'none',
          padding: '7px 14px', borderRadius: 6, fontSize: 12,
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        WP Admin
      </button>
    </div>
  );
}
