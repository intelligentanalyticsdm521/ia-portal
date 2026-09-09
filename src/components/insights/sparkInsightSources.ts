/**
 * What actually produces a SPARK insight number, in the owner's words, with the
 * page that does it.
 *
 * Written once and shared by the three SPARK insight pages' empty states, because
 * "no data" is a dead end — a client reads it as "this product does not work" —
 * and three different lists of half-remembered causes would drift.
 *
 * Every route here is a real registered service key; the Portal suite asserts it.
 */
import type { InsightsSource } from './InsightsStateView';

export const SPARK_INSIGHT_SOURCES: InsightsSource[] = [
  {
    label: 'Contacts',
    to: '/app/services/spark_contacts',
    why: 'People. List size, growth and how much we know about each one is most of the contact-health score.',
  },
  {
    label: 'Lead Inbox',
    to: '/app/services/spark_lead_inbox',
    why: 'Inquiries. Where they came from, how fast they were answered and which became work.',
  },
  {
    label: 'Campaigns',
    to: '/app/services/spark_campaigns',
    why: 'Sends. Opens, clicks and replies only exist once something has gone out.',
  },
  {
    label: 'Lead sources',
    to: '/app/services/spark_lead_sources',
    why: 'Connect a website form or switch web chat on and inquiries start arriving on their own.',
  },
];
