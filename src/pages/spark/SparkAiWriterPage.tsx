// SparkAiWriterPage — write marketing copy, for real.
//
// WHAT WAS HERE UNTIL 2026-09-08
// ─────────────────────────────────────────────────────────────────────────────
// 121 lines of static JSX headed "AI Writer is a v2 feature", listing six things
// it would one day do, each with a credit price printed in the markup, plus a
// panel of made-up pricing rules ("1 credit = $0.10", "Pro tier includes 100
// credits/month", "Top up: $20 = 250 credits") and a line saying the Anthropic key
// was "provisioning pending".
//
// Every part of that was untrue by then. The API had been live and METERED for
// months (LUMEN routes/aiWriter.js: four endpoints, each priced through ARGUS
// against lumen.argus_action_pricing, each writing an audit row). The key is
// configured. And the prices on the page were a hand-typed copy of rows in the
// price list, so changing a price changed what we charged and not what the screen
// said.
//
// THIS PAGE IS THE API. Four things it can do, each one a real call. The prices
// come from GET /ai-writer/pricing, which reads the one price list — an action
// with no priced row shows "no charge yet", which is exactly what the metering
// does with it (callWrapper's `unknown_action` runs the call unmetered rather than
// guessing). No table of credit prices lives in this file.
import { useCallback, useEffect, useMemo, useState } from "react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { useSparkApi } from "../../hooks/useSparkApi";
import {
  Sparkles, Mail, Type, Wand2, Copy as CopyIcon, Check, Coins, AlertTriangle,
} from "lucide-react";

/* ── what the server says each thing costs ────────────────────────────────── */

interface PricedAction {
  key: string;
  label: string;
  action_type: string;
  /** null = no priced row yet, so nothing is charged for it today. */
  credits: number | null;
  priced: boolean;
}
interface Pricing {
  engine: string;
  /** FALSE = nothing is charged for a call at all right now. */
  charging: boolean;
  /** FALSE = no key on this environment, so nothing can be written. */
  configured: boolean;
  actions: PricedAction[];
  balance: { granted: number; used: number; balance: number } | null;
}

/* ── the four things it does ──────────────────────────────────────────────── */

type JobKey = "generate_email" | "subject_lines" | "improve_copy" | "draft";

const JOBS: { key: JobKey; label: string; blurb: string; icon: typeof Mail }[] = [
  { key: "generate_email", label: "Write an email", icon: Mail,
    blurb: "Describe what you want to say. You get a subject, a preheader and a body you can edit." },
  { key: "subject_lines", label: "Five subject lines", icon: Type,
    blurb: "Paste an email body and get five subject lines in different styles." },
  { key: "improve_copy", label: "Improve what I wrote", icon: Wand2,
    blurb: "Paste your own copy and pick how you want it changed." },
  { key: "draft", label: "Write anything else", icon: Sparkles,
    blurb: "A text, a landing-page headline, a social post — say what you need." },
];

const STYLES = [
  { id: "", label: "Better all round" },
  { id: "concise", label: "Shorter" },
  { id: "persuasive", label: "More persuasive" },
  { id: "friendly", label: "Warmer" },
  { id: "professional", label: "More formal" },
];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        // A copy button that silently does nothing in a locked-down browser is a
        // small lie of its own, so the label only changes on success.
        navigator.clipboard?.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 1500); },
          () => { /* nothing to promise */ },
        );
      }}
      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <CopyIcon className="h-3 w-3" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function SparkAiWriterPage() {
  const { get, post, ready } = useSparkApi();

  const [pricing, setPricing] = useState<Pricing | null>(null);
  // A boolean, not the error object: the object is for the console, and JSX must
  // not be asked to render an `unknown`.
  const [pricingUnavailable, setPricingUnavailable] = useState(false);
  const [job, setJob] = useState<JobKey>("generate_email");

  // One field set per job so switching back and forth keeps what was typed.
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [style, setStyle] = useState("");
  const [prompt, setPrompt] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ heading?: string; lines?: string[]; body?: string; credits: number | null } | null>(null);

  const loadPricing = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: Pricing }>("/api/v1/ai-writer/pricing");
      setPricing(r.data);
      setPricingUnavailable(false);
    } catch (err) {
      // Not swallowed: without the price list we do not know what anything costs,
      // and guessing on a screen that spends money is the whole defect this page
      // was rebuilt to remove.
      console.error("[AiWriter] price list unavailable", err);
      setPricingUnavailable(true);
    }
  }, [get, ready]);
  useEffect(() => { loadPricing(); }, [loadPricing]);

  const costOf = useMemo(() => {
    const map = new Map((pricing?.actions || []).map((a) => [a.key, a]));
    return (k: JobKey) => map.get(k) || null;
  }, [pricing]);

  /** The one place a 402 / 503 becomes a sentence. */
  function messageFor(err: unknown): string {
    const e = err as { status?: number; body?: Record<string, unknown>; message?: string };
    const code = String(e?.body?.error || "");
    if (code === "insufficient_credits") {
      return "You are out of credits for this month. Settings → Data plan shows what you have and how to add more.";
    }
    if (code === "ai_writer_not_configured") {
      return "Writing is not switched on for this environment yet, so nothing was sent.";
    }
    return e?.message || "That did not work. Nothing was charged — try again in a moment.";
  }

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      if (job === "generate_email") {
        const r = await post<{ data: { subject?: string; preheader?: string; body_text?: string; credits_charged: number | null } }>(
          "/api/v1/ai-writer/generate-email", { brief, audience, goal });
        const d = r.data;
        setResult({
          heading: d.subject || undefined,
          body: [d.preheader ? `Preview line: ${d.preheader}` : "", d.body_text || ""].filter(Boolean).join("\n\n"),
          credits: d.credits_charged ?? null,
        });
      } else if (job === "subject_lines") {
        const r = await post<{ data: { suggestions: string[]; credits_charged: number | null } }>(
          "/api/v1/ai-writer/suggest-subject", { body_text: bodyText, audience_description: audience, goal });
        setResult({ lines: r.data.suggestions || [], credits: r.data.credits_charged ?? null });
      } else if (job === "improve_copy") {
        const r = await post<{ data: { content: string; credits_charged: number | null } }>(
          "/api/v1/ai-writer/improve-copy", { body_text: bodyText, style: style || undefined });
        setResult({ body: r.data.content, credits: r.data.credits_charged ?? null });
      } else {
        const r = await post<{ data: { content: string; credits_charged: number | null } }>(
          "/api/v1/ai-writer/draft", { feature: "spark_ai_writer", prompt });
        setResult({ body: r.data.content, credits: r.data.credits_charged ?? null });
      }
      // A charged call moves the balance, so re-read it rather than doing
      // arithmetic on a number this page does not own.
      loadPricing();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const canRun = !busy && (
    job === "generate_email" ? brief.trim().length > 3
      : job === "subject_lines" ? bodyText.trim().length > 10
      : job === "improve_copy" ? bodyText.trim().length > 10
      : prompt.trim().length > 3
  );

  const cost = costOf(job);
  const chargeLine = !pricing
    ? null
    : !pricing.charging
      ? "No charge for this yet."
      : cost && cost.priced
        ? `${cost.credits} credit${cost.credits === 1 ? "" : "s"}`
        : "No charge for this yet.";

  return (
    <SparkPageShell
      title="AI Writer"
      subtitle={pricing ? `Powered by ${pricing.engine}` : "Marketing copy, written for you"}
      help="Describe what you want to say and get copy you can edit and paste into a campaign. Everything it writes is a draft — read it before you send it."
      stats={
        pricing?.balance ? (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Coins className="h-3.5 w-3.5 text-emerald-600" />
            <span><strong className="text-slate-900">{pricing.balance.balance}</strong> credits left this month</span>
            <span className="text-slate-400">·</span>
            <span>{pricing.balance.used} used</span>
          </div>
        ) : undefined
      }
    >
      <AiWriterStyles />

      {/* The honest states, in the order somebody hits them. */}
      {pricingUnavailable && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            We could not read what these cost, so the writer is paused rather than
            spending anything on a guess. Try again in a moment.
          </span>
        </div>
      )}
      {pricing && !pricing.configured && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
          <span>Writing is not switched on for this environment yet. Nothing on this page will send.</span>
        </div>
      )}

      {/* Pick a job */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {JOBS.map((j) => {
          const Icon = j.icon;
          const c = costOf(j.key);
          const active = job === j.key;
          return (
            <button
              key={j.key}
              type="button"
              onClick={() => { setJob(j.key); setResult(null); setError(null); }}
              className={`rounded-lg border p-3 text-left transition-colors ${
                active ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${active ? "text-[#EF6C33]" : "text-slate-500"}`} />
                  <span className="text-sm font-semibold text-slate-900">{j.label}</span>
                </div>
                {/* Straight from the price list. Never a number typed in here. */}
                {pricing?.charging && c?.priced && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    <Coins className="h-2.5 w-2.5" />{c.credits}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">{j.blurb}</p>
            </button>
          );
        })}
      </div>

      {/* The form for the chosen job */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        {job === "generate_email" && (
          <div className="space-y-3">
            <Field label="What do you want to say?" hint="One or two sentences is plenty.">
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
                placeholder="Spring clean-up bookings are open, first ten get 10% off"
                className="ai-input" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Who is it for?" hint="Optional.">
                <input value={audience} onChange={(e) => setAudience(e.target.value)}
                  placeholder="Past customers in Ankeny" className="ai-input" />
              </Field>
              <Field label="What should they do?" hint="Optional.">
                <input value={goal} onChange={(e) => setGoal(e.target.value)}
                  placeholder="Book a clean-up" className="ai-input" />
              </Field>
            </div>
          </div>
        )}

        {job === "subject_lines" && (
          <Field label="Paste the email" hint="The body it should write subject lines for.">
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={6} className="ai-input" />
          </Field>
        )}

        {job === "improve_copy" && (
          <div className="space-y-3">
            <Field label="Paste your copy">
              <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={6} className="ai-input" />
            </Field>
            <Field label="How should it change?">
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((s) => (
                  <button key={s.id} type="button" onClick={() => setStyle(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      style === s.id ? "border-[#EF6C33] bg-[#FFF6F0] text-[#B84817]" : "border-slate-300 bg-white text-slate-600"
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {job === "draft" && (
          <Field label="What do you need written?" hint="Say it the way you would to a copywriter.">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5}
              placeholder="A text message telling customers we're closed Monday for the holiday" className="ai-input" />
          </Field>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!canRun || pricingUnavailable || (pricing ? !pricing.configured : false)}
            className="rounded-lg bg-[#EF6C33] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-50"
          >
            {busy ? "Writing…" : "Write it"}
          </button>
          {chargeLine && <span className="text-xs text-slate-500">{chargeLine}</span>}
        </div>

        {error && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}
      </div>

      {/* What came back */}
      {result && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              A draft — read it before you send it
            </span>
            {result.credits != null && (
              <span className="text-[11px] text-slate-500">
                {result.credits} credit{result.credits === 1 ? "" : "s"} used
              </span>
            )}
          </div>
          {result.heading && (
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-slate-900">{result.heading}</div>
              <CopyButton text={result.heading} />
            </div>
          )}
          {result.lines && (
            <ul className="space-y-1.5">
              {result.lines.map((l, i) => (
                <li key={`${i}-${l}`} className="flex items-start justify-between gap-3 rounded border border-slate-200 px-3 py-2">
                  <span className="text-sm text-slate-800">{l}</span>
                  <CopyButton text={l} />
                </li>
              ))}
            </ul>
          )}
          {result.body && (
            <>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-800">{result.body}</pre>
              <div className="mt-2"><CopyButton text={result.body} /></div>
            </>
          )}
        </div>
      )}
    </SparkPageShell>
  );
}

/** The one input style this page uses. Scoped like SparkAutomationModal's, so it
 *  cannot leak into another page's inputs. */
function AiWriterStyles() {
  return (
    <style>{`
      .ai-input {
        width: 100%; border: 1px solid #CBD5E1; border-radius: 6px;
        padding: 6px 8px; font-size: 13px; color: #0F172A; background: #fff;
      }
      .ai-input:focus { outline: none; border-color: #EF6C33; box-shadow: 0 0 0 1px #EF6C33; }
      textarea.ai-input { font-family: inherit; line-height: 1.45; resize: vertical; }
    `}</style>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700">{label}</span>
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default SparkAiWriterPage;
