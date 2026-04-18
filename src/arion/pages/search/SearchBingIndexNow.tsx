import React from 'react';
import { useArionContext } from '../../useArionContext';
import { Card, EmptyPanel, HealthRow, InfoCard, ConsultingUpsell } from '../../components/Ui';

function StatusPill({ kind, children }: { kind: 'ok' | 'warn' | 'err' | 'neutral'; children: React.ReactNode }) {
  const palette = {
    ok:      { bg: 'rgba(29,158,117,0.12)', color: '#1D9E75' },
    warn:    { bg: 'rgba(212,168,0,0.12)',  color: '#B88A00' },
    err:     { bg: 'rgba(216,90,48,0.12)',  color: '#D85A30' },
    neutral: { bg: '#F8FAFC',                color: '#5A7A8A' },
  }[kind];
  return (
    <span style={{ display: 'inline-block', background: palette.bg, color: palette.color, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 3 }}>
      {children}
    </span>
  );
}

function CopyBlock({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: multiline ? 'flex-start' : 'center' }}>
        <code style={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, background: '#0B1C24', color: '#A8CDD8', padding: '8px 10px', borderRadius: 4, wordBreak: 'break-all', whiteSpace: multiline ? 'pre-wrap' : 'nowrap', overflowX: 'auto' }}>
          {value}
        </code>
        <button onClick={onCopy} className="abtn" style={{ fontSize: 11, padding: '6px 10px', flexShrink: 0 }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '--';
  try { return new Date(iso).toLocaleString(); } catch { return '--'; }
}

function statusBadge(status: string) {
  if (status === 'accepted') return <StatusPill kind="ok">Accepted</StatusPill>;
  if (status === 'rejected') return <StatusPill kind="err">Rejected</StatusPill>;
  if (status === 'error') return <StatusPill kind="err">Error</StatusPill>;
  if (status === 'no_key') return <StatusPill kind="warn">No Key</StatusPill>;
  return <StatusPill kind="neutral">{status}</StatusPill>;
}

export function SearchBingIndexNow() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [loading, setLoading] = React.useState(true);
  const [keyInfo, setKeyInfo] = React.useState<any>(null);
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [verifyResult, setVerifyResult] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!activeSiteId) return;
    try {
      const [status, subs] = await Promise.all([
        arionApi.getIndexNowStatus(activeSiteId),
        arionApi.getIndexNowSubmissions(activeSiteId, 20).catch(() => ({ submissions: [] })),
      ]);
      setKeyInfo(status);
      setSubmissions(subs?.submissions || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load IndexNow state');
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, arionApi]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const handleGenerate = async () => {
    if (!activeSiteId) return;
    setActionLoading('generate');
    setVerifyResult(null);
    try {
      const result = await arionApi.generateIndexNowKey(activeSiteId);
      setKeyInfo(result);
    } catch (e: any) {
      setError(e.message || 'Failed to generate key');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async () => {
    if (!activeSiteId) return;
    setActionLoading('verify');
    try {
      const result = await arionApi.verifyIndexNowKey(activeSiteId);
      setVerifyResult(result);
      if (result.verified) await refresh();
    } catch (e: any) {
      setVerifyResult({ verified: false, error: e.message || 'Verification failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!activeSiteId) return;
    if (!confirm('Delete the IndexNow key? You\'ll need to remove the hosted .txt file from your site too.')) return;
    setActionLoading('delete');
    setVerifyResult(null);
    try {
      await arionApi.deleteIndexNowKey(activeSiteId);
      await refresh();
    } catch (e: any) {
      setError(e.message || 'Failed to delete key');
    } finally {
      setActionLoading(null);
    }
  };

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;
  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>;

  const hasKey = !!keyInfo?.key;
  const verified = !!keyInfo?.verified;
  const host = keyInfo?.host || selectedSite.primaryDomain || '';
  const keyFileName = hasKey ? `${keyInfo.key}.txt` : null;

  return (
    <>
      {/* Status overview */}
      <Card title="IndexNow Status">
        <HealthRow
          label="IndexNow Protocol"
          status={verified ? 'ok' : hasKey ? 'warn' : 'warn'}
          value={verified ? 'Active' : hasKey ? 'Key generated — awaiting verification' : 'Not configured'}
        />
        <HealthRow
          label="Key File Location"
          status={verified ? 'ok' : 'warn'}
          value={keyInfo?.keyLocation || '--'}
        />
        <HealthRow
          label="Generated"
          status={keyInfo?.generatedAt ? 'ok' : 'warn'}
          value={formatDateTime(keyInfo?.generatedAt)}
        />
        <HealthRow
          label="Verified"
          status={verified ? 'ok' : 'warn'}
          value={verified ? formatDateTime(keyInfo?.verifiedAt) : 'Not yet verified'}
        />
      </Card>

      {error && (
        <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', padding: '10px 14px', borderRadius: 4, fontSize: 12, color: '#5A7A8A', marginTop: 12 }}>{error}</div>
      )}

      {/* No key yet */}
      {!hasKey && (
        <Card title="Generate an IndexNow Key">
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
            IndexNow lets you notify <strong>Bing, Yandex, Seznam, and Naver</strong> about new or updated URLs instantly, without waiting for crawl. To enable it, we'll generate a UUID key for your site and walk you through hosting a verification file at the site root.
          </p>
          <button
            className="abtn abtn-sky"
            disabled={actionLoading === 'generate' || !activeSiteId}
            onClick={handleGenerate}
          >
            {actionLoading === 'generate' ? 'Generating...' : 'Generate IndexNow Key'}
          </button>
        </Card>
      )}

      {/* Key generated — show hosting instructions */}
      {hasKey && !verified && (
        <>
          <Card title="Host the Verification File">
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
              IndexNow requires a verification file hosted at your site root. Once it's in place, click <strong>Verify</strong> below. The file URL must return HTTP 200 and its body must contain exactly the key text.
            </p>

            <CopyBlock label="File name" value={keyFileName!} />
            <CopyBlock label="File contents (the key itself)" value={keyInfo.key} />
            <CopyBlock label="Final URL (this must return 200 when visited)" value={keyInfo.keyLocation} />

            <div style={{ marginTop: 16, padding: '12px 14px', background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, fontSize: 12, color: '#0C4A60', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Three ways to host the file on <code>{host}</code>:</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 6 }}>
                  <strong>Rank Math — Instant Indexing module:</strong> In WP admin → Rank Math → Modules → enable <em>Instant Indexing</em>. Then Rank Math → Instant Indexing → Settings → paste <code>{keyInfo.key}</code> into the API key field and save. Rank Math will auto-host the file.
                </li>
                <li style={{ marginBottom: 6 }}>
                  <strong>Yoast SEO (Premium):</strong> WP admin → Yoast → Tools → IndexNow → paste the key. Yoast auto-hosts.
                </li>
                <li>
                  <strong>Direct upload via Hostinger File Manager / FTP:</strong> Create a plain-text file named <code>{keyFileName}</code> containing just the key on one line, and upload it to <code>public_html/</code> (or whichever is the web root for your WP install).
                </li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="abtn abtn-sky" onClick={handleVerify} disabled={actionLoading === 'verify' || !activeSiteId}>
                {actionLoading === 'verify' ? 'Verifying...' : 'Verify Hosting'}
              </button>
              <button className="abtn" onClick={() => window.open(keyInfo.keyLocation, '_blank')}>
                Open Key URL
              </button>
              <button className="abtn" onClick={handleGenerate} disabled={actionLoading === 'generate' || !activeSiteId}>
                Regenerate Key
              </button>
              <button className="abtn" style={{ color: '#D85A30' }} onClick={handleDelete} disabled={actionLoading === 'delete' || !activeSiteId}>
                Delete Key
              </button>
            </div>

            {verifyResult && (
              <div style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.6,
                background: verifyResult.verified ? 'rgba(29,158,117,0.08)' : '#FEF2F2',
                borderLeft: `3px solid ${verifyResult.verified ? '#1D9E75' : '#D85A30'}`,
                color: '#5A7A8A',
              }}>
                {verifyResult.verified ? (
                  <><strong style={{ color: '#1D9E75' }}>Verified.</strong> IndexNow submissions will now work for this site.</>
                ) : (
                  <><strong style={{ color: '#D85A30' }}>Not verified.</strong> {verifyResult.error}</>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Key verified — show active config + management actions */}
      {hasKey && verified && (
        <InfoCard title="IndexNow is active">
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
            Key verified. When you use <strong>Request re-indexing</strong> on the Search & Indexing page, the URL is also submitted to Bing, Yandex, Seznam, and Naver via IndexNow.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: '#5A7A8A' }}>
            Key: <code>{keyInfo.key}</code> · Hosted at: <a href={keyInfo.keyLocation} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)' }}>{keyInfo.keyLocation}</a>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="abtn" onClick={handleVerify} disabled={actionLoading === 'verify'}>
              {actionLoading === 'verify' ? 'Re-checking...' : 'Re-check Hosting'}
            </button>
            <button className="abtn" onClick={handleGenerate} disabled={actionLoading === 'generate'}>
              Regenerate Key
            </button>
            <button className="abtn" style={{ color: '#D85A30' }} onClick={handleDelete} disabled={actionLoading === 'delete'}>
              Delete Key
            </button>
          </div>
        </InfoCard>
      )}

      {/* Recent submissions */}
      <Card title="Recent Submissions">
        {submissions.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr><th>URL</th><th>Status</th><th>HTTP</th><th>When</th></tr>
            </thead>
            <tbody>
              {submissions.map((s: any) => (
                <tr key={s.submissionId}>
                  <td style={{ wordBreak: 'break-all' }}>{s.url}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td>{s.responseCode ?? '--'}</td>
                  <td>{formatDateTime(s.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No submissions yet. Use <strong>Request re-indexing</strong> on the Search & Indexing page to trigger your first submission.
          </div>
        )}
      </Card>

      <ConsultingUpsell
        headline="Faster indexing means your content ranks sooner."
        subtext="IndexNow integration included with ARION."
        serviceType="SEO Strategy"
        triggerPage="search-bing-indexnow"
      />
    </>
  );
}
