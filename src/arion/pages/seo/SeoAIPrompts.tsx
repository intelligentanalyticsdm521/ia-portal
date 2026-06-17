/**
 * SEO — AI Prompts (productization 2026-06-17)
 *
 * Manage the LLM queries SE Ranking tracks for brand mention / citation
 * analytics. Per the locked SEO tier matrix:
 *   - Starter / Essentials: AI prompts not available
 *   - Growth:               5 prompts × Google AI Mode
 *   - Authority:           10 prompts × (Google AI Mode + ChatGPT + Gemini) = 30 slots
 *
 * Each prompt is sent to its selected engines; SE Ranking checks whether
 * the customer's brand or competitors are mentioned in the response, and
 * records position. View the results on the AI Search Results page.
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
import type { SeoAIPromptsResponse } from '../../../lib/arionApi';

const ENGINE_LABELS: Record<string, string> = {
  ai_mode: 'Google AI Mode',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

const ENGINE_COLORS: Record<string, string> = {
  ai_mode: '#F4B400',
  chatgpt: '#10A37F',
  gemini: '#1A73E8',
  perplexity: '#20808D',
};

export function SeoAIPrompts() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [refreshKey, setRefreshKey] = React.useState(0);

  const { data, loading } = useArionData(
    () => (activeSiteId ? arionApi.getAIPrompts(activeSiteId) : Promise.resolve(null)),
    [activeSiteId, refreshKey]
  );

  const [newPrompt, setNewPrompt] = React.useState('');
  const [newPromptEngines, setNewPromptEngines] = React.useState<string[]>([]);
  const [addLoading, setAddLoading] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [removeLoadingId, setRemoveLoadingId] = React.useState<string | number | null>(null);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const r = data as SeoAIPromptsResponse | null;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;
  const tier = (r?.tier || selectedSite?.seoAddonTier || '').toLowerCase();
  const cap = r?.cap || 0;
  const allowedEngines = r?.allowed_engines || [];
  const prompts = r?.data || [];

  if (!hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track your brand's visibility across AI search engines (Google AI Mode, ChatGPT, Gemini) — available at Growth and Authority tiers."
        price="$99"
        planName="Growth"
      />
    );
  }

  if (cap === 0) {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>AI Search Prompts</h2>
        <p style={{ color: '#5e6473', margin: 0 }}>
          AI prompt tracking is available at <strong>Growth</strong> (5 prompts × Google AI Mode) and{' '}
          <strong>Authority</strong> (10 prompts × Google AI Mode + ChatGPT + Gemini) tiers.
          Your current tier ({tier || 'none'}) does not include this feature.
        </p>
        <AddonUpsell
          title="Upgrade for AI search tracking"
          description="Authority tier unlocks tracking across all three major LLM engines: Google AI Mode, ChatGPT, and Gemini. See which prompts your brand appears in and how you compare to competitors."
          price="$99"
          planName="Growth"
        />
      </Card>
    );
  }

  if (!r?.project_id) {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>AI Search Prompts</h2>
        <EmptyPanel message="No SE Ranking project linked yet. Onboarding hasn't completed or needs to be re-run for this site." />
      </Card>
    );
  }

  async function handleAdd() {
    if (!activeSiteId || !newPrompt.trim()) return;
    if (prompts.length >= cap) {
      setAddError(`AI prompt cap reached (${cap}). Remove an existing prompt first.`);
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const engines = newPromptEngines.length > 0 ? newPromptEngines : allowedEngines;
      await arionApi.addAIPrompt(activeSiteId, newPrompt.trim(), engines);
      setNewPrompt('');
      setNewPromptEngines([]);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg);
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(promptId: string | number) {
    if (!activeSiteId) return;
    setRemoveLoadingId(promptId);
    try {
      await arionApi.removeAIPrompt(activeSiteId, promptId);
      setRefreshKey((k) => k + 1);
    } catch {
      // best effort
    } finally {
      setRemoveLoadingId(null);
    }
  }

  function toggleEngine(engineId: string) {
    setNewPromptEngines((prev) => {
      if (prev.includes(engineId)) return prev.filter((e) => e !== engineId);
      return [...prev, engineId];
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <InfoCard title="AI Search Prompts">
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
          <span><strong>Project:</strong> {String(r.project_id)}</span>
          <span><strong>Tier:</strong> {tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
          <span><strong>Prompts:</strong> {prompts.length} / {cap}</span>
          <span><strong>Engines:</strong> {allowedEngines.map((e) => ENGINE_LABELS[e] || e).join(' · ')}</span>
        </div>
      </InfoCard>

      {/* ───────────── Add new prompt ───────────── */}
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Add a Prompt</h2>
        <p style={{ color: '#5e6473', fontSize: '0.875rem', marginTop: 0 }}>
          Enter a natural-language query the way someone would ask an AI assistant. SE Ranking will
          send this prompt to your selected engines daily and track when your brand or competitors
          are mentioned.
        </p>
        <textarea
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          placeholder='e.g. "What are the best mobile detailing companies in Des Moines, Iowa?"'
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {allowedEngines.map((engineId) => {
            const selected = newPromptEngines.includes(engineId);
            return (
              <button
                key={engineId}
                onClick={() => toggleEngine(engineId)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: selected ? ENGINE_COLORS[engineId] || '#1A7DB5' : '#f3f4f6',
                  color: selected ? 'white' : '#374151',
                  border: `1px solid ${selected ? ENGINE_COLORS[engineId] || '#1A7DB5' : '#d1d5db'}`,
                  borderRadius: 9999,
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                }}
              >
                {selected ? '✓ ' : ''}
                {ENGINE_LABELS[engineId] || engineId}
              </button>
            );
          })}
        </div>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
          {newPromptEngines.length === 0
            ? 'No engines selected — will use all available engines for your tier.'
            : `Tracking on ${newPromptEngines.length} engine${newPromptEngines.length === 1 ? '' : 's'}.`}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <button
            onClick={handleAdd}
            disabled={!newPrompt.trim() || addLoading || prompts.length >= cap}
            style={{
              padding: '0.5rem 1rem',
              background: '#1A7DB5',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: !newPrompt.trim() || addLoading || prompts.length >= cap ? 'not-allowed' : 'pointer',
              opacity: !newPrompt.trim() || addLoading || prompts.length >= cap ? 0.6 : 1,
            }}
          >
            {addLoading ? 'Adding…' : 'Add Prompt'}
          </button>
        </div>

        {addError && <ErrorBanner message={addError} />}
      </Card>

      {/* ───────────── Tracked prompts ───────────── */}
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
          Tracked Prompts ({prompts.length})
        </h2>
        {prompts.length === 0 ? (
          <EmptyPanel message="No AI prompts tracked yet. Add one above." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {prompts.map((p) => (
              <div
                key={p.prompt_id}
                style={{
                  padding: '0.875rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#111827' }}>{p.prompt}</p>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {(p.engines || []).map((engineId) => (
                        <span
                          key={engineId}
                          style={{
                            padding: '0.125rem 0.5rem',
                            background: (ENGINE_COLORS[engineId] || '#1A7DB5') + '22',
                            color: ENGINE_COLORS[engineId] || '#1A7DB5',
                            borderRadius: 9999,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          {ENGINE_LABELS[engineId] || engineId}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(p.prompt_id)}
                    disabled={removeLoadingId === p.prompt_id}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: 'transparent',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      cursor: removeLoadingId === p.prompt_id ? 'not-allowed' : 'pointer',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {removeLoadingId === p.prompt_id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default SeoAIPrompts;
