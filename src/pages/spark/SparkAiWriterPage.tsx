// @deprecated 2026-06-12 - orphan after refactor. Superseded by D-12 (2026-05-28): AI Writer dropped from nav. Stub kept for legacy; no current entry point.. Confirm with founder before deletion (task #174).
import { Link } from "react-router-dom";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Sparkles, Mail, MessageSquare, FileText, Newspaper, Share2, Type, Zap, Coins,
} from "lucide-react";

/**
 * AI Writer is a v2 feature. It requires:
 *  - Anthropic API key (provisioning pending)
 *  - AI Credits billing system (not yet built)
 *  - aiRouter abstraction (Claude for analysis + writing, OpenAI later for images)
 *
 * Until v2, this is a coming-soon page showing what will be available + the
 * credit pricing.
 */

interface FeatureCard {
  icon: typeof Mail;
  title: string;
  desc: string;
  credits: number;
}

const FEATURES: FeatureCard[] = [
  { icon: Mail, title: "Email drafts", desc: "Full email with subject + body, on brand voice", credits: 2 },
  { icon: Type, title: "Subject lines (×5)", desc: "Five high-conversion subject lines per request", credits: 1 },
  { icon: MessageSquare, title: "SMS drafts", desc: "Punchy SMS under 160 chars, A/B variants", credits: 1 },
  { icon: Newspaper, title: "Newsletter sections", desc: "Intro + 2-3 paragraph sections from a brief", credits: 4 },
  { icon: FileText, title: "Landing page copy", desc: "Headline, sub-head, 3 bullets, CTA copy", credits: 6 },
  { icon: Share2, title: "Social posts", desc: "Conversational posts tuned to your channels", credits: 1 },
];

export function SparkAiWriterPage() {
  return (
    <SparkPageShell
      title="AI Writer"
      subtitle="Marketing copy assistant — coming with v2"
    >
      {/* Coming Soon hero */}
      <div className="rounded-xl bg-gradient-to-br from-violet-50 via-white to-emerald-50 border border-slate-200 p-8 mb-4">
        <div className="flex items-center gap-2 text-xs uppercase font-semibold text-violet-600 mb-2">
          <Sparkles className="h-4 w-4" /> v2 — AI Credits required
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Brand-voice marketing copy, on demand</h2>
        <p className="text-sm text-slate-600 max-w-2xl">
          AI Writer turns a brief into ready-to-send copy — emails, SMS, newsletters,
          landing pages, social posts. It learns your brand voice from ARION My Brand
          and Anthropic Claude does the writing. Credits gate usage so you stay in
          control of cost.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white border border-slate-200">
            <Zap className="h-3 w-3 text-amber-500" /> Powered by Claude Sonnet 4.5
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white border border-slate-200">
            <Coins className="h-3 w-3 text-emerald-600" /> Pro: 100 credits/mo · Business: 500/mo
          </span>
        </div>
      </div>

      {/* Feature preview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {FEATURES.map(f => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="spark-mini-card">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-violet-50">
                  <Icon className="h-4 w-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{f.title}</h3>
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      <Coins className="h-2.5 w-2.5" /> {f.credits}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{f.desc}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* What's coming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <div className="spark-mini-card">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">What's coming in v2</h3>
          <ul className="space-y-1.5 text-sm text-slate-700">
            <li>• Claude Sonnet 4.5 for analysis + writing</li>
            <li>• Brand voice from ARION My Brand (auto-applied)</li>
            <li>• Output validators: length caps, banned-phrase filters, brand-compliance check</li>
            <li>• A/B variant generation (5 options per request)</li>
            <li>• One-click insert into Campaigns / Newsletter / Social</li>
            <li>• Full audit log on every generation (tokens + cost per tenant)</li>
          </ul>
        </div>
        <div className="spark-mini-card">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">AI Credits — how it works</h3>
          <ul className="space-y-1.5 text-sm text-slate-700">
            <li>• 1 credit = $0.10 in pricing terms (~50% margin over raw API cost)</li>
            <li>• Pro tier includes 100 credits/month (~50 email drafts)</li>
            <li>• Business tier includes 500 credits/month</li>
            <li>• Top up: $20 = 250 credits, $50 = 700 credits</li>
            <li>• Unused credits roll forward 30 days then expire</li>
            <li>• Each operation shows credit cost before you commit</li>
          </ul>
          <Link to="/app/services/spark_usage" className="inline-block mt-3 text-xs text-emerald-600 font-medium">View tier comparison →</Link>
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 py-4">
        v2 ships with the IA Intelligence Layer rollout. Want early access? Reach out at support@iadm.io.
      </div>
    </SparkPageShell>
  );
}

export default SparkAiWriterPage;
