import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface UsageRow { feature: string; drafts: number; tokens_in: number; tokens_out: number; cost_cents: number; }

const FEATURES = [
  { value: "email_draft", label: "Email draft", systemPrompt: "You are an email marketing expert helping a small business owner write a compelling email. Produce a complete email with subject line + body.", placeholder: "Topic, audience, call-to-action…" },
  { value: "sms_draft", label: "SMS draft", systemPrompt: "Write a concise SMS marketing message (under 160 chars). Direct, no emoji unless requested.", placeholder: "Offer, audience, expiry date…" },
  { value: "subject_lines", label: "Subject lines (5)", systemPrompt: "Generate 5 high-conversion email subject lines. Each on its own line.", placeholder: "Email topic, audience…" },
  { value: "newsletter", label: "Newsletter section", systemPrompt: "Write a newsletter section (intro + 2-3 paragraphs).", placeholder: "Newsletter theme + section topic…" },
  { value: "landing_copy", label: "Landing page copy", systemPrompt: "Write landing page copy: headline, sub-headline, 3 bullets, CTA copy.", placeholder: "Product/offer + target audience…" },
  { value: "social", label: "Social post", systemPrompt: "Write a social media post (3-4 sentences, conversational).", placeholder: "Topic + platform + tone…" },
];

export function SparkAiWriterPage() {
  const { get, post, ready } = useSparkApi();
  const [feature, setFeature] = useState(FEATURES[0]);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<{ content: string; tokens_in: number; tokens_out: number; cost_cents: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await get<{ data: UsageRow[] }>("/api/v1/ai-writer/usage?days=30");
      setUsage(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setOutput(null);
    try {
      const r = await post<{ data: { content: string; tokens_in: number; tokens_out: number; cost_cents: number } }>("/api/v1/ai-writer/draft", {
        feature: feature.value,
        prompt: prompt.trim(),
        system: feature.systemPrompt,
        max_tokens: 1024,
      });
      setOutput(r.data);
      await loadUsage();
    } catch (err) { setError(err); } finally { setGenerating(false); }
  }

  return (
    <OliverPageWrapper title="AI Writer" subtitle="Anthropic-powered marketing copy assistant" error={error} loading={loading}>
      <div className="arion-page">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <div className="card-hdr"><div className="card-ttl">Draft generator</div></div>
            <div className="p-4 space-y-3">
              <label className="text-sm">
                <div className="text-xs text-gray-500 mb-1">Feature</div>
                <select value={feature.value} onChange={e => { const f = FEATURES.find(x => x.value === e.target.value); if (f) setFeature(f); }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  {FEATURES.map(f => (<option key={f.value} value={f.value}>{f.label}</option>))}
                </select>
              </label>
              <label className="text-sm">
                <div className="text-xs text-gray-500 mb-1">Your brief</div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6}
                  placeholder={feature.placeholder}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </label>
              <button onClick={generate} disabled={generating || !prompt.trim()}
                className="px-4 py-2 rounded-md text-sm bg-emerald-600 text-white disabled:opacity-50">
                {generating ? "Generating…" : "Generate draft"}
              </button>

              {output && (
                <div className="mt-3 border border-gray-200 rounded-md p-3 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">
                    {output.tokens_in + output.tokens_out} tokens · ${(output.cost_cents / 100).toFixed(3)}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm">{output.content}</pre>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-ttl">30-day usage</div></div>
            <div className="p-4">
              {usage.length === 0
                ? <div className="text-sm text-gray-500 text-center py-4">No drafts yet</div>
                : (
                  <table className="data-table text-sm">
                    <thead><tr><th>Feature</th><th>Drafts</th><th>Cost</th></tr></thead>
                    <tbody>
                      {usage.map(u => (
                        <tr key={u.feature}>
                          <td className="capitalize text-xs">{u.feature.replace("_", " ")}</td>
                          <td>{u.drafts}</td>
                          <td>${((u.cost_cents || 0) / 100).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold border-t">
                        <td>Total</td>
                        <td>{usage.reduce((a, u) => a + u.drafts, 0)}</td>
                        <td>${(usage.reduce((a, u) => a + (u.cost_cents || 0), 0) / 100).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default SparkAiWriterPage;
