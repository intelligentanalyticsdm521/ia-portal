// SparkLeadGenTermsPage — the client-facing Lead Use Terms for SPARK Lead Gen.
// Canonical text: overnight-report/LEADGEN_CLIENT_TERMS_v1.md (keep the two in
// step). Linked from the Lead Inbox, the New B2B Lead Search page (header and
// under Start Search) and the job page.
//
// Why it exists (Brandon 2026-09-04): our data providers license lead data for
// a client's OWN outreach and require us to pass that restriction down; we take
// the same stance the directories take against everyone else — no resale, no
// list-building for third parties. The search-engine attribution wording lives
// here too (several engines, including Brave Search; nothing they return is stored).
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

const EFFECTIVE = "September 4, 2026";
const VERSION = "1.0";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="text-sm text-slate-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function SparkLeadGenTermsPage() {
  const navigate = useNavigate();
  // Brandon 2026-09-04: "we need a back button so they can get out of the terms
  // without clicking a bunch of navigation paths." Go back to wherever the reader
  // came from; a direct/bookmarked visit has nowhere to go back to → Lead Inbox.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/app/services/spark_lead_inbox");
  };
  return (
    <SparkPageShell
      title="Lead Use Terms"
      subtitle={`SPARK Lead Gen — version ${VERSION}, effective ${EFFECTIVE}`}
      actions={
        <button
          type="button"
          onClick={goBack}
          className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
      }
      error={null}
      loading={false}
    >
      <div className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-slate-600 leading-relaxed">
          These terms apply to every lead delivered by SPARK Lead Gen, whether found by a search you run, a saved search that
          runs on a schedule, or a lead we surface for you. They sit alongside your Intelligent Analytics service agreement.
        </p>

        <Section title="1. What a lead is">
          <p>
            A lead is a <strong>business</strong> with at least one verified, deliverable email address, plus any additional
            contacts we found at that business. Each lead carries a Hot / Warm / Cold score, a source label, and the date it
            was found. One business is one lead regardless of how many contacts it has.
          </p>
        </Section>

        <Section title="2. Where leads come from">
          <p>
            Lead discovery is powered by Intelligent Analytics&apos; internal model and draws on multiple web search engines,
            including <strong>Brave Search</strong>, together with licensed business-data providers. Search engines are used
            only to identify a business&apos;s website. We do not store, cache, or display anything a search engine returns:
            no titles, snippets, rankings, or links. Everything you see on a lead comes from our licensed data providers and
            from the business&apos;s own public website, and is verified at the time of delivery.
          </p>
        </Section>

        <Section title="3. What you may do with leads">
          <p>
            You may use leads for <strong>your own business&apos;s</strong> sales and marketing: contacting the business, adding
            it to your SPARK contacts, lists, segments and campaigns, and tracking the relationship in your CRM. You may export
            your own leads for your own use.
          </p>
        </Section>

        <Section title="4. What you may not do">
          <ul className="list-disc pl-5 space-y-1">
            <li>Resell, license, rent, share or otherwise redistribute leads or lead data to anyone outside your business.</li>
            <li>Build, contribute to, or sell a marketing list, directory, database or data product using leads.</li>
            <li>Scrape, bulk-export or automate extraction of the Lead Inbox for any purpose other than your own outreach.</li>
            <li>Use leads to build or seed a contact database, or to offer a competing lead-generation, email-finding or data service.</li>
            <li>Use leads for any unlawful, deceptive, harassing or discriminatory purpose.</li>
          </ul>
          <p>
            Our data providers license this information for your own outreach only. These restrictions pass their terms down to
            you and are a condition of the service. Breach may result in suspension of Lead Gen without refund.
          </p>
        </Section>

        <Section title="5. Your outreach obligations">
          <p>You are the sender of anything you send to a lead, and the law that governs it applies to you:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Email (CAN-SPAM):</strong> identify your business truthfully, include a valid physical mailing address,
              use honest subject lines, provide a working unsubscribe, and honor opt-outs within 10 business days. Never send
              to an address that has opted out.
            </li>
            <li>
              <strong>Calls and texts (TCPA and do-not-call rules):</strong> text messages require the recipient&apos;s prior
              consent. Respect the National Do Not Call Registry and state lists, and calling-hour restrictions.
            </li>
            <li>
              <strong>Data protection:</strong> you are the independent data controller of the lead data you receive. You decide
              how you use it, you need your own lawful basis for outreach, and you must honor access, deletion and opt-out
              requests. Where a lead&apos;s contact is covered by a state privacy law (for example California), provide the
              required notice.
            </li>
          </ul>
          <p>SPARK campaigns include unsubscribe handling and consent tracking to help you meet these obligations; using them does not transfer the obligation.</p>
        </Section>

        <Section title="6. Removal and suppression">
          <p>
            If a business asks not to be contacted, stop contacting it and add it to your Suppressed Domains. Businesses that ask
            Intelligent Analytics directly are suppressed platform-wide. Suppressed domains are never delivered again. When a person
            asks our data providers to remove their details, we remove that contact from your Lead Inbox and you must remove it
            from your own records.
          </p>
        </Section>

        <Section title="7. Billing">
          <p>
            You are charged per <strong>delivered</strong> lead at your plan&apos;s rate. When you start a search, one lead credit
            is reserved for each lead requested; credits for leads that are not delivered are released when the search
            finishes. A business without a verified email is never delivered and never charged.
          </p>
        </Section>

        <Section title="8. Accuracy">
          <p>
            Contacts are verified at the time of delivery. Businesses change; we do not guarantee that a contact remains
            deliverable, that a business will respond, or any particular sales outcome. Our discovery and data sources may change
            or be withdrawn without notice, and we do not guarantee the continued supply of any particular data field. If a lead
            looks wrong, mark it in the Lead Inbox so it can be reviewed.
          </p>
        </Section>

        <Section title="9. Changes">
          <p>
            We may update these terms as our data providers or the law change. The version and effective date appear at the top
            of this page; material changes are announced in the Lead Inbox.
          </p>
        </Section>
      </div>
    </SparkPageShell>
  );
}
