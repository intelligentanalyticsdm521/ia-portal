import React from 'react';
import { useArionContext } from '../useArionContext';

/**
 * Visible diagnostic panel used when /arion/seo/rankings (or /audit)
 * reports an upstream SE Ranking failure. Calls /arion/seo/diagnostic
 * on demand and shows the raw upstream status + a sample of each
 * response, so the user can see exactly what's failing.
 */
export function SeoDiagnosticPanel({ siteId }: { siteId: string | null }) {
  const { arionApi } = useArionContext();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await arionApi.getSeoDiagnostic(siteId);
      setData(res);
      setOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Diagnostic failed');
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const rowStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(45,156,219,0.15)' };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#0B1C24' };

  return (
    <div style={{ background: '#F8FAFC', border: '1px solid rgba(45,156,219,0.25)', borderRadius: 6, padding: 14, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>SE Ranking API — Diagnostic</div>
          <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>
            Check upstream status if the page shows no data despite a linked project.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={run} disabled={loading || !siteId} style={{ fontSize: 11, padding: '5px 12px', background: '#2D9CDB', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: loading || !siteId ? 0.5 : 1 }}>
            {loading ? 'Running…' : 'Run diagnostic'}
          </button>
          {data && (
            <button onClick={() => setOpen(o => !o)} style={{ fontSize: 11, padding: '5px 12px', background: '#fff', color: '#0B1C24', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>
              {open ? 'Hide' : 'Show'} results
            </button>
          )}
        </div>
      </div>

      {open && error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#D85A30' }}>Error: {error}</div>
      )}

      {open && data && !error && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#5A7A8A' }}>
          <div style={rowStyle}>
            <span style={labelStyle}>Site:</span> {data.site?.domain || '--'} · project <code>{String(data.site?.seRankingProjectId ?? '--')}</code> · tier <code>{data.site?.seoAddonTier || '--'}</code>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Project API key:</span>{' '}
            <span style={{ color: data.env?.SERANKING_API_SYSTEM_KEY === 'set' ? '#1D9E75' : '#D85A30', fontWeight: 600 }}>{data.env?.SERANKING_API_SYSTEM_KEY}</span>{' '}
            · <span style={labelStyle}>Data API key:</span>{' '}
            <span style={{ color: data.env?.SERANKING_DATA_API_KEY === 'set' ? '#1D9E75' : '#D4A800', fontWeight: 600 }}>{data.env?.SERANKING_DATA_API_KEY}</span>{' '}
            · <span style={labelStyle}>base:</span> <code>{data.env?.base}</code>
          </div>
          {Object.entries(data.results || {}).map(([k, r]: any) => (
            <div key={k} style={rowStyle}>
              <span style={labelStyle}>{r.label || k}</span>{' '}
              <span style={{ color: r.ok ? '#1D9E75' : '#D85A30', fontWeight: 600 }}>
                {r.ok ? `200 OK` : `HTTP ${r.httpStatus}`}
              </span>
              {' · '}
              <span>
                {r.dataType === 'array' ? `array (${r.count} item${r.count === 1 ? '' : 's'})` : `${r.dataType}`}
              </span>
              {r.errorText && (
                <div style={{ marginTop: 4, color: '#D85A30', fontSize: 10, fontFamily: 'monospace' }}>
                  {r.errorText}
                </div>
              )}
              {r.sample != null && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 10, color: '#2D9CDB' }}>sample</summary>
                  <pre style={{ margin: '4px 0 0 0', fontSize: 10, background: '#fff', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 200 }}>
                    {JSON.stringify(r.sample, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
