/**
 * ilFindingsApi.ts — the monthly "what worked" report (IL step 8).
 *
 * Types only, plus the five LUMEN paths. Tenant-scoped; the founder's window
 * on the same rows is under /il/admin and lives in ilApi.ts.
 *
 * L4: there is no call in this file that makes the platform DO anything. The
 * strongest verbs are "produce my month" (arithmetic over the business's own
 * rows) and "mark that suggested move done". A playbook has an `action_url` —
 * a path the Portal navigates to — and no payload of any kind.
 */

/** One plain sentence, and the numbers behind it. */
export interface IlFinding {
  finding_id: number;
  /** source_roi | lead_cost | time_to_first_reply | channel_reply |
   *  campaign_reply | rule_effect | conversion_by_band */
  kind: string;
  subject_kind: string | null;
  subject_id: string | null;
  /** the plain words — a source name, a channel, a campaign */
  subject_label: string | null;
  title_plain: string;
  body_plain: string;
  /** the figures the sentence was built from; shown when the row is expanded */
  evidence: Record<string, unknown>;
  confidence: number | null;
}

/** 2-4 plain steps and ONE Portal path. Never anything runnable. */
export interface IlPlaybook {
  playbook_id: number;
  finding_id: number | null;
  kind: string;
  title: string;
  steps: string[];
  /** A Portal path. Never an absolute URL, and never anything executable. */
  action_url: string;
  action_label: string;
  status: "open" | "done" | "dismissed";
  decided_at: string | null;
}

export interface IlFindingsReport {
  period: string;
  label: string;
  generated_at: string | null;
  run: {
    status: string;
    findings: number;
    playbooks: number;
    narrative_status: string | null;
    email_status: string | null;
    email_sent_at: string | null;
  } | null;
  /** The month in one paragraph. Standard and above; null on Lite. */
  narrative: string | null;
  findings: IlFinding[];
  playbooks: IlPlaybook[];
  /** Pro and above — Hot / Warm / Cold findings are stripped below it. */
  lead_intelligence: boolean;
  /** Standard and above — the paragraph. */
  narrative_available: boolean;
  /** PRE-WALK 1b — one entry per section of the report, in reading order. A
   *  section with nothing in it is still drawn, and says what it is waiting
   *  for; a section this plan does not include says so instead. */
  coverage?: IlFindingCoverage[];
  /** true when this business has no report for the month yet. */
  empty?: boolean;
}

export interface IlFindingCoverage {
  kind: string;
  measured: boolean;
  /** 'pro' when the section exists but this plan does not include it. */
  gated: string | null;
  /** The plain sentence for a section that has nothing yet. */
  waiting_for: string | null;
}

export interface IlFindingPeriod {
  period: string;
  status: string;
  findings_written: number;
  playbooks_written: number;
  narrative_status: string | null;
  email_status: string | null;
  finished_at: string | null;
}

export const IL_FINDINGS_PATHS = {
  report: (period?: string) =>
    `/api/v1/insights/findings${period ? `?period=${encodeURIComponent(period)}` : ""}`,
  periods: "/api/v1/insights/findings/periods",
  run: "/api/v1/insights/findings/run",
  playbookDone: (id: number) => `/api/v1/insights/playbooks/${id}/done`,
  playbookDismiss: (id: number) => `/api/v1/insights/playbooks/${id}/dismiss`,
} as const;

/** What each finding kind answers, in the owner's words. Used as the group
 *  heading on the page so the report reads as questions, not as a table. */
export const FINDING_KIND_LABEL: Record<string, string> = {
  source_roi: "Where the work came from",
  lead_cost: "What the leads cost",
  time_to_first_reply: "How fast you answered",
  channel_reply: "Where you answer fastest",
  campaign_reply: "What your campaigns did",
  rule_effect: "What your rules did",
  conversion_by_band: "Whether the ranking was right",
};

/** Plain words for the evidence keys. An owner should never read a column
 *  name. Anything not listed falls back to the key with underscores removed. */
export const EVIDENCE_LABEL: Record<string, string> = {
  source: "Source",
  leads: "Inquiries",
  quotes_sent: "Quotes sent",
  quotes_accepted: "Quotes accepted",
  jobs_paid: "Paid jobs",
  money_collected_usd: "Money collected",
  lead_cost_usd: "What the leads cost",
  cost_per_lead_usd: "Cost per lead",
  cost_per_paid_job_usd: "Cost per paid job",
  total_cost_usd: "Total spent",
  paid_leads: "Leads you paid for",
  paid_jobs: "Paid jobs",
  by_source: "By source",
  by_channel: "By where it came from",
  by_band: "By ranking",
  replies_tracked: "Replies we could see",
  mean_hours_to_first_reply: "Average hours to first reply",
  no_tracked_reply: "No reply we can see",
  campaign: "Campaign",
  campaign_kind: "Kind",
  sends: "Sent to",
  opened: "Opened",
  clicked: "Clicked",
  replies: "Replies",
  reply_window_days: "Reply window (days)",
  quotes_within_30_days: "Quotes in the next 30 days",
  applications: "Times a rule applied",
  leads_touched: "Inquiries touched",
  held: "Held for your decision",
  accepted: "You took",
  declined: "You passed",
  ranked_up: "Moved up",
  ranked_down: "Moved down",
  window_days: "Days looked at",
  total_ranked: "Ranked inquiries",
  total_converted: "Became paid work",
  band: "Ranking",
  n: "How many",
  converted: "Became paid work",
  channel: "Where it came from",
  basis: "How this was worked out",
  verified: "Checked",
  written_from: "Built from",
};

/** Keys whose value is money and should render with a $. */
export const MONEY_KEYS = new Set([
  "money_collected_usd", "lead_cost_usd", "cost_per_lead_usd",
  "cost_per_paid_job_usd", "total_cost_usd",
]);

export function labelForEvidenceKey(key: string): string {
  return EVIDENCE_LABEL[key] || key.replace(/_usd$/, "").replace(/_/g, " ");
}

export function formatEvidenceValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (MONEY_KEYS.has(key)) {
      const dp = Math.abs(value) > 0 && Math.abs(value) < 10 ? 2 : 0;
      return `$${value.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
    return String(Math.round(value * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))(?!\.\d)/g, ",");
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}
