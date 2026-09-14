// Small "Lead Use Terms" link shown on every Lead Gen surface (Lead Inbox,
// New B2B Lead Search, job page) — Brandon 2026-09-04: "add it to every lead
// inbox … on the actual leads page … and on the actual search so we are fully
// covered." Also carries the search-engine attribution wording in the terms.
//
// Brandon 2026-09-14: the terms are published on the public website and the
// link goes THERE (a client can read them without signing in, and the sales
// site and the Portal show one document). The in-app page at LEADGEN_TERMS_ROUTE
// stays routed as the canonical copy: the parity test pins it to the markdown,
// and the version and effective date a client accepted are recorded from it.
import { ScrollText } from "lucide-react";

export const LEADGEN_TERMS_ROUTE = "/app/spark/leadgen/terms";
/** The public copy of the same terms on the marketing site (one document, two doors). */
export const LEAD_USE_TERMS_PUBLIC_URL = "https://intelligentanalyticsdm.com/lead-use-terms/";

export function LeadGenTermsLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={LEAD_USE_TERMS_PUBLIC_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline ${className}`}
      title="How leads are sourced, what you may do with them, and your outreach obligations (opens on our website)"
    >
      <ScrollText className="h-3.5 w-3.5" /> Lead Use Terms
    </a>
  );
}

/** One-line consent notice for the Start Search action. */
export function LeadGenTermsNotice() {
  return (
    <p className="text-[11px] leading-snug text-slate-500 text-center">
      Leads are for your own business outreach and may not be resold or shared. Starting a search means you accept the{" "}
      <a href={LEAD_USE_TERMS_PUBLIC_URL} target="_blank" rel="noopener noreferrer" className="underline text-slate-600 hover:text-slate-900">Lead Use Terms</a>.
    </p>
  );
}
