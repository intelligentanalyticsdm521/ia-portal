/**
 * SEO — AI Prompts (productization 2026-06-17, rewritten 2026-06-17 PM
 * after deep research confirmed real SE Ranking AIRT endpoint paths;
 * engine model updated 2026-08-21 with the pricing rework).
 *
 * Manages the LLM queries SE Ranking tracks for brand mention / citation
 * analytics. SEO add-on only. Per the AI engine model AGREED 2026-08-21
 * (PRICING_REWORK_DECISIONS_2026-08-21 §"AI engine model"):
 *   - Starter / Essentials: not available
 *   - Growth:    5 prompts × (Google AI Overviews + Google AI Mode)
 *   - Authority: the same 5 prompts × (AI Overviews + AI Mode + ChatGPT + Gemini)
 *   - Perplexity: consulting-only, never in self-serve projects
 * Prompts count per prompt × engine on the SE Ranking side, so the cap is
 * PER ENGINE (5) and the same questions are mirrored onto every engine the
 * tier includes — engines are the upsell, not prompt count.
 *
 * SE Ranking's AIRT workflow has three layers:
 *   1. Set the project brand (one-time).
 *   2. Enable AI engines (one llm_id per provider × region).
 *   3. Add prompts under each llm_id.
 *
 * This page surfaces all three:
 *   - If no engines enabled: shows a "Set up AI Search" button that does
 *     brand + tier-allowed engines in one shot via POST /seo/ai-prompts/setup.
 *   - Once enabled: per-engine prompt management (one card per engine, in
 *     canonical order). Add prompt picks an engine; the cap applies per
 *     engine. arion-api remains the authority — any cap/engine rejection it
 *     returns is shown verbatim.
 *   - If the tier allows engines that aren't enabled yet (e.g. after a
 *     Growth → Authority upgrade), offers to enable the missing ones.
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
import type { SeoAIPromptsResponse, SeoAIPromptsByEngine } from '../../../lib/arionApi';
import { SEO_ADDON_REQUIRED } from '../../../lib/arionApi';

// Internal engine keys (what arion-api accepts) and SE Ranking AIRT base
// names (what it returns) both resolve here.
const ENGINE_LABELS: Record<string, string> = {
  ai_overview: 'Google AI Overviews',
  google_ai_overview: 'Google AI Overviews',
  ai_mode: 'Google AI Mode',
  google_ai_mode: 'Google AI Mode',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

const ENGINE_COLORS: Record<string, string> = {
  ai_overview: '#4285F4',
  google_ai_overview: '#4285F4',
  ai_mode: '#F4B400',
  google_ai_mode: '#F4B400',
  chatgpt: '#10A37F',
  gemini: '#1A73E8',
  perplexity: '#20808D',
};

/** Canonical display order — matches the tier ladder (Growth pair first). */
const ENGINE_ORDER = ['ai_overview', 'ai_mode', 'chatgpt', 'gemini', 'perplexity'];

function baseNameToKey(baseName: string): string {
  if (baseName === 'google_ai_mode') return 'ai_mode';
  if (baseName === 'google_ai_overview') return 'ai_overview';
  return baseName;
}

function engineRank(key: string): number {
  const i = ENGINE_ORDER.indexOf(key);
  return i === -1 ? ENGINE_ORDER.length : i;
}

function engineList(keys: string[]): string {
  return keys.map((e) => ENGINE_LABELS[e] || e).join(' + ');
}

export function SeoAIPrompts() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [refreshKey, setRefreshKey] = React.useState(0);

  const { data, loading, errorCode } = useArionData(
    () => (activeSiteId ? arionApi.getAIPrompts(activeSiteId) : Promise.resolve(null)),
    [activeSiteId, refreshKey]
  );

  const [newPrompt, setNewPrompt] = React.useState('');
  const [newPromptEngine, setNewPromptEngine] = React.useState<string>('');
  const [addLoading, setAddLoading] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [removeLoadingId, setRemoveLoadingId] = React.useState<number | null>(null);

  const [setupLoading, setSetupLoading] = React.useState(false);
  const [setupError, setSetupError] = React.useState<string | null>(null);

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const r = data as SeoAIPromptsResponse | null;
  const hasSeoAddon = selectedSite?.seoAddonTier != null && errorCode !== SEO_ADDON_REQUIRED;
  const tier = (r?.tier || selectedSite?.seoAddonTier || '').toLowerCase();
  const cap = r?.cap || 0; // prompts per engine
  const allowedEngines = r?.allowed_engines || [];
  const enabledEngines = r?.engines || [];
  const byEngine: SeoAIPromptsByEngine[] = [...(r?.data || [])]
    .map((e) => ({ ...e, prompts: Array.isArray(e.prompts) ? e.prompts : [] }))
    .sort((a, b) => engineRank(baseNameToKey(a.engine_base_name)) - engineRank(baseNameToKey(b.engine_base_name)));
  const totalPrompts = r?.total_prompts ?? byEngine.reduce((acc, e) => acc + e.prompts.length, 0);

  if (!hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track your brand's visibility across AI search (Google AI Overviews + AI Mode on Growth; ChatGPT + Gemini added on Authority)."
        price="$99.99"
        planName="Growth"
      />
    );
  }

  if (cap === 0) {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>AI Search Prompts</h2>
        <p style={{ color: '#5e6473', margin: 0 }}>
          AI prompt tracking is available at <strong>Growth</strong> (5 prompts × Google AI Overviews + AI Mode) and{' '}
          <strong>Authority</strong> (the same 5 prompts × AI Overviews + AI Mode + ChatGPT + Gemini).
          Your current tier ({tier || 'none'}) does not include this feature.
        </p>
        <AddonUpsell
          title="Upgrade for AI search tracking"
          description="See which prompts your brand appears in across Google AI Overviews, AI Mode, ChatGPT and Gemini, and how you compare to competitors."
          price="$99.99"
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

  // No AI engines enabled yet — show one-shot Setup CTA.
  const needsSetup = enabledEngines.length === 0;
  // Tier allows engines that aren't enabled (tier upgraded after setup) —
  // the same setup call enables whatever is missing and skips the rest.
  const enabledKeys = new Set(enabledEngines.map((e) => baseNameToKey(e.base_name)));
  const missingEngines = allowedEngines.filter((e) => !enabledKeys.has(e));

  // Per-engine counts drive the cap (5 per engine, mirrored across engines).
  const promptsOn = (engineKey: string): number =>
    byEngine.find((e) => baseNameToKey(e.engine_base_name) === engineKey)?.prompts.length ?? 0;
  const selectedEngineFull = !!newPromptEngine && promptsOn(newPromptEngine) >= cap;
  const canAdd = !!newPrompt.trim() && !!newPromptEngine && !addLoading && !selectedEngineFull;

  async function handleSetup() {
    if (!activeSiteId) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      await arionApi.setupAIPrompts(activeSiteId);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSetupError(msg);
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleAdd() {
    if (!activeSiteId || !newPrompt.trim() || !newPromptEngine) return;
    if (promptsOn(newPromptEngine) >= cap) {
      setAddError(`${ENGINE_LABELS[newPromptEngine] || newPromptEngine} already tracks ${cap} prompts. Remove one first.`);
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      await arionApi.addAIPrompt(activeSiteId, newPrompt.trim(), newPromptEngine);
      setNewPrompt('');
      setNewPromptEngine('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg);
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(k2siteLlmId: number, llmId: number) {
    if (!activeSiteId) return;
    setRemoveLoadingId(k2siteLlmId);
    try {
      await arionApi.removeAIPrompt(activeSiteId, k2siteLlmId, llmId);
      setRefreshKey((k) => k + 1);
    } catch {
      // best effort
    } finally {
      setRemoveLoadingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <InfoCard title="AI Search Prompts">
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
          <span><strong>Site:</strong> {selectedSite?.primaryDomain || '—'}</span>
          <span><strong>Tier:</strong> {tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
          <span><strong>Brand:</strong> {r.brand || <em style={{ color: '#9ca3af' }}>not set</em>}</span>
          <span><strong>Prompts:</strong> {totalPrompts} tracked · {cap} per engine</span>
          <span><strong>Engines:</strong> {enabledEngines.length} enabled / {allowedEngines.length} included ({engineList(allowedEngines) || '—'})</span>
        </div>
      </InfoCard>

      {needsSetup ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Set up AI Search tracking</h2>
          <p style={{ color: '#5e6473', fontSize: '0.875rem' }}>
            Before adding prompts, we need to set your brand and enable the AI search engines your tier
            includes. This is a one-time step.
          </p>
          <p style={{ fontSize: '0.875rem' }}>
            <strong>Brand:</strong> {selectedSite?.primaryDomain || 'Brand'}{' '}
            <span style={{ color: '#6b7280' }}>(taken from your site profile — set in Business Profile if needed)</span>
          </p>
          <p style={{ fontSize: '0.875rem' }}>
            <strong>Engines to enable:</strong> {engineList(allowedEngines) || '—'}
          </p>
          <button
            onClick={handleSetup}
            disabled={setupLoading}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#1A7DB5',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: setupLoading ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            {setupLoading ? 'Setting up…' : 'Set up AI Search'}
          </button>
          {setupError && <ErrorBanner message={setupError} />}
        </Card>
      ) : (
        <>
          {missingEngines.length > 0 && (
            <Card>
              <h2 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.05rem' }}>
                Your tier includes engines that aren't tracking yet
              </h2>
              <p style={{ color: '#5e6473', fontSize: '0.875rem', marginTop: 0 }}>
                {engineList(missingEngines)} {missingEngines.length === 1 ? 'is' : 'are'} included with your{' '}
                {tier.charAt(0).toUpperCase() + tier.slice(1)} tier but not enabled on this project yet. Enable
                {missingEngines.length === 1 ? ' it' : ' them'}, then mirror your prompts onto {missingEngines.length === 1 ? 'it' : 'each one'}.
              </p>
              <button
                onClick={handleSetup}
                disabled={setupLoading}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#1A7DB5',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: setupLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {setupLoading ? 'Enabling…' : `Enable ${engineList(missingEngines)}`}
              </button>
              {setupError && <ErrorBanner message={setupError} />}
            </Card>
          )}

          {/* Add prompt panel */}
          <Card>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Add a Prompt</h2>
            <p style={{ color: '#5e6473', fontSize: '0.875rem', marginTop: 0 }}>
              Enter a natural-language query the way someone would ask an AI assistant, then pick which
              engine should track it. SE Ranking sends this prompt to the engine daily and records when
              your brand or competitors are mentioned. Each engine tracks up to {cap} prompts — use the same
              {' '}{cap} questions on every engine so results compare like for like.
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

            <p style={{ marginTop: '0.75rem', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Track on which engine?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[...enabledEngines]
                .sort((a, b) => engineRank(baseNameToKey(a.base_name)) - engineRank(baseNameToKey(b.base_name)))
                .map((eng) => {
                  const key = baseNameToKey(eng.base_name);
                  const selected = newPromptEngine === key;
                  const used = promptsOn(key);
                  return (
                    <button
                      key={eng.llm_id}
                      onClick={() => setNewPromptEngine(selected ? '' : key)}
                      title={`${used} / ${cap} prompts`}
                      style={{
                        padding: '0.375rem 0.75rem',
                        background: selected ? ENGINE_COLORS[key] || '#1A7DB5' : '#f3f4f6',
                        color: selected ? 'white' : '#374151',
                        border: `1px solid ${selected ? ENGINE_COLORS[key] || '#1A7DB5' : '#d1d5db'}`,
                        borderRadius: 9999,
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                      }}
                    >
                      {selected ? '✓ ' : ''}
                      {ENGINE_LABELS[eng.base_name] || eng.base_name}
                      <span style={{ marginLeft: 6, opacity: 0.75, fontSize: '0.75rem' }}>{used}/{cap}</span>
                    </button>
                  );
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                {!newPromptEngine
                  ? 'Pick an engine to see remaining slots'
                  : selectedEngineFull
                    ? `Cap reached on ${ENGINE_LABELS[newPromptEngine] || newPromptEngine} — remove a prompt to add more`
                    : `${cap - promptsOn(newPromptEngine)} slot${cap - promptsOn(newPromptEngine) === 1 ? '' : 's'} remaining on ${ENGINE_LABELS[newPromptEngine] || newPromptEngine}`}
              </span>
              <button
                onClick={handleAdd}
                disabled={!canAdd}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#1A7DB5',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: !canAdd ? 'not-allowed' : 'pointer',
                  opacity: !canAdd ? 0.6 : 1,
                }}
              >
                {addLoading ? 'Adding…' : 'Add Prompt'}
              </button>
            </div>

            {addError && <ErrorBanner message={addError} />}
          </Card>

          {/* Per-engine prompt lists — one card per enabled engine, canonical order */}
          {byEngine.map((eng) => {
            const key = baseNameToKey(eng.engine_base_name);
            return (
              <Card key={eng.llm_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.125rem 0.625rem',
                      background: (ENGINE_COLORS[key] || '#1A7DB5') + '22',
                      color: ENGINE_COLORS[key] || '#1A7DB5',
                      borderRadius: 9999,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginRight: '0.5rem',
                    }}>
                      {ENGINE_LABELS[eng.engine_base_name] || ENGINE_LABELS[key] || eng.engine_base_name}
                    </span>
                    {eng.prompts.length} / {cap} prompt{cap === 1 ? '' : 's'}
                  </h2>
                </div>
                {eng.prompts.length === 0 ? (
                  <EmptyPanel message="No prompts on this engine yet." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {eng.prompts.map((p) => (
                      <div
                        key={p.k2site_llm_id}
                        style={{
                          padding: '0.625rem 0.875rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: 6,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ flex: 1, fontSize: '0.9375rem' }}>
                          {p.keyword}
                          {p.search_volume != null && p.search_volume > 0 && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                              ~{p.search_volume.toLocaleString()}/mo
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemove(p.k2site_llm_id, eng.llm_id)}
                          disabled={removeLoadingId === p.k2site_llm_id}
                          style={{
                            padding: '0.25rem 0.625rem',
                            background: 'transparent',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: 6,
                            cursor: removeLoadingId === p.k2site_llm_id ? 'not-allowed' : 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          {removeLoadingId === p.k2site_llm_id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

export default SeoAIPrompts;
