// SparkApiReferencePage — Self-service API reference for tenants (v6.2).
//
// Renders a structured catalog of every SPARK endpoint a tenant can integrate
// against (forms, contacts, campaigns, webhooks, secrets, etc.) with example
// curl-style requests. Static content; the data lives in this file so we
// don't pay an extra fetch on page load.
//
// Sections collapse independently. A top filter narrows the visible
// endpoints by free-text match across method+path+description.
import { useMemo, useState } from "react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { useFeatureGate } from "../../hooks/useFeatureGate";
import {
  Code as CodeIcon,
  Search as SearchIcon,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Endpoint {
  method: Method;
  path: string;
  summary: string;
  description?: string;
  /** Example body (POST/PUT/PATCH) shown inline as JSON. */
  exampleBody?: Record<string, unknown>;
  /** Example query string fragment. */
  exampleQuery?: string;
  /** Whether the endpoint requires the bearer token + x-tenant-id header.
   *  Defaults to true. Public endpoints (form submit, hosted form, QR) are false. */
  authRequired?: boolean;
  /** The catalog key the API gates this endpoint on; its plan is the catalog's, shown from the answer. */
  featureKey?: string;
}

interface Section {
  key: string;
  label: string;
  description: string;
  endpoints: Endpoint[];
}

const SECTIONS: Section[] = [
  {
    key: "contacts",
    label: "Contacts",
    description: "Create, read, update, and dedupe contacts in the CRM.",
    endpoints: [
      { method: "GET",    path: "/api/v1/contacts",                 summary: "List contacts",         exampleQuery: "?limit=50&search=acme" },
      { method: "GET",    path: "/api/v1/contacts/:id",             summary: "Get a single contact" },
      { method: "POST",   path: "/api/v1/contacts",                 summary: "Create or merge by email", exampleBody: { first_name: "Jane", last_name: "Doe", email: "jane@acme.com", phone: "+15551234567", source: "website" } },
      { method: "PATCH",  path: "/api/v1/contacts/:id",             summary: "Update fields", exampleBody: { phone: "+15551234567", tags: ["vip"] } },
      { method: "DELETE", path: "/api/v1/contacts/:id",             summary: "Soft-delete (is_deleted=1)" },
      { method: "POST",   path: "/api/v1/contacts/:keepId/merge",   summary: "Merge contact (v3.0)", exampleBody: { merge_id: 12 } },
      { method: "POST",   path: "/api/v1/contacts/bulk/locale",     summary: "Bulk-set preferred_locale (v2.6)", exampleBody: { contact_ids: [101, 102, 103], locale: "es-US" } },
      { method: "POST",   path: "/api/v1/contacts/bulk/tag",        summary: "Bulk-add tag (v2.6)", exampleBody: { contact_ids: [101, 102], tag_id: 5 } },
      { method: "POST",   path: "/api/v1/contacts/bulk/delete",     summary: "Bulk soft-delete (v2.6)", exampleBody: { contact_ids: [101, 102] } },
      { method: "GET",    path: "/api/v1/contacts/:id/360",         summary: "Cross-product 360° view (v2.0)", exampleQuery: "?include=activity,campaigns,deals" },
      { method: "GET",    path: "/api/v1/contacts/duplicates",      summary: "Find duplicate contacts (v3.0)", exampleQuery: "?kind=email" },
    ],
  },
  {
    key: "forms",
    label: "Forms",
    description: "Form definitions, submissions, and hosted/QR distribution.",
    endpoints: [
      { method: "GET",    path: "/api/v1/forms",                    summary: "List forms" },
      { method: "POST",   path: "/api/v1/forms",                    summary: "Create a form", exampleBody: { name: "Quote Request", fields_schema: [{ type: "text", name: "first_name", label: "First name", required: true }] } },
      { method: "PUT",    path: "/api/v1/forms/:id",                summary: "Update form definition + slug", exampleBody: { name: "Quote Request", slug: "quote-request", fields_schema: [/* … */] } },
      { method: "POST",   path: "/api/v1/forms/:id/submit",         summary: "Public form submission",  authRequired: false, exampleBody: { first_name: "Jane", last_name: "Doe", email: "jane@acme.com" } },
      { method: "GET",    path: "/api/v1/forms/:id/hosted",         summary: "Hosted HTML form page (v6.0)", authRequired: false },
      { method: "GET",    path: "/api/v1/forms/:id/public",         summary: "Public form JSON definition (v4.2)", authRequired: false },
      { method: "GET",    path: "/api/v1/forms/:id/qr.svg",         summary: "QR code SVG for hosted URL (v6.1)", authRequired: false, exampleQuery: "?size=256" },
      { method: "GET",    path: "/api/v1/f/:tenantId/:formSlug",    summary: "Slug redirect to hosted form (v6.1)", authRequired: false },
      { method: "GET",    path: "/api/v1/forms/:id/submissions",    summary: "List form submissions" },
    ],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    description: "Email + SMS campaigns including the v1.15 bulk SMS system.",
    endpoints: [
      { method: "GET",    path: "/api/v1/campaigns",                summary: "List email campaigns" },
      { method: "POST",   path: "/api/v1/campaigns",                summary: "Create an email campaign", exampleBody: { name: "Spring promo", subject: "30% off this week", body_html: "<p>...</p>", list_id: 7 } },
      { method: "POST",   path: "/api/v1/campaigns/:id/send",       summary: "Send a campaign now" },
      { method: "GET",    path: "/api/v1/sms-campaigns",            summary: "List SMS campaigns (v1.15)" },
      { method: "POST",   path: "/api/v1/sms-campaigns",            summary: "Create SMS campaign", exampleBody: { name: "Reminder blast", template_id: 12, audience_type: "list", audience_id: 7, body_b: "Variant B text", split_percent_b: 50 } },
      { method: "POST",   path: "/api/v1/sms-campaigns/:id/send",   summary: "Send SMS campaign now" },
      { method: "POST",   path: "/api/v1/sms-campaigns/:id/retry-failed", summary: "Retry failed sends (v2.4)" },
      { method: "POST",   path: "/api/v1/sms-campaigns/:id/cancel", summary: "Cancel a scheduled SMS campaign" },
    ],
  },
  {
    key: "automations",
    label: "Automations & Workflows",
    description: "Drag-and-drop automation builder + per-contact workflow triggers (v4.1).",
    endpoints: [
      { method: "GET",    path: "/api/v1/automations",              summary: "List automations" },
      { method: "POST",   path: "/api/v1/automations",              summary: "Create an automation", exampleBody: { name: "New-lead nurture", trigger: "contact.created", steps: [/* … */] } },
      { method: "GET",    path: "/api/v1/workflow-triggers",        summary: "List workflow triggers (v4.1)" },
      { method: "POST",   path: "/api/v1/workflow-triggers",        summary: "Create a workflow trigger", exampleBody: { name: "Win-back at-risk", trigger_kind: "health_tier_changed", condition: { from_tier: "engaged", to_tier: "at_risk" }, action_kind: "send_email", action: { template_key: "win_back_campaign" } } },
      { method: "POST",   path: "/api/v1/workflow-triggers/:id/fire-test", summary: "Fire trigger against a contact (test)", exampleBody: { contact_id: 1234 } },
    ],
  },
  {
    key: "webhooks",
    label: "Webhooks",
    description: "Outbound webhook subscriptions + delivery dashboard (v3.1).",
    endpoints: [
      { method: "GET",    path: "/api/v1/webhook-subscriptions",                   summary: "List subscriptions" },
      { method: "POST",   path: "/api/v1/webhook-subscriptions",                   summary: "Subscribe to events", exampleBody: { name: "Zapier integration", target_url: "https://hooks.zapier.com/...", events: ["contact.created", "form.submitted"] } },
      { method: "POST",   path: "/api/v1/webhook-subscriptions/:id/test",          summary: "Fire a test event" },
      { method: "GET",    path: "/api/v1/webhook-deliveries",                      summary: "Cross-subscription delivery log (v3.1)", exampleQuery: "?days=7&status=failed" },
      { method: "GET",    path: "/api/v1/webhook-deliveries/summary",              summary: "Delivery summary stats" },
      { method: "POST",   path: "/api/v1/webhook-deliveries/:id/retry",            summary: "Retry a failed delivery (admin)" },
      { method: "GET",    path: "/api/v1/inbound-webhooks",                        summary: "List inbound webhook receivers" },
      { method: "POST",   path: "/api/v1/inbound-webhooks/:slug",                  summary: "Public inbound webhook receiver", authRequired: false },
    ],
  },
  {
    key: "ia_insights",
    label: "IA Insights",
    description: "Score history + Trend / Intelligence engine inputs.",
    endpoints: [
      { method: "GET",  path: "/api/v1/ia-insights/inputs",         summary: "SPARK / OLIVER trend engine inputs (v5.16)", exampleQuery: "?product=spark&days=90" },
      { method: "POST", path: "/api/v1/ia-insights/scores",         summary: "Persist current-period scores", exampleQuery: "?product=spark", exampleBody: { periodEnd: "2026-05-13", scores: { contact_health: 72, lead_pipeline: 58 } } },
      { method: "GET",  path: "/api/v1/ia-insights/prior-scores",   summary: "Prior-period scores for ghost-bar comparison", exampleQuery: "?product=spark&beforeDate=2026-05-13" },
      { method: "GET",  path: "/api/v1/ia-insights/score-history",  summary: "Last N periods of scores for a report", exampleQuery: "?product=spark&reportKey=contact_health&limit=12" },
      { method: "GET",  path: "/api/v1/ia-insights/benchmarks",     summary: "Industry benchmarks by service category", exampleQuery: "?category=home_services" },
    ],
  },
  {
    key: "usage",
    label: "Usage & Activity",
    description: "Business usage counts + the v4.5 real-time activity stream.",
    endpoints: [
      { method: "GET", path: "/api/v1/usage",                       summary: "Monthly usage vs tier limits" },
      { method: "GET", path: "/api/v1/usage/realtime",              summary: "Live activity counters (v4.5)", exampleQuery: "?minutes=60" },
      { method: "GET", path: "/api/v1/activity",                    summary: "Activity stream (v1.12)", exampleQuery: "?contact_id=1234&limit=50" },
      { method: "GET", path: "/api/v1/activity/summary",            summary: "30-day activity counts by type" },
      { method: "GET", path: "/api/v1/audit-log",                   summary: "Business audit log (v1.16)", featureKey: "spark_audit_log" },
      { method: "GET", path: "/api/v1/audit-log/export.csv",        summary: "Audit log CSV export (v2.3)", featureKey: "spark_audit_log" },
    ],
  },
  {
    key: "admin",
    label: "Admin & Configuration",
    description: "Secrets vault, business settings, quiet hours, rate limits, config backup.",
    endpoints: [
      { method: "GET",    path: "/api/v1/tenant-secrets",            summary: "List secrets (v1.11)" },
      { method: "POST",   path: "/api/v1/tenant-secrets",            summary: "Create secret (admin)", exampleBody: { name: "stripe_api_key", value: "sk_live_…", description: "The business's Stripe restricted key" } },
      { method: "POST",   path: "/api/v1/tenant-secrets/:id/reveal", summary: "Reveal plaintext (audit-logged, admin)" },
      { method: "GET",    path: "/api/v1/tenant-settings",           summary: "Read all business settings (v5.23)" },
      { method: "PUT",    path: "/api/v1/tenant-settings/:key",      summary: "Upsert a business setting", exampleBody: { value: "home_services" } },
      { method: "GET",    path: "/api/v1/quiet-hours",               summary: "Quiet hours config (v3.3)" },
      { method: "PUT",    path: "/api/v1/quiet-hours",               summary: "Update quiet hours", exampleBody: { enabled: true, timezone: "America/Chicago", start_hour: 21, end_hour: 9, block_action: "queue" } },
      { method: "GET",    path: "/api/v1/rate-limits",               summary: "Rate-limit config (v3.5)" },
      { method: "GET",    path: "/api/v1/rate-limits/usage",         summary: "Per-minute API call breakdown" },
      { method: "GET",    path: "/api/v1/config/export",             summary: "Export the business's SPARK config (v4.4)" },
      { method: "POST",   path: "/api/v1/config/import",             summary: "Import a previously exported config" },
    ],
  },
];

const METHOD_COLORS: Record<Method, string> = {
  GET: "#0F766E", POST: "#EF6C33", PUT: "#2563EB", PATCH: "#9333EA", DELETE: "#DC2626",
};

export function SparkApiReferencePage() {
  const [search, setSearch] = useState("");
  const featureGate = useFeatureGate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map((s) => [s.key, true]))
  );
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.map((s) => ({
      ...s,
      endpoints: s.endpoints.filter((e) =>
        e.path.toLowerCase().includes(q)
        || e.summary.toLowerCase().includes(q)
        || (e.description || "").toLowerCase().includes(q)
        || e.method.toLowerCase() === q
      ),
    })).filter((s) => s.endpoints.length > 0);
  }, [search]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(
      () => { setCopied(key); setTimeout(() => setCopied(null), 1500); },
      () => { /* swallow */ }
    );
  }

  const totalEndpoints = SECTIONS.reduce((s, sec) => s + sec.endpoints.length, 0);

  return (
    <SparkPageShell
      title="API Reference"
      subtitle={`${totalEndpoints} endpoints across ${SECTIONS.length} sections`}
      help="Self-service API reference. All endpoints use Bearer auth + x-tenant-id header unless marked PUBLIC. Tier-gated endpoints are noted; tenants on lower tiers receive 403 with an upgrade hint."
    >
      <div className="rounded-lg border border-slate-200 bg-white p-3 mb-3 flex items-center gap-2">
        <SearchIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by path, method, or keyword (e.g. 'contact', 'POST', 'merge')…"
          className="flex-1 text-sm border-none focus:outline-none focus:ring-0"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-slate-500 hover:text-slate-700 underline">
            Clear
          </button>
        )}
      </div>

      {filtered.map((section) => (
        <div key={section.key} className="rounded-lg border border-slate-200 bg-white mb-3 overflow-hidden">
          <button
            onClick={() => setExpanded((c) => ({ ...c, [section.key]: !c[section.key] }))}
            className="w-full px-4 py-3 flex items-start justify-between gap-2 hover:bg-slate-50 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {expanded[section.key] ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <CodeIcon className="h-4 w-4 text-[#EF6C33]" />
                <span className="font-semibold text-sm text-slate-900">{section.label}</span>
                <span className="text-[10px] text-slate-500">({section.endpoints.length})</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 ml-6">{section.description}</div>
            </div>
          </button>
          {expanded[section.key] && (
            <div className="border-t border-slate-200">
              {section.endpoints.map((ep, idx) => {
                const isPublic = ep.authRequired === false;
                const fullUrl = `${ep.path}${ep.exampleQuery || ""}`;
                return (
                  <div key={`${ep.method}-${ep.path}-${idx}`} className="px-4 py-2.5 border-t border-slate-100 first:border-t-0 hover:bg-slate-50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white tracking-wide flex-shrink-0"
                        style={{ background: METHOD_COLORS[ep.method] }}
                      >
                        {ep.method}
                      </span>
                      <code className="text-xs font-mono text-slate-900 break-all flex-1 min-w-0">{fullUrl}</code>
                      <button
                        onClick={() => copy(fullUrl, `${section.key}-${idx}`)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1 flex-shrink-0"
                      >
                        {copied === `${section.key}-${idx}` ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-700 mt-1 ml-1">{ep.summary}</div>
                    <div className="flex items-center gap-2 mt-1 ml-1 flex-wrap">
                      {isPublic && <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">public</span>}
                      {!isPublic && <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">auth required</span>}
                      {ep.featureKey && featureGate.entry(ep.featureKey)?.min_tier && (
                        <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                          {featureGate.entry(ep.featureKey)?.min_tier} tier
                        </span>
                      )}
                    </div>
                    {ep.exampleBody && (
                      <div className="mt-2 ml-1">
                        <div className="text-[9px] uppercase font-semibold text-slate-500 tracking-wide mb-1">Example body</div>
                        <pre className="text-[10px] font-mono bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">
                          {JSON.stringify(ep.exampleBody, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">
          No endpoints match "{search}". Try a different keyword.
        </div>
      )}

      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <strong className="block mb-1">Authentication</strong>
        <p className="mb-2">Most endpoints require a Bearer access token (Azure AD via MSAL) plus the <code className="font-mono">x-tenant-id</code> header. Public endpoints are explicitly marked above.</p>
        <pre className="text-[10px] font-mono bg-white border border-blue-200 rounded p-2 overflow-x-auto">
{`curl -X GET https://api.intelligentanalyticsdm.com/api/v1/contacts \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "x-tenant-id: YOUR_TENANT_ID"`}
        </pre>
      </div>
    </SparkPageShell>
  );
}

export default SparkApiReferencePage;
