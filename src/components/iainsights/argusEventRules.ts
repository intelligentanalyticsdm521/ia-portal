// argusEventRules — v9.4 ARGUS Trends rule libraries.
//
// Two libraries that derive observations from live argus.platform_events
// data (via platform-api /argus/automation-health + /argus/event-flow).

import { type InsightRule, fmt, pct } from "./insightRules";

// ════════════════════════════════════════════════════════════════════
// AUTOMATION HEALTH — derived from /argus/automation-health
// ════════════════════════════════════════════════════════════════════

export const ARGUS_AUTOMATION_HEALTH_RULES: InsightRule[] = [
  {
    id: "argus.auto.no_events",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.automation?.totals?.total || 0) === 0,
    observation: (c: any) => `No platform events recorded this period. ARGUS is the event bus between products — if it's empty, either no products are firing events or the iadm-webhooks pipeline isn't connected. Check Settings → Connected Accounts and the recent webhook deliveries.`,
    action: () => `Verify the iadm-webhooks function app is healthy and configured to deliver events to argus.platform_events. A simple SPARK form submission or OLIVER job-status change should generate an event.`,
  },
  {
    id: "argus.auto.event_volume",
    category: "volume",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.automation?.totals?.total || 0) > 0,
    observation: (c: any) => {
      const total = Number(c.automation?.totals?.total || 0);
      const days = Number(c.automation?.range?.days || 30);
      const perDay = total / Math.max(days, 1);
      return `${fmt(total)} platform events processed over ${days} days (~${perDay.toFixed(1)}/day). Event volume is the heartbeat of cross-product automation.`;
    },
  },
  {
    id: "argus.auto.success_rate",
    category: "reliability",
    kind: "observation",
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => c.automation?.success_rate != null,
    observation: (c: any) => {
      const rate = Number(c.automation?.success_rate || 0);
      const processed = Number(c.automation?.totals?.processed || 0);
      const failed = Number(c.automation?.totals?.failed || 0);
      if (rate < 0.9) return `Event processing success rate is ${pct(rate)} (${fmt(processed)} processed of ${fmt(processed + failed)} terminal). Below 90% indicates persistent failures — investigate the error_detail column of failed events.`;
      if (rate < 0.98) return `Event processing success rate is ${pct(rate)} — healthy. A small failure rate is normal; spot-check the top failure modes weekly.`;
      return `Event processing success rate is ${pct(rate)} — excellent. Cross-product automation is reliable.`;
    },
  },
  {
    id: "argus.auto.failures_present",
    category: "reliability",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.automation?.totals?.failed || 0) >= 3,
    observation: (c: any) => {
      const failed = Number(c.automation?.totals?.failed || 0);
      return `${fmt(failed)} events failed processing this period. Each failure is a downstream side-effect that didn't happen — form-submission → contact creation, job-completion → invoice trigger, etc.`;
    },
    action: () => `Review the failed events in argus.platform_events (SELECT TOP 20 event_type, error_detail FROM argus.platform_events WHERE status='failed' ORDER BY created_at DESC). Pattern-match the errors and fix systemically.`,
  },
  {
    id: "argus.auto.stuck_pending",
    category: "reliability",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.automation?.totals?.stuck_pending || 0) > 0,
    observation: (c: any) => {
      const stuck = Number(c.automation?.totals?.stuck_pending || 0);
      return `${fmt(stuck)} event${stuck === 1 ? "" : "s"} stuck in 'pending' status for over 1 hour. The processor function isn't picking them up — either the timer isn't firing, the function is erroring on dequeue, or the connection string is broken.`;
    },
    action: () => `Check the Azure Function App logs for arion-event-processor. Re-deploy if the timer trigger isn't firing. A healthy processor drains pending events within 5-15 minutes of insertion.`,
  },
  {
    id: "argus.auto.latency_high",
    category: "latency",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.automation?.avg_latency_sec || 0) > 600,
    observation: (c: any) => {
      const latency = Number(c.automation?.avg_latency_sec || 0);
      return `Average event-processing latency is ${(latency / 60).toFixed(1)} minutes from insertion to processed. High latency suggests the processor is keeping up with volume but running batches infrequently — fine for non-time-sensitive flows, problematic for real-time UX.`;
    },
    action: () => `Increase the processor's timer frequency from every 5 minutes → every 1-2 minutes if real-time event handoff matters for the UX.`,
  },
  {
    id: "argus.auto.latency_healthy",
    category: "latency",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const latency = Number(c.automation?.avg_latency_sec || 0);
      return latency > 0 && latency < 120;
    },
    observation: (c: any) => {
      const latency = Number(c.automation?.avg_latency_sec || 0);
      return `Average event-processing latency is ${latency.toFixed(0)} seconds — fast. The processor is keeping up with volume and downstream side-effects fire near-real-time.`;
    },
  },
  {
    id: "argus.auto.pending_buildup",
    category: "throughput",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const pending = Number(c.automation?.totals?.pending || 0);
      const stuck = Number(c.automation?.totals?.stuck_pending || 0);
      return pending > stuck && pending > 5;
    },
    observation: (c: any) => {
      const pending = Number(c.automation?.totals?.pending || 0);
      const stuck = Number(c.automation?.totals?.stuck_pending || 0);
      const fresh = pending - stuck;
      return `${fmt(fresh)} events are pending but recent (< 1 hour old). Normal queue depth — the processor is working through the backlog.`;
    },
  },
];

// ════════════════════════════════════════════════════════════════════
// EVENT FLOW — derived from /argus/event-flow
// ════════════════════════════════════════════════════════════════════

export const ARGUS_EVENT_FLOW_RULES: InsightRule[] = [
  {
    id: "argus.flow.no_events",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.flow?.total_events || 0) === 0,
    observation: () => `No platform events flowing this period. Event Flow visualises which products talk to which — if it's empty, cross-product automation isn't happening (or no products are configured to fire events).`,
    action: () => `Run a quick test: submit a SPARK form, change a job status in OLIVER, or trigger a webhook from ARION. The corresponding event should appear in argus.platform_events within minutes.`,
  },
  {
    id: "argus.flow.volume_headline",
    category: "volume",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.flow?.total_events || 0) > 0,
    observation: (c: any) => {
      const total = Number(c.flow?.total_events || 0);
      const perDay = Number(c.flow?.events_per_day || 0);
      return `${fmt(total)} events across ${(c.flow?.by_event_type || []).length} event types · ${perDay.toFixed(1)} events/day average.`;
    },
  },
  {
    id: "argus.flow.top_event_type",
    category: "leadership",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Array.isArray(c.flow?.by_event_type) && c.flow.by_event_type.length > 0,
    observation: (c: any) => {
      const types = c.flow?.by_event_type || [];
      const top = types[0];
      const total = Number(c.flow?.total_events || 0);
      const share = total > 0 ? Number(top.n) / total : 0;
      return `Most common event: \`${top.event_type}\` at ${fmt(Number(top.n))} occurrences (${pct(share)} of all events). This is the dominant cross-product handoff in your tenant.`;
    },
  },
  {
    id: "argus.flow.source_concentration",
    category: "structure",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Array.isArray(c.flow?.by_source_product) && c.flow.by_source_product.length > 0,
    observation: (c: any) => {
      const sources = c.flow?.by_source_product || [];
      const total = Number(c.flow?.total_events || 0);
      const top = sources[0];
      const share = total > 0 ? Number(top.n) / total : 0;
      if (share > 0.7) return `${pct(share)} of events originate from ${top.source}. The other products are largely passive consumers — cross-product automation is currently one-directional.`;
      if (sources.length === 1) return `All events originate from ${top.source}. Other products aren't firing into ARGUS yet — either they're not configured or no triggering activity has happened.`;
      return `Events originate from ${sources.length} different source products: ${sources.map((s: any) => `${s.source} (${fmt(s.n)})`).join(", ")}. Multi-directional automation is active.`;
    },
  },
  {
    id: "argus.flow.single_product",
    category: "structure",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const sources = c.flow?.by_source_product || [];
      const total = Number(c.flow?.total_events || 0);
      return total > 10 && sources.length === 1;
    },
    observation: () => `Only one product is producing events. ARGUS is fundamentally cross-platform — the value compounds when at least 2 products are firing into it. Connect a second product to unlock cross-platform intelligence.`,
    action: () => `Activate a second product (SPARK or OLIVER). Once events flow from a second source, the cross-platform reports + Business Pulse composite become meaningful.`,
  },
  {
    id: "argus.flow.event_diversity",
    category: "structure",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.flow?.by_event_type) && c.flow.by_event_type.length >= 5,
    observation: (c: any) => {
      const n = (c.flow?.by_event_type || []).length;
      return `${n} distinct event types in use. Diverse event vocabulary suggests rich product instrumentation; each event type is a potential automation hook for SPARK workflows.`;
    },
  },
  {
    id: "argus.flow.daily_pattern",
    category: "trend",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.flow?.daily_series) && c.flow.daily_series.length >= 7,
    observation: (c: any) => {
      const series = c.flow?.daily_series || [];
      const half = Math.floor(series.length / 2);
      const firstHalf = series.slice(0, half).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const secondHalf = series.slice(half).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      if (firstHalf === 0) return "";
      const change = ((secondHalf - firstHalf) / firstHalf) * 100;
      if (change > 25) return `Event volume grew ${Math.round(change)}% over the second half of the period — more cross-product activity. Either you've added a product, or existing products are firing more events.`;
      if (change < -25) return `Event volume dropped ${Math.abs(Math.round(change))}% over the second half of the period. Either intentional (a product paused) or a regression — verify each source is still firing events.`;
      return `Event volume is stable across the period — predictable cross-product automation.`;
    },
  },
  {
    id: "argus.flow.few_events",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const total = Number(c.flow?.total_events || 0);
      return total > 0 && total < 20;
    },
    observation: (c: any) => `${Number(c.flow?.total_events)} events total — small sample. Patterns observed here are directional; statistically meaningful event-flow analysis requires 100+ events/period.`,
  },
];
