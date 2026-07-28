import { useArionContext } from '../useArionContext';
import { useArionData } from '../useArionData';

interface ArionPageHeaderProps {
  section: string;
  page: string;
}

export function ArionPageHeader({ section, page }: ArionPageHeaderProps) {
  // 2026-06-20 — lift the ACTIVE SITE dropdown from ArionServiceLayout
  // (only the dashboard route uses it) into this header (every ARION
  // sub-page uses it). Brandon's complaint: "select test-site → click
  // any other page → reverts to intelligentanalyticsdm.com". Two
  // fixes combine: (a) the persistence + case-normalize in
  // useArionContext, (b) putting the picker on every page so selection
  // is always visible. WP Admin button now keys off activeSiteId via
  // getAdminLink (already correct) — but the fallback now uses the
  // selected site's wp_admin_url, not a guessed path off the domain.
  const { selectedSite, activeSiteId, sites, setSelectedSiteId, arionApi, loading, error } = useArionContext();

  const domain = selectedSite?.primaryDomain || null;
  const created = selectedSite?.createdAt ? new Date(selectedSite.createdAt).toLocaleDateString() : '--';
  const lastActivityIso = selectedSite?.lastContentChangeAt || selectedSite?.updatedAt;
  const lastActivity = lastActivityIso ? new Date(lastActivityIso).toLocaleDateString() : '--';

  // 2026-06-20 — Brandon hit "my ARION site links are gone." Root cause was
  // the previous fallback `domain = selectedSite?.primaryDomain || '--'`
  // rendered a literal "--" link (href=`https://--`) any time the sites
  // fetch hadn't finished OR returned empty. Each ARION page calls
  // useArionContext() independently — they each do their own fetch and
  // each has its own initial sites=[] state, so navigation produces a
  // flash of "--" links until refresh completes. Now we render explicit
  // states: loading → "Loading site…", empty after load → "No ARION site
  // connected", error → the error, and only render the real domain link
  // once a site is actually selected. Multi-instance fix (one shared
  // React context provider) is queued in SCOPE_WORKING.md Phase 2.
  const showLoading = loading && !selectedSite;
  const showEmpty = !loading && !error && (!sites || sites.length === 0);

  const handleWpAdmin = async () => {
    if (!activeSiteId) return;
    try {
      const res = await arionApi.getAdminLink(activeSiteId) as any;
      const url = res?.data?.admin_url || res?.admin_url || res?.url;
      if (url) window.open(url, '_blank');
      else if (selectedSite?.wpUrl) window.open(selectedSite.wpUrl, '_blank');
      else if (domain) window.open(`https://${domain}/wp-admin/`, '_blank');
    } catch {
      if (selectedSite?.wpUrl) window.open(selectedSite.wpUrl, '_blank');
      else if (domain) window.open(`https://${domain}/wp-admin/`, '_blank');
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#fff', border: '1px solid rgba(45,156,219,0.12)',
      borderRadius: 10, padding: '14px 18px', marginBottom: 16,
    }}>
      {/* LEFT: Site info + selector (only render selector when more than one site) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 7, background: '#F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#464646',
        }}>W</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {showLoading ? (
              <span style={{ fontSize: 14, fontWeight: 500, color: '#5A7A8A' }}>Loading site…</span>
            ) : showEmpty ? (
              <span style={{ fontSize: 14, fontWeight: 500, color: '#9CA3AF' }}>No ARION site connected</span>
            ) : sites && sites.length > 1 ? (
              <select
                value={activeSiteId || ''}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                style={{
                  fontSize: 14, fontWeight: 600, color: '#0B1C24',
                  background: '#fff', border: '1px solid #D1D5DB',
                  borderRadius: 6, padding: '2px 6px', cursor: 'pointer',
                }}
              >
                {sites.map((s) => (
                  <option key={s.siteId} value={s.siteId}>{s.primaryDomain || s.siteId}</option>
                ))}
              </select>
            ) : domain ? (
              <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer"
                data-tour="site-domain"
                style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', textDecoration: 'none' }}>
                {domain}
              </a>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 500, color: '#9CA3AF' }}>—</span>
            )}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#2D9CDB" strokeWidth="1.5">
              <path d="M4.5 1.5H2a.5.5 0 00-.5.5v8a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V7.5M7.5 1.5H10.5V4.5M10.5 1.5L5 7"/>
            </svg>
          </div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 1 }}>
            Created: {created} &middot; Last activity: {lastActivity}
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
        data-tour="wp-admin"
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
