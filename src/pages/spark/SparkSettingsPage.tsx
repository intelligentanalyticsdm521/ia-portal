// SPARK Settings — landing hub for tenant + SPARK-specific configuration.
//
// F-83 — the gear icon in the IconRail navigates to /app/services/spark_settings,
// but this route used to 404 because no page component or service-catalog
// entry existed. This page is the landing the gear lands on.
//
// F-84 (follow-up) — the same taxonomy here will drive the SPARK SubNav once
// the IconRail+SubNav split lands for SPARK. Until then, this hub acts as
// the index: every SPARK config surface is reachable from here in 1 click.
import { Link } from "react-router-dom";
import {
  User, Mail, Globe, Key, Webhook, FileCode2,
  CalendarClock, Sparkles, Settings as SettingsIcon, Shield,
  Database, MessageSquare, Layers, Filter, BookOpen, FlaskConical,
  DollarSign, BarChart3, Inbox, Tag,
} from "lucide-react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface SettingTile {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface SettingGroup {
  heading: string;
  tagline: string;
  tiles: SettingTile[];
}

// Same icon size everywhere on this page — 18px keeps the tile vertical
// rhythm tight and matches the SparkOverviewPage stat-card aesthetic.
const I = "h-[18px] w-[18px]";

const GROUPS: SettingGroup[] = [
  {
    heading: "Business profile & onboarding",
    tagline: "Identity, sender setup, getting-started checklist.",
    tiles: [
      { to: "/app/services/spark_account_profile", label: "Business Profile", description: "Name, contact, branding — shared across every product.", icon: <User className={I} /> },
      { to: "/app/services/spark_onboarding",       label: "Get Started",      description: "Guided checklist for new SPARK tenants.",                 icon: <Sparkles className={I} /> },
      { to: "/app/services/spark_service_category", label: "Service Category", description: "Industry classification — drives IA Insights benchmarks.", icon: <Tag className={I} /> },
    ],
  },
  {
    heading: "Email & deliverability",
    tagline: "Sender domains, templates, deliverability, translations.",
    tiles: [
      { to: "/app/services/spark_sender_domains",  label: "Sender Domains",    description: "Custom from-domains for outbound email (DKIM + SPF).",  icon: <Globe className={I} /> },
      { to: "/app/services/spark_email_templates", label: "Email Templates",   description: "Transactional + marketing templates. System library available.", icon: <Mail className={I} /> },
      { to: "/app/services/spark_sms_templates",   label: "SMS Templates",     description: "Reusable SMS bodies for campaigns + automations.",       icon: <MessageSquare className={I} /> },
      { to: "/app/services/spark_template_i18n",   label: "Translations",      description: "Per-locale subject/body for any email or SMS template.", icon: <Layers className={I} /> },
      { to: "/app/services/spark_deliverability",  label: "Deliverability",    description: "Bounce / open / spam metrics + sender reputation.",      icon: <BarChart3 className={I} /> },
      { to: "/app/services/spark_tracking",        label: "Tracking & Pixels", description: "Open + click tracking config + UTM defaults.",           icon: <BarChart3 className={I} /> },
    ],
  },
  {
    heading: "Contacts & data",
    tagline: "Field schemas, imports, merges, quiet hours.",
    tiles: [
      { to: "/app/services/spark_custom_fields",   label: "Custom Fields",   description: "Per-tenant custom fields on contacts + companies.",       icon: <FileCode2 className={I} /> },
      { to: "/app/services/spark_quiet_hours",     label: "Quiet Hours",     description: "Per-tenant send-window guardrails for SMS + email.",      icon: <CalendarClock className={I} /> },
      { to: "/app/services/spark_audience_sync",   label: "Audience Sync",   description: "Outbound contact mirroring to Meta / Google / etc.",      icon: <Layers className={I} /> },
      { to: "/app/services/spark_saved_searches",  label: "Saved Searches",  description: "Persisted contact filters surfaced in the search box.",   icon: <Filter className={I} /> },
    ],
  },
  {
    heading: "API & integrations",
    tagline: "Keys, webhooks, inbound + outbound integrations.",
    tiles: [
      { to: "/app/services/spark_api_keys",            label: "API Keys",            description: "Issue and revoke tenant-scoped API keys.",                 icon: <Key className={I} /> },
      { to: "/app/services/spark_webhooks",            label: "Outbound Webhooks",   description: "Subscribe external systems to SPARK events.",              icon: <Webhook className={I} /> },
      { to: "/app/services/spark_webhook_deliveries",  label: "Webhook Deliveries",  description: "Per-attempt delivery log + retry / replay.",               icon: <Inbox className={I} /> },
      { to: "/app/services/spark_inbound_webhooks",    label: "Inbound Webhooks",    description: "URL endpoints that accept events FROM external systems.",  icon: <Webhook className={I} /> },
      { to: "/app/services/spark_calendar_sync",       label: "Calendar Sync",       description: "Push SPARK events into Google / Outlook calendars.",       icon: <CalendarClock className={I} /> },
      { to: "/app/services/spark_secrets",             label: "Tenant Secrets",      description: "Per-tenant OAuth + API credentials store.",                icon: <Shield className={I} /> },
      { to: "/app/services/spark_api_reference",       label: "API Reference",       description: "OpenAPI doc for the SPARK API.",                          icon: <BookOpen className={I} /> },
      { to: "/app/services/spark_engine_docs",         label: "Engine Docs",         description: "Internal notes on the SPARK send + automation engines.",   icon: <BookOpen className={I} /> },
    ],
  },
  {
    heading: "Ops & admin",
    tagline: "Approval flows, audit, backups, billing, diagnostics.",
    tiles: [
      { to: "/app/services/spark_approvals",       label: "Approvals",      description: "Workflow approvals before campaign / automation send.",       icon: <Shield className={I} /> },
      { to: "/app/services/spark_audit_log",       label: "Audit Log",      description: "Mutation log across every SPARK surface.",                    icon: <Database className={I} /> },
      { to: "/app/services/spark_config_backup",   label: "Config Backup",  description: "Export tenant config as a versioned snapshot for restore.",  icon: <Database className={I} /> },
      { to: "/app/pricing?product=spark",          label: "Plan & Pricing", description: "Tier comparison + change subscription tier.",                 icon: <DollarSign className={I} /> },
      { to: "/app/services/spark_usage",           label: "Usage",          description: "Caps + current burn against your tier limits.",               icon: <BarChart3 className={I} /> },
      { to: "/app/services/spark_smoke_test",      label: "Smoke Test",     description: "Founder-only end-to-end pipeline check (Brandon's tool).",    icon: <FlaskConical className={I} /> },
    ],
  },
];

export function SparkSettingsPage() {
  return (
    <OliverPageWrapper
      title="SPARK Settings"
      subtitle="Per-product configuration. Cross-product profile + billing live in the hamburger menu."
      error={null}
      loading={false}
    >
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FEC82C]/15 text-[#1A3A4A]">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#0B1C24]">SPARK Settings</h1>
            <p className="text-sm text-[#5B6B72]">
              Per-product configuration. Cross-product profile + billing live in the hamburger menu.
            </p>
          </div>
        </div>

        <div className="space-y-10">
          {GROUPS.map((g) => (
            <section key={g.heading}>
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#5B6B72]">{g.heading}</h2>
                <p className="text-xs text-[#9CA3AF]">{g.tagline}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.tiles.map((t) => (
                  <Link
                    key={t.to}
                    to={t.to}
                    className="group flex flex-col gap-2 rounded-lg border border-[#E5E7EB] bg-white p-4 transition-colors hover:border-[#FEC82C] hover:bg-[#FEC82C]/5"
                  >
                    <div className="flex items-center gap-2 text-[#1A3A4A]">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F3F4F6] text-[#1A3A4A] group-hover:bg-[#FEC82C]/20">
                        {t.icon}
                      </span>
                      <span className="text-sm font-medium">{t.label}</span>
                    </div>
                    <p className="text-xs leading-snug text-[#5B6B72]">{t.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </OliverPageWrapper>
  );
}
