// derivedTours.ts — #256 (LOCKED 2026-07-04)
//
// Comprehensive per-platform tours generated from the live SUB_NAV_CONFIGS
// in SubNav.tsx. Every nav group + every item = one tour step. Section
// keys come from group.sectionId so the launcher can slice by section.
//
// Why derive instead of hand-writing? Hand-written selectors go stale
// every time nav is refactored (which is exactly why Brandon saw
// "grey screen, no popups, flips through pages" — half the hardcoded
// selectors no longer matched the current DOM). Deriving from the same
// config the NavLinks render from means the selectors ALWAYS match.
//
// Selector convention: NavLink emits <a href="{route}">. We target
// a[href="{route}"] which is stable across every Portal refactor.

import { SUB_NAV_CONFIGS, type SubNavConfig, type SubNavGroup, type SubNavItem } from "./SubNav";
import type { TourDef, TourStep } from "./GuidedTour";
import type { ProductKey } from "./IconRail";

const PRODUCT_ACCENTS: Partial<Record<ProductKey, string>> = {
  oliver: "#FEC82C",
  spark: "#EF6C33",
  arion: "#2D9CDB",
  consulting: "#8B5CF6",
  stella: "#10B981",
  argus: "#0B1C24",
  settings: "#64748B",
};

/**
 * Convert one nav item into a tour step that highlights the NavLink for
 * that route. Placement = right so the tooltip sits beside the left-side
 * SubNav.
 */
function stepFromItem(item: SubNavItem, group: SubNavGroup, product: string): TourStep & { section?: string; sectionLabel?: string } {
  const sectionId = group.sectionId || group.label || "general";
  const sectionLabel = group.label || "General";
  const bodyPrefix = sectionLabel ? `${sectionLabel} · ` : "";
  return {
    targetSelector: `a[href="${item.route}"]`,
    route: item.route,
    title: item.label,
    body: `${bodyPrefix}${describeItem(product, item)}`,
    placement: "right",
    waitMs: 250,
    section: sectionId,
    sectionLabel,
  };
}

/**
 * Short human-readable description per known nav item. Falls back to a
 * generic "opens the {label} page." when we don't have a hand-written
 * blurb. Add entries here as pages get proper first-visit copy.
 */
function describeItem(product: string, item: SubNavItem): string {
  const key = item.key;
  const fallback = `Opens the ${item.label} page.`;
  const OLIVER_MAP: Record<string, string> = {
    oliver_dashboard: "Live KPIs — jobs in progress, revenue this month, workers on the clock, upcoming schedule.",
    oliver_contacts: "Your OLIVER customers — everyone you're billing, quoting, or scheduling jobs for.",
    oliver_service_requests: "Inbound service asks: booking-page submissions, contact-form leads, phone-log entries.",
    oliver_booking: "Configure your customer-facing booking page — services, availability, price visibility.",
    oliver_job_board: "The 5-bucket Kanban for every job — Quotes → Scheduled → In Progress → Completed → Closed.",
    oliver_schedule: "Calendar view of jobs + technician availability + drag-to-reschedule.",
    oliver_jobs_archive: "Read-only history of closed jobs — filter by client, worker, date range.",
    oliver_catalog: "Products & services you sell — pricing, tax, duration, worker skill mapping.",
    oliver_categories: "Product taxonomy — how services group in your catalog + booking page.",
    oliver_service_categories: "Worker-skill taxonomy — separate from product categories; drives auto-assign.",
    oliver_coupons: "Discount codes syncing to Stripe — line-item, per-invoice, or subscription-level.",
    oliver_quotes: "Quotes & proposals — draft, send, watch for acceptance, promote to invoice.",
    oliver_proposal_templates: "Reusable proposal skeletons so you're not rewriting the same scope every quote.",
    oliver_invoices: "Invoices — draft, send, receive payment, track outstanding balance.",
    oliver_recurring: "Subscription-billing customers — pause, resume, reschedule next charge.",
    oliver_payments: "Every payment received — refund, dispute, receipt lookup.",
    oliver_templates: "Email, SMS, and document templates OLIVER sends automatically.",
    oliver_workers: "Your crew — availability, territories, skills, portal invitations.",
    oliver_crew_performance: "Per-worker scorecard — jobs completed, on-time %, repeat-customer rate.",
    oliver_automations: "Event-driven rules — when X happens, do Y.",
    oliver_addons: "Optional add-on services surfaced during checkout / booking.",
    oliver_portals_hub: "Customer + Crew portal domains, branding, custom domains.",
    oliver_workflow_settings: "Post-booking + reschedule + signup-form + notification policy.",
    oliver_ia_insights_health: "How your OLIVER data-flow health looks right now — coverage, integrations, completeness.",
    oliver_ia_insights_trends: "How the key OLIVER metrics are trending over time.",
    oliver_ia_insights_intelligence: "Deep-analysis reports — churn risk, upsell candidates, capacity utilization.",
    oliver_reports: "Standard OLIVER reports — sales, receivables, job margin, worker productivity.",
    oliver_activity_log: "Audit trail — every edit, delete, send, and payment recorded.",
  };
  const SPARK_MAP: Record<string, string> = {
    spark_dashboard: "SPARK CRM overview — pipeline, engagement, upcoming campaign sends.",
    spark_contacts: "Your CRM contacts — one row per person, tagged and segmented for outreach.",
    spark_accounts: "Companies — grouping of contacts under one business entity.",
    spark_lists: "Static + dynamic lists for campaign targeting.",
    spark_segments: "Rules-based audience segments — updated as contact data changes.",
    spark_leadgen: "Prospect discovery — search + verify + score new potential contacts.",
    spark_campaigns: "Email and SMS campaign composer, sender, and analytics.",
    spark_templates: "Reusable email + SMS template library.",
    spark_automations: "Trigger-based sequences — welcome, re-engagement, birthday, custom.",
  };
  const ARION_MAP: Record<string, string> = {
    arion_dashboard: "ARION overview — site health, content freshness, SEO score, integrations status.",
    arion_website: "Your live WordPress site — pages, blocks, and inline editors.",
    arion_hosting: "Hostinger integration + WP admin access + DNS + SSL status.",
    arion_security: "Shield Security scans, PSI performance snapshots, uptime.",
    arion_seo: "SE Ranking-powered SEO — keywords, competitors, audit, content briefs.",
    arion_analytics: "GA4 + GSC dashboards + IA Insights scoring.",
  };
  const CONSULTING_MAP: Record<string, string> = {
    consulting_dashboard: "Consulting hub — active projects, milestone state, upcoming payment triggers.",
    consulting_projects: "Every consulting.project — filter by client, status, milestone.",
    consulting_service_requests: "Client-side inbound requests before they become projects.",
    consulting_deliverables: "Every deliverable across every project — approve, request revisions, mark paid.",
    consulting_clients: "Your active client tenants — jump into their portal via Access Portal.",
    consulting_document_library: "Master library of onboarding forms, contracts, deliverable templates.",
    consulting_onboard_client: "Wizard to onboard a new client end-to-end.",
    consulting_tickets: "Support tickets your consulting clients raised.",
    consulting_intake_form: "Client-side intake questionnaire builder.",
  };
  const map =
    product === "OLIVER" ? OLIVER_MAP :
    product === "SPARK" ? SPARK_MAP :
    product === "ARION" ? ARION_MAP :
    product === "Consulting" ? CONSULTING_MAP :
    {};
  return map[key] || fallback;
}

/**
 * Generate a comprehensive TourDef from a SubNavConfig. Every group +
 * every item produces one step. Section metadata is appended to each
 * step so the launcher can slice into per-section sub-tours.
 */
function tourFromConfig(productKey: string, cfg: SubNavConfig): TourDef {
  const steps: TourStep[] = [];
  // Hero intro step — no target, centered
  steps.push({
    title: `${cfg.productName} — Full Tour`,
    body: `${cfg.tagline}. We'll walk every section from top to bottom. Click Next to start, or Skip anytime.`,
    placement: "center",
  });
  for (const group of cfg.groups) {
    if (group.label) {
      // Group intro step — highlight the SubNav group header
      steps.push({
        targetSelector: `[data-subnav-group="${group.sectionId || group.label}"]`,
        title: group.label,
        body: `${cfg.productName} > ${group.label} — ${group.items.length} page${group.items.length === 1 ? "" : "s"} in this section.`,
        placement: "right",
        waitMs: 250,
        // @ts-expect-error TourStep type doesn't declare section — appended for slicer
        section: group.sectionId || group.label,
        sectionLabel: group.label,
      });
    }
    for (const item of group.items) {
      steps.push(stepFromItem(item, group, cfg.productName));
    }
  }
  return {
    id: `${productKey.toLowerCase()}_full_v2`,
    title: `${cfg.productName} — Full Tour`,
    accent: PRODUCT_ACCENTS[productKey as ProductKey],
    steps,
  };
}

/** Build tours for every product that has a nav config. */
export function buildAllDerivedTours(): TourDef[] {
  const out: TourDef[] = [];
  for (const [key, cfg] of Object.entries(SUB_NAV_CONFIGS)) {
    if (!cfg) continue;
    // ProductKey type doesn't include "settings" as a tour-worthy product;
    // skip it here — Settings gets its own separate walkthrough elsewhere.
    if (key === "settings") continue;
    out.push(tourFromConfig(key, cfg));
  }
  return out;
}

/**
 * Section index for a tour — returns the distinct sections in order of
 * first appearance. Used by the section launcher.
 */
export interface TourSection {
  key: string;
  label: string;
  firstStepIdx: number;
  lastStepIdx: number;
  stepCount: number;
}
export function indexSections(tour: TourDef): TourSection[] {
  const map = new Map<string, TourSection>();
  const order: string[] = [];
  tour.steps.forEach((s, i) => {
    // @ts-expect-error section is appended dynamically
    const key = s.section as string | undefined;
    if (!key) return;
    if (!map.has(key)) {
      // @ts-expect-error sectionLabel is appended dynamically
      const label = (s.sectionLabel as string) || key;
      map.set(key, { key, label, firstStepIdx: i, lastStepIdx: i, stepCount: 1 });
      order.push(key);
    } else {
      const s0 = map.get(key)!;
      s0.lastStepIdx = i;
      s0.stepCount += 1;
    }
  });
  return order.map((k) => map.get(k)!);
}

/**
 * Slice a tour to just the steps in one section. Prepends an intro step so
 * the user always sees the section label first, and drops all steps
 * outside the target section's [first, last] range.
 */
export function sliceTourToSection(tour: TourDef, sectionKey: string): TourDef | null {
  const sections = indexSections(tour);
  const s = sections.find((x) => x.key === sectionKey);
  if (!s) return null;
  const sliced = tour.steps.slice(s.firstStepIdx, s.lastStepIdx + 1);
  return {
    id: `${tour.id}__${sectionKey}`,
    title: `${tour.title.replace(" — Full Tour", "")} — ${s.label}`,
    accent: tour.accent,
    steps: sliced,
  };
}
