/**
 * Market Monitor Watchlist Manager — modal component.
 *
 * Flow:
 *   1. Opens on "Manage Watchlist" → fetches current watchlist + suggestions
 *      in parallel.
 *   2. Three tabs:
 *        - "Your Pages"      (own_site, up to 10)
 *        - "Competitors"     (pool up to 20 across all competitors)
 *        - "Suggested" — checklist of proposed pages, one-click apply
 *   3. Live usage counters at the top ("7 of 10 own · 12 of 20 competitor").
 *   4. Save button posts the full list. On LIMIT_EXCEEDED error from the
 *      backend we render the ConsultingUpsell escalation inline.
 *
 * The escalation rule (set with user on 2026-04-18): no feature-expansion
 * add-ons. Over-limit → push to IA Consulting → Enterprise inquiry. The
 * component never offers "upgrade for more pages" because that SKU doesn't
 * exist on purpose.
 */
import React from 'react';
import { useArionContext } from '../../useArionContext';
import { ConsultingUpsell } from '../../components/Ui';
import type {
  MmWatchlistResponse,
  MmSuggestionsResponse,
  MmWatchRow,
  MmSavePageInput,
  MmSuggestion,
} from '../../../lib/arionApi';

type TabKey = 'own' | 'competitor' | 'suggestions';

interface DraftRow {
  key: string;            // stable key for React (pageUrl)
  pageUrl: string;
  pageType: 'own_site' | 'competitor';
  competitorDomain: string | null;
  source: 'existing' | 'added' | 'suggested';
}

export function MarketMonitorWatchlistModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeSiteId, arionApi } = useArionContext();
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TabKey>('own');
  const [draft, setDraft] = React.useState<DraftRow[]>([]);
  const [suggestions, setSuggestions] = React.useState<MmSuggestionsResponse | null>(null);
  const [limits, setLimits] = React.useState({ own: 10, competitorPool: 20 });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [overLimit, setOverLimit] = React.useState(false);
  const [addUrl, setAddUrl] = React.useState('');
  const [addCompetitor, setAddCompetitor] = React.useState('');

  React.useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    (async () => {
      try {
        const [w, s] = await Promise.all([
          arionApi.getMmWatchlist(activeSiteId),
          arionApi.getMmSuggestions(activeSiteId),
        ]);
        if (cancelled) return;
        const wl = w as MmWatchlistResponse;
        const existing: DraftRow[] = [
          ...wl.ownPages.map((p: MmWatchRow) => ({ key: p.pageUrl, pageUrl: p.pageUrl, pageType: p.pageType, competitorDomain: p.competitorDomain, source: 'existing' as const })),
          ...wl.competitorPages.map((p: MmWatchRow) => ({ key: p.pageUrl, pageUrl: p.pageUrl, pageType: p.pageType, competitorDomain: p.competitorDomain, source: 'existing' as const })),
        ];
        setDraft(existing);
        setSuggestions(s as MmSuggestionsResponse);
        setLimits(wl.usage.limits);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  const ownCount = draft.filter((d) => d.pageType === 'own_site').length;
  const compCount = draft.filter((d) => d.pageType === 'competitor').length;
  const ownOver = ownCount > limits.own;
  const compOver = compCount > limits.competitorPool;

  function toggleDraftRow(row: DraftRow) {
    setDraft((prev) => {
      const exists = prev.some((p) => p.pageUrl === row.pageUrl);
      if (exists) return prev.filter((p) => p.pageUrl !== row.pageUrl);
      return [...prev, row];
    });
  }

  function addManualRow(pageType: 'own_site' | 'competitor') {
    const url = addUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setSaveError('URL must start with http:// or https://');
      return;
    }
    if (draft.some((d) => d.pageUrl === url)) {
      setSaveError('Already in the watchlist');
      return;
    }
    setSaveError(null);
    setDraft((prev) => [
      ...prev,
      {
        key: url,
        pageUrl: url,
        pageType,
        competitorDomain: pageType === 'competitor' ? (addCompetitor.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') || null) : null,
        source: 'added',
      },
    ]);
    setAddUrl('');
    setAddCompetitor('');
  }

  function removeDraftRow(pageUrl: string) {
    setDraft((prev) => prev.filter((p) => p.pageUrl !== pageUrl));
  }

  async function handleSave() {
    if (!activeSiteId) return;
    setSaving(true);
    setSaveError(null);
    setOverLimit(false);
    try {
      const payload: MmSavePageInput[] = draft.map((d) => ({
        pageUrl: d.pageUrl,
        pageType: d.pageType,
        ...(d.competitorDomain ? { competitorDomain: d.competitorDomain } : {}),
      }));
      await arionApi.saveMmWatchlist(activeSiteId, payload);
      onSaved();
    } catch (err: any) {
      const code = err?.code || err?.details?.code;
      if (code === 'LIMIT_EXCEEDED' || /limit/i.test(err?.message || '')) {
        setOverLimit(true);
        setSaveError(err?.message || 'Watchlist exceeds the Authority-tier limits.');
      } else {
        setSaveError(err?.message || 'Could not save watchlist.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '94vw', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Market Monitor</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>Manage Page Watchlist</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <UsageChip label="Your pages" used={ownCount} limit={limits.own} over={ownOver} />
            <UsageChip label="Competitor pool" used={compCount} limit={limits.competitorPool} over={compOver} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' }}>&times;</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid #eee' }}>
          <TabButton active={activeTab === 'own'} onClick={() => setActiveTab('own')}>Your Pages ({ownCount}/{limits.own})</TabButton>
          <TabButton active={activeTab === 'competitor'} onClick={() => setActiveTab('competitor')}>Competitors ({compCount}/{limits.competitorPool})</TabButton>
          <TabButton active={activeTab === 'suggestions'} onClick={() => setActiveTab('suggestions')}>Suggested</TabButton>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ color: '#5A7A8A', fontSize: 13 }}>Loading…</div>
          ) : activeTab === 'suggestions' ? (
            <SuggestionsTab
              suggestions={suggestions}
              draftUrls={new Set(draft.map((d) => d.pageUrl))}
              onToggle={(s) => toggleDraftRow({
                key: s.pageUrl,
                pageUrl: s.pageUrl,
                pageType: s.pageType,
                competitorDomain: s.competitorDomain ?? null,
                source: 'suggested',
              })}
            />
          ) : (
            <ManualListTab
              pageType={activeTab === 'own' ? 'own_site' : 'competitor'}
              draft={draft}
              onRemove={removeDraftRow}
              addUrl={addUrl}
              setAddUrl={setAddUrl}
              addCompetitor={addCompetitor}
              setAddCompetitor={setAddCompetitor}
              onAdd={() => addManualRow(activeTab === 'own' ? 'own_site' : 'competitor')}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {saveError && !overLimit && (
            <div style={{ fontSize: 12, color: '#D85A30', background: 'rgba(216,90,48,0.08)', padding: '8px 12px', borderRadius: 4 }}>
              {saveError}
            </div>
          )}
          {overLimit && <LimitEscalationBanner />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>
              Changes apply to tomorrow's 05:41 UTC page-change sweep.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} disabled={saving} style={{ padding: '8px 18px', fontSize: 13, background: 'transparent', color: '#5A7A8A', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || ownOver || compOver}
                style={{
                  padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  background: ownOver || compOver ? '#CBD5E1' : '#0B1C24',
                  color: '#fff', border: 'none', borderRadius: 6,
                  cursor: saving || ownOver || compOver ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save watchlist'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageChip({ label, used, limit, over }: { label: string; used: number; limit: number; over: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: over ? '#D85A30' : '#0B1C24' }}>{used} / {limit}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px',
        fontSize: 12,
        fontWeight: 600,
        background: 'transparent',
        color: active ? '#0B1C24' : '#94A3B8',
        border: 'none',
        borderBottom: active ? '2px solid #0B1C24' : '2px solid transparent',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ManualListTab({
  pageType,
  draft,
  onRemove,
  addUrl, setAddUrl,
  addCompetitor, setAddCompetitor,
  onAdd,
}: {
  pageType: 'own_site' | 'competitor';
  draft: DraftRow[];
  onRemove: (url: string) => void;
  addUrl: string; setAddUrl: (s: string) => void;
  addCompetitor: string; setAddCompetitor: (s: string) => void;
  onAdd: () => void;
}) {
  const visible = draft.filter((d) => d.pageType === pageType);
  return (
    <div>
      {/* Add row */}
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Add a page manually</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="https://…"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            style={{ flex: 2, padding: '8px 12px', fontSize: 13, border: '1px solid #CBD5E1', borderRadius: 6 }}
          />
          {pageType === 'competitor' && (
            <input
              type="text"
              placeholder="competitor-domain.com"
              value={addCompetitor}
              onChange={(e) => setAddCompetitor(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #CBD5E1', borderRadius: 6 }}
            />
          )}
          <button onClick={onAdd} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Add</button>
        </div>
      </div>

      {/* Current list */}
      {visible.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#5A7A8A', fontSize: 13 }}>
          No {pageType === 'own_site' ? 'own-site' : 'competitor'} pages watched yet. Add one above or check the Suggested tab.
        </div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Page</th>
              {pageType === 'competitor' && <th style={{ textAlign: 'left', padding: '8px 6px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Competitor</th>}
              <th style={{ textAlign: 'right', padding: '8px 6px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Source</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.pageUrl} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '8px 6px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={d.pageUrl} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB' }}>{d.pageUrl}</a>
                </td>
                {pageType === 'competitor' && (
                  <td style={{ padding: '8px 6px', color: '#5A7A8A' }}>{d.competitorDomain || '—'}</td>
                )}
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
                    background: d.source === 'existing' ? '#F0FDF4' : d.source === 'suggested' ? '#EFF6FF' : '#FEF3C7',
                    color: d.source === 'existing' ? '#1D9E75' : d.source === 'suggested' ? '#2D9CDB' : '#92400E',
                  }}>{d.source}</span>
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                  <button onClick={() => onRemove(d.pageUrl)} style={{ background: 'transparent', border: 'none', color: '#D85A30', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SuggestionsTab({
  suggestions,
  draftUrls,
  onToggle,
}: {
  suggestions: MmSuggestionsResponse | null;
  draftUrls: Set<string>;
  onToggle: (s: MmSuggestion) => void;
}) {
  if (!suggestions) return <div style={{ color: '#5A7A8A', fontSize: 13 }}>Loading suggestions…</div>;
  const own = suggestions.ownPageSuggestions || [];
  const comp = suggestions.competitorSuggestions || [];
  const compByDomain = new Map<string, MmSuggestion[]>();
  for (const s of comp) {
    const d = s.competitorDomain || 'unknown';
    if (!compByDomain.has(d)) compByDomain.set(d, []);
    compByDomain.get(d)!.push(s);
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 16, lineHeight: 1.6 }}>
        Check the boxes for pages you want to watch. Pre-checked items are our recommendations based on your Google Search Console traffic and SE Ranking's competitor data.
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Your pages ({own.length} suggestions)</h3>
      <div style={{ marginBottom: 20 }}>
        {own.map((s) => (
          <SuggestionRow key={s.pageUrl} s={s} checked={draftUrls.has(s.pageUrl)} onToggle={() => onToggle(s)} />
        ))}
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Competitor pages</h3>
      {compByDomain.size === 0 && (
        <div style={{ fontSize: 12, color: '#94A3B8' }}>No competitor suggestions yet — add competitors on the Competitors page first.</div>
      )}
      {Array.from(compByDomain.entries()).map(([domain, list]) => (
        <div key={domain} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5A7A8A', marginBottom: 4 }}>{domain}</div>
          {list.map((s) => (
            <SuggestionRow key={s.pageUrl} s={s} checked={draftUrls.has(s.pageUrl)} onToggle={() => onToggle(s)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SuggestionRow({ s, checked, onToggle }: { s: MmSuggestion; checked: boolean; onToggle: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 6px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#0B1C24', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.pageUrl}</div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{s.reason}</div>
      </div>
      {s.preChecked && (
        <span style={{ fontSize: 9, fontWeight: 600, color: '#1D9E75', background: '#F0FDF4', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>recommended</span>
      )}
    </label>
  );
}

function LimitEscalationBanner() {
  return (
    <div style={{ background: '#FFF7ED', borderLeft: '3px solid #EF6C33', borderRadius: 6, padding: '14px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>
        You're over the Authority-tier watchlist limits
      </div>
      <p style={{ fontSize: 12, color: '#5A7A8A', margin: '0 0 12px', lineHeight: 1.6 }}>
        Monitoring more than 10 own-site pages or 20 competitor pages usually means you have a competitive landscape
        worth professional attention. Rather than sell you a larger bucket, we'd rather point our team at it directly.
      </p>
      <ConsultingUpsell
        headline="Let IA build you a custom monitoring strategy"
        subtext="One of our strategists will scope the watchlist, interpret the diffs you care about, and propose either a consulting engagement or an Enterprise plan tuned to your portfolio."
        serviceType="SEO Strategy"
        triggerPage="seo-market-monitor-watchlist"
      />
    </div>
  );
}
