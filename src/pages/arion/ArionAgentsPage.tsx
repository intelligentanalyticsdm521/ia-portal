// ArionAgentsPage — Settings -> ARION -> Agents (/app/services/arion_agents)
//
// ARION's Content & Social Agent is BUILT but is not on this release line:
// arion-api has no lib/contentAgent, no routes/contentAgent*, no
// arion.content_agent_* tables, and arion-func has no contentAgentWeekly timer.
// So this page is the honest version — the same page shape the other products
// have, with the one agent shown as coming and NO button that would 404.
//
// The copy follows feedback_no_tenant_in_ui: lead with what they see today,
// say what unlocks it, no dates, no jargon, one short paragraph.
//
// ServiceRouter already wraps every ARION page in ArionPageWrapper, so this
// file renders the body only — wrapping again would stack two headers.
import { Sparkles, Clock } from "lucide-react";

export function ArionAgentsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-1">
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <div className="text-xs text-slate-700">
            <div className="text-sm font-semibold text-slate-900">Your ARION agents</div>
            When an agent writes something for your website, it lands here for you to read
            and approve before anything goes live. Powered by ARGUS AI.
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Content &amp; Social Agent — coming
              </div>
              <p className="mt-1 max-w-2xl text-xs text-slate-600">
                It writes blog posts and social content in your own voice, and puts every one in
                front of you before it publishes. It is not switched on for your website yet —
                we will let you know as soon as it is.
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Created by Intelligent Analytics — ARION Content &amp; Social Agent
              </p>
            </div>
          </div>
        </section>

        <p className="text-xs text-slate-500">
          Your other agents live with the product they work in: quote and payment follow-ups and
          job assignments under OLIVER, campaigns and the Responder under SPARK.
        </p>
    </div>
  );
}

export default ArionAgentsPage;
