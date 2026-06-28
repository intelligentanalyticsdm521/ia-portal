/**
 * SEO — Keywords (productization 2026-06-17)
 *
 * One page that does three jobs for the tenant:
 *   1. View the keywords currently tracked in their SE Ranking project
 *   2. Run keyword research from a seed (suggestions / related / longtail /
 *      questions, each with volume + difficulty)
 *   3. Add or remove tracked keywords (tier-cap enforced)
 *
 * Tier cap (from arion-api): Starter 10 · Essentials 25 · Growth 60 · Authority 150.
 * Research rate-limited per tenant per day (20/50/200 by SEO tier).
 */
import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import {
  Card,
  AddonUpsell,
  EmptyPanel,
  Loading,
  InfoCard,
  ErrorBanner,
} from '../../components/Ui';
import type {
  SeoTrackedKeywordsResponse,
  SeoKeywordResearchResponse,
  SeoKeywordResearchRow,
} from '../../../lib/arionApi';

type Tab = 'suggestions' | 'related' | 'longtail' | 'questions';

export function SeoKeywords() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [refreshKey, setRefreshKey] = React.useState(0);

  // ── Tracked keywords (current SE Ranking project) ────────────────
  const { data: trackedData, loading: loadingTracked } = useArionData(
    () => (activeSiteId ? arionApi.getTrackedKeywords(activeSiteId) : Promise.resolve(null)),
    [activeSiteId, refreshKey]
  );

  // ── Research panel state ───────────────────────────────────────────
  const [seed, setSeed] = React.useState('');
  const [research, setResearch] = React.useState<SeoKeywordResearchResponse | null>(null);
  const [researchLoading, setResearchLoading] = React.useState(false);
  const [researchError, setResearchError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>('suggestions');

  // ── Selection state for "Add selected to tracking" ─────────────────
  const [selectedToAdd, setSelectedToAdd] = React.useState<Set<string>>(new Set());
  const [addingLoading, setAddingLoading] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addSuccess, setAddSuccess] = React.useState<string | null>(null);

  // ── Paste-many state ──────────────────────────────────────────────
  const [pasteText, setPasteText] = React.useState('');
  const [pasteLoading, setPasteLoading] = React.useState(false);
  const [pasteError, setPasteError] = React.useState<string | null>(null);
  const [pasteSuccess, setPasteSuccess] = React.useState<string | null>(null);

  // ── Remove selection state ─────────────────────────────────────────
  // SE Ranking returns keyword ids as strings; we keep the set as strings
  // and only convert to number when calling the API.
  const [selectedToRemove, setSelectedToRemove] = React.useState<Set<string>>(new Set());
  const [removeLoading, setRemoveLoading] = React.useState(false);

  if (loadingTracked) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const tracked = trackedData as SeoTrackedKeywordsResponse | null;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const tier = (tracked?.tier || selectedSite?.seoAddonTier || '').toLowerCase();
  const TIER_CAPS: Record<string, number> = { starter: 10, essentials: 25, growth: 60, authority: 150 };
  const cap = TIER_CAPS[tier] || 0;
  const existingKeywords = tracked?.data || [];
  const remaining = Math.max(cap - existingKeywords.length, 0);

  if (!hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track keyword positions across Google, Bing, and AI search engines. Run keyword research powered by SE Ranking."
        price="$29"
        planName="Starter"
      />
    );
  }

  if (!tracked?.project_id) {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>Keywords</h2>
        <EmptyPanel message="No SE Ranking project linked yet. Onboarding hasn't completed or needs to be re-run for this site." />
      </Card>
    );
  }

  async function runResearch() {
    if (!seed.trim() || !activeSiteId) return;
    setResearchLoading(true);
    setResearchError(null);
    setSelectedToAdd(new Set());
    setAddSuccess(null);
    setAddError(null);
    try {
      const res = await arionApi.researchKeyword(activeSiteId, seed.trim(), { region: 'us', limit: 25 });
      setResearch(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResearchError(msg);
      setResearch(null);
    } finally {
      setResearchLoading(false);
    }
  }

  async function addSelectedKeywords() {
    if (!activeSiteId || selectedToAdd.size === 0) return;
    if (existingKeywords.length + selectedToAdd.size > cap) {
      setAddError(`Adding ${selectedToAdd.size} would exceed your ${tier} cap of ${cap} keywords (currently ${existingKeywords.length}).`);
      return;
    }
    setAddingLoading(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const keywords = Array.from(selectedToAdd);
      await arionApi.addTrackedKeywords(activeSiteId, keywords);
      setAddSuccess(`Added ${keywords.length} keyword${keywords.length === 1 ? '' : 's'} to tracking.`);
      setSelectedToAdd(new Set());
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg);
    } finally {
      setAddingLoading(false);
    }
  }

  async function removeSelected() {
    if (!activeSiteId || selectedToRemove.size === 0) return;
    setRemoveLoading(true);
    try {
      await arionApi.removeTrackedKeywords(
        activeSiteId,
        Array.from(selectedToRemove).map((s) => Number(s))
      );
      setSelectedToRemove(new Set());
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg);
    } finally {
      setRemoveLoading(false);
    }
  }

  // Parse pasted text into a clean keyword list. Supports newline AND
  // comma delimited input. Strips empties, dedupes against existing
  // tracked keywords (case-insensitive), trims whitespace.
  function parsePastedKeywords(raw: string): string[] {
    const lines = raw
      .split(/[\n,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 2 && s.length <= 80);
    // Dedupe within the input
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const kw of lines) {
      if (!seen.has(kw)) {
        seen.add(kw);
        unique.push(kw);
      }
    }
    // Dedupe vs existing tracked
    const existingSet = new Set(existingKeywords.map((k) => String(k.name || '').toLowerCase()));
    return unique.filter((kw) => !existingSet.has(kw));
  }

  async function addPastedKeywords() {
    if (!activeSiteId || !pasteText.trim()) return;
    const candidates = parsePastedKeywords(pasteText);
    if (candidates.length === 0) {
      setPasteError('No new keywords found in the pasted text (or all are already tracked).');
      return;
    }
    if (existingKeywords.length + candidates.length > cap) {
      setPasteError(`Adding ${candidates.length} would exceed your ${tier} cap of ${cap} keywords (currently ${existingKeywords.length}).`);
      return;
    }
    setPasteLoading(true);
    setPasteError(null);
    setPasteSuccess(null);
    try {
      await arionApi.addTrackedKeywords(activeSiteId, candidates);
      setPasteSuccess(`Added ${candidates.length} keyword${candidates.length === 1 ? '' : 's'} to tracking.`);
      setPasteText('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPasteError(msg);
    } finally {
      setPasteLoading(false);
    }
  }

  function toggleResearchSelection(keyword: string) {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  function toggleTrackedSelection(keywordId: string | number) {
    const id = String(keywordId);
    setSelectedToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const researchData = research?.data;
  const meta = research?.meta;
  const activeRows: SeoKeywordResearchRow[] = researchData
    ? (researchData[activeTab] as SeoKeywordResearchRow[])
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <InfoCard title="Keywords">
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
          <span><strong>Site:</strong> {selectedSite?.primaryDomain || '—'}</span>
          <span><strong>Tier:</strong> {tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '—'}</span>
          <span><strong>Tracked:</strong> {existingKeywords.length} / {cap}</span>
          <span><strong>Slots remaining:</strong> {remaining}</span>
        </div>
      </InfoCard>

      {/* ───────────── Keyword Research Panel ───────────── */}
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Keyword Research</h2>
        <p style={{ color: '#5e6473', fontSize: '0.875rem', marginTop: 0 }}>
          Enter a seed keyword to get suggestions, related queries, long-tail variants, and question
          searches — each with monthly volume, difficulty, and CPC. Powered by ARGUS AI / SE Ranking.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runResearch();
            }}
            placeholder='e.g. "mobile detailing des moines"'
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.95rem',
            }}
          />
          <button
            onClick={runResearch}
            disabled={!seed.trim() || researchLoading}
            style={{
              padding: '0.5rem 1rem',
              background: '#1A7DB5',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: !seed.trim() || researchLoading ? 'not-allowed' : 'pointer',
              opacity: !seed.trim() || researchLoading ? 0.6 : 1,
            }}
          >
            {researchLoading ? 'Researching…' : 'Research'}
          </button>
        </div>

        {researchError && <ErrorBanner message={researchError} />}

        {meta && (
          <div style={{ marginTop: '0.5rem', color: '#5e6473', fontSize: '0.8125rem' }}>
            Daily research budget: <strong>{meta.used}</strong> of <strong>{meta.cap}</strong> used ·{' '}
            <strong>{meta.remaining}</strong> remaining (resets at midnight UTC)
          </div>
        )}

        {researchData && (
          <div style={{ marginTop: '1rem' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1px', borderBottom: '1px solid #d1d5db', marginBottom: '0.75rem' }}>
              {(
                [
                  ['suggestions', `Similar (${researchData.suggestions.length})`],
                  ['related', `Related (${researchData.related.length})`],
                  ['longtail', `Long-tail (${researchData.longtail.length})`],
                  ['questions', `Questions (${researchData.questions.length})`],
                ] as Array<[Tab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: activeTab === key ? '#fff' : '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderBottom: activeTab === key ? '1px solid #fff' : '1px solid #d1d5db',
                    marginBottom: -1,
                    cursor: 'pointer',
                    fontWeight: activeTab === key ? 600 : 400,
                    fontSize: '0.875rem',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Overview card for the seed */}
            {researchData.overview && (
              <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: 6, marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                <strong>{researchData.overview.keyword}</strong> · Volume:{' '}
                <strong>{researchData.overview.volume.toLocaleString()}</strong> · Difficulty:{' '}
                <strong>{researchData.overview.difficulty}</strong> · CPC: <strong>${researchData.overview.cpc.toFixed(2)}</strong>
              </div>
            )}

            {/* Results table */}
            {activeRows.length === 0 ? (
              <EmptyPanel message={`No ${activeTab} results for "${researchData.seed}".`} />
            ) : (
              <div style={{ maxHeight: 500, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                    <tr>
                      <th style={th}> </th>
                      <th style={{ ...th, textAlign: 'left' }}>Keyword</th>
                      <th style={th}>Volume / mo</th>
                      <th style={th}>Difficulty</th>
                      <th style={th}>CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row, idx) => {
                      const alreadyTracked = existingKeywords.some((k) => String(k.name || '').toLowerCase() === row.keyword.toLowerCase());
                      const checked = selectedToAdd.has(row.keyword);
                      return (
                        <tr
                          key={`${row.keyword}-${idx}`}
                          style={{
                            borderTop: '1px solid #e5e7eb',
                            background: alreadyTracked ? '#f0fdf4' : undefined,
                          }}
                        >
                          <td style={{ ...td, textAlign: 'center' }}>
                            {alreadyTracked ? (
                              <span style={{ color: '#16a34a', fontSize: '0.75rem' }}>Tracked</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleResearchSelection(row.keyword)}
                              />
                            )}
                          </td>
                          <td style={td}>{row.keyword}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{row.volume.toLocaleString()}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{row.difficulty}</td>
                          <td style={{ ...td, textAlign: 'right' }}>${row.cpc.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Action footer */}
            {selectedToAdd.size > 0 && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: '#f0f9ff',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.875rem' }}>
                  <strong>{selectedToAdd.size}</strong> selected · adding will leave{' '}
                  <strong>{Math.max(remaining - selectedToAdd.size, 0)}</strong> slots open
                </span>
                <button
                  onClick={addSelectedKeywords}
                  disabled={addingLoading || selectedToAdd.size === 0}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: addingLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addingLoading ? 'Adding…' : `Add ${selectedToAdd.size} to tracking`}
                </button>
              </div>
            )}
            {addError && <ErrorBanner message={addError} />}
            {addSuccess && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: '0.875rem' }}>
                {addSuccess}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ───────────── Paste-many Add Panel ───────────── */}
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Add Keywords Directly</h2>
        <p style={{ color: '#5e6473', fontSize: '0.875rem', marginTop: 0 }}>
          Paste keywords below — one per line, OR comma-separated. Duplicates and already-tracked
          keywords are filtered automatically.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'mobile detailing des moines\nauto detailing near me\nceramic coating, paint correction, interior cleaning'}
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            {pasteText.trim()
              ? `${parsePastedKeywords(pasteText).length} new candidate${parsePastedKeywords(pasteText).length === 1 ? '' : 's'} parsed`
              : `${remaining} slot${remaining === 1 ? '' : 's'} remaining`}
          </span>
          <button
            onClick={addPastedKeywords}
            disabled={!pasteText.trim() || pasteLoading || remaining === 0}
            style={{
              padding: '0.5rem 1rem',
              background: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: !pasteText.trim() || pasteLoading || remaining === 0 ? 'not-allowed' : 'pointer',
              opacity: !pasteText.trim() || pasteLoading || remaining === 0 ? 0.6 : 1,
            }}
          >
            {pasteLoading ? 'Adding…' : 'Add to tracking'}
          </button>
        </div>
        {pasteError && <ErrorBanner message={pasteError} />}
        {pasteSuccess && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: '0.875rem' }}>
            {pasteSuccess}
          </div>
        )}
      </Card>

      {/* ───────────── Tracked Keywords List ───────────── */}
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
          Tracked Keywords ({existingKeywords.length})
        </h2>
        <p style={{ color: '#5e6473', fontSize: '0.875rem', marginTop: 0 }}>
          Currently tracked in your SE Ranking project. Select rows to remove.
        </p>
        {existingKeywords.length === 0 ? (
          <EmptyPanel message="No keywords tracked yet. Paste some above or run keyword research." />
        ) : (
          <>
            <div style={{ maxHeight: 600, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                  <tr>
                    <th style={th}> </th>
                    <th style={{ ...th, textAlign: 'left' }}>Keyword</th>
                    <th style={th}>First Check</th>
                    <th style={th}>Group</th>
                    <th style={th}>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {existingKeywords.map((k) => (
                    <tr key={String(k.id)} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedToRemove.has(String(k.id))}
                          onChange={() => toggleTrackedSelection(k.id)}
                        />
                      </td>
                      <td style={td}>{k.name || <em style={{ color: '#9ca3af' }}>(unnamed #{String(k.id)})</em>}</td>
                      <td style={{ ...td, textAlign: 'right', color: k.first_check_date ? '#111827' : '#9ca3af' }}>
                        {k.first_check_date || 'pending'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: '#6b7280' }}>{k.group_id ? String(k.group_id) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {Array.isArray(k.tags) && k.tags.length > 0 ? k.tags.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedToRemove.size > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  onClick={() => setSelectedToRemove(new Set())}
                  style={{ padding: '0.5rem 1rem', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={removeSelected}
                  disabled={removeLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: removeLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {removeLoading ? 'Removing…' : `Remove ${selectedToRemove.size}`}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 600,
  textAlign: 'right',
  fontSize: '0.8125rem',
  color: '#374151',
};

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  color: '#111827',
};

export default SeoKeywords;
