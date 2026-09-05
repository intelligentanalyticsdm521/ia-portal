// SEAM-7-B — a stopgap, and it is meant to be deleted.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS AND WHY IT IS ITS OWN FILE
// ═══════════════════════════════════════════════════════════════════════════
// Contact 360's "Recent Activity" reads `lumen.contact_activity`. A new inquiry
// — a text to the business's number, a web-chat message, a form fill from
// somebody we have never heard of — lands on the LEAD, in `lumen.lead_activity`,
// because at that moment there is no contact to attach it to. So a person
// looking at a contact they know sees a gap they cannot explain, and the
// explanation ("two activity tables") is ours, not theirs.
//
// The real fix is the activity-table merge, which another builder is doing in
// parallel. Until it lands, one quiet sentence beats a silent gap.
//
// IT IS A SEPARATE COMPONENT SO THAT REMOVING IT IS ONE DELETE AND ONE IMPORT.
// A stopgap woven into a page is a stopgap that outlives its reason by a year.
// When the merge lands: delete this file and its single usage in
// SparkContact360Page.tsx. Nothing else references it.

import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

/** The same path NewLeadsBanner sends people to, so two links in the product
 *  cannot mean two different pages by the same name. */
const INBOX_PATH = "/app/services/spark_leads";

export function NewInquiriesElsewhereNote() {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
      <Inbox className="h-3 w-3 flex-shrink-0 text-slate-400" />
      <span>
        New inquiries show on the lead itself in the{" "}
        <Link to={INBOX_PATH} className="font-medium text-slate-600 underline hover:text-slate-800">
          Lead Inbox
        </Link>
        .
      </span>
    </p>
  );
}

export default NewInquiriesElsewhereNote;
