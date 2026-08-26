/**
 * forgeConfig.ts — column/field configuration per HESTIA entity.
 *
 * One config drives the list grid, the filters and the create/edit form for
 * every entity. Adding a screen is an entry here, not a new component — the
 * same idea the legacy app used, kept because it was the right one.
 */
import type { EntityKey } from '../../lib/forgeApi';
import { screenRoute } from './forgeSoftware';

export type FieldType = 'text' | 'longtext' | 'date' | 'money' | 'number' | 'lookup' | 'entity';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  lookup?: string;          // lookup type_key when type === 'lookup'
  entity?: EntityKey;       // referenced entity when type === 'entity'
  displayKey?: string;      // joined display column for entity refs
  inList?: boolean;
  inForm?: boolean;
  required?: boolean;
  width?: string;
}

export interface EntityConfig {
  key: EntityKey;
  title: string;
  singular: string;
  subtitle: string;
  pk: string;
  primaryField: string;
  detailRoute?: (id: string | number) => string;
  /**
   * Child records to show on this record's page. Declared here rather than
   * written per entity, so ForgeRecordPage stays ONE component: a client
   * shows their assistance and services, a provider shows what it delivers,
   * a funder shows its applications.
   */
  related?: Array<{ entity: EntityKey; foreignKey: string; title: string }>;
  fields: FieldDef[];
}

const f = (
  key: string, label: string, type: FieldType = 'text', extra: Partial<FieldDef> = {}
): FieldDef => ({ key, label, type, inList: true, inForm: true, ...extra });

export const FORGE_ENTITIES: Record<EntityKey, EntityConfig> = {
  clients: {
    key: 'clients',
    title: 'Clients',
    singular: 'Client',
    subtitle: 'People your organization serves.',
    pk: 'client_id',
    primaryField: 'full_name',
    related: [{ entity: 'assistance', foreignKey: 'client_id', title: 'Assistance' }, { entity: 'services', foreignKey: 'client_id', title: 'Services' }],
    detailRoute: (id) => screenRoute('hestia', `clients/${id}`),
    fields: [
      f('full_name', 'Name', 'text', { required: true, width: 'w-64' }),
      f('phone', 'Phone'),
      f('email', 'Email'),
      f('city', 'City'),
      f('county', 'County'),
      f('state_province', 'State', 'text', { inList: false }),
      f('street', 'Street', 'text', { inList: false }),
      f('postal_code', 'ZIP', 'text', { inList: false }),
      f('additional_names', 'Additional names', 'text', { inList: false }),
    ],
  },

  assistance: {
    key: 'assistance',
    title: 'Assistance',
    singular: 'Assistance',
    subtitle: 'Financial assistance committed to a client over a period.',
    pk: 'assistance_id',
    primaryField: 'client_name',
    related: [{ entity: 'services', foreignKey: 'assistance_id', title: 'Services delivered' }],
    detailRoute: (id) => screenRoute('hestia', `assistance/${id}`),
    fields: [
      f('client_id', 'Client', 'entity', { entity: 'clients', displayKey: 'client_name', required: true, width: 'w-56' }),
      f('status', 'Status', 'lookup', { lookup: 'assistance_status' }),
      f('start_date', 'Start', 'date'),
      f('end_date', 'End', 'date'),
      f('value_amount', 'Value', 'money'),
      f('gl_reference', 'GL ref'),
      f('referral_source', 'Referral source', 'text', { inList: false }),
    ],
  },

  services: {
    key: 'services',
    title: 'Services',
    singular: 'Service',
    subtitle: 'A client receiving a service from a provider, paid from their assistance.',
    pk: 'service_id',
    primaryField: 'client_name',
    detailRoute: (id) => screenRoute('hestia', `services/${id}`),
    fields: [
      f('client_id', 'Client', 'entity', { entity: 'clients', displayKey: 'client_name', required: true, width: 'w-52' }),
      f('provider_id', 'Provider', 'entity', { entity: 'providers', displayKey: 'provider_name', width: 'w-52' }),
      f('assistance_id', 'Assistance', 'entity', { entity: 'assistance', displayKey: 'assistance_reference', inList: false }),
      f('status', 'Status', 'lookup', { lookup: 'service_status' }),
      f('service_type', 'Type', 'lookup', { lookup: 'service_type' }),
      f('start_date', 'Start', 'date'),
      f('end_date', 'End', 'date'),
      f('payment_method', 'Payment method', 'lookup', { lookup: 'payment_method' }),
      f('payment_frequency', 'Frequency', 'lookup', { lookup: 'payment_frequency' }),
      f('estimated_monthly_cost', 'Est. monthly', 'money'),
      // Not shown in the grid or the form, but declared so it can be FILTERED:
      // the overview's "Needs review" tile links to ?needs_review=1 and the
      // list only accepts query keys the entity declares.
      f('needs_review', 'Needs review', 'number', { inList: false, inForm: false }),
    ],
  },

  providers: {
    key: 'providers',
    title: 'Providers',
    singular: 'Provider',
    subtitle: 'Vendors delivering services to clients.',
    pk: 'provider_id',
    primaryField: 'name',
    related: [{ entity: 'services', foreignKey: 'provider_id', title: 'Services delivered' }],
    detailRoute: (id) => screenRoute('hestia', `providers/${id}`),
    fields: [
      f('name', 'Name', 'text', { required: true, width: 'w-56' }),
      f('provider_type', 'Type', 'lookup', { lookup: 'provider_type' }),
      f('city', 'City'),
      f('primary_contact', 'Contact'),
      f('primary_phone', 'Phone'),
      f('primary_email', 'Email', 'text', { inList: false }),
      f('website', 'Website', 'text', { inList: false }),
      f('street', 'Street', 'text', { inList: false }),
      f('state_province', 'State', 'text', { inList: false }),
      f('postal_code', 'ZIP', 'text', { inList: false }),
      f('county', 'County', 'text', { inList: false }),
      f('secondary_contact', 'Secondary contact', 'text', { inList: false }),
      f('secondary_phone', 'Secondary phone', 'text', { inList: false }),
      f('secondary_email', 'Secondary email', 'text', { inList: false }),
      f('options_text', 'Options', 'longtext', { inList: false }),
    ],
  },

  funders: {
    key: 'funders',
    title: 'Funders',
    singular: 'Funder',
    subtitle: 'Foundations and grantors your organization applies to.',
    pk: 'funder_id',
    primaryField: 'name',
    related: [{ entity: 'applications', foreignKey: 'funder_id', title: 'Funding applications' }],
    detailRoute: (id) => screenRoute('hestia', `funders/${id}`),
    fields: [
      f('name', 'Name', 'text', { required: true, width: 'w-56' }),
      f('primary_contact', 'Contact'),
      f('primary_email', 'Email'),
      f('apply_deadline', 'Deadline'),
      f('grant_max', 'Grant max', 'money'),
      f('primary_phone', 'Phone', 'text', { inList: false }),
      f('website', 'Website', 'text', { inList: false }),
      f('individuals_served', 'Individuals served', 'longtext', { inList: false }),
      f('area_served', 'Area served', 'longtext', { inList: false }),
      f('services_provided', 'Services provided', 'longtext', { inList: false }),
      f('other_notes', 'Other', 'longtext', { inList: false }),
    ],
  },

  applications: {
    key: 'applications',
    title: 'Funding Applications',
    singular: 'Application',
    subtitle: 'Applications your organization has made to funders.',
    pk: 'application_id',
    primaryField: 'funder_name',
    detailRoute: (id) => screenRoute('hestia', `applications/${id}`),
    fields: [
      f('funder_id', 'Funder', 'entity', { entity: 'funders', displayKey: 'funder_name', width: 'w-52' }),
      f('applied_date', 'Applied', 'date'),
      f('decision_type', 'Decision', 'lookup', { lookup: 'decision_type' }),
      f('decision_date', 'Decided', 'date'),
      f('amount_applied_for', 'Applied for', 'money'),
      f('amount_awarded', 'Awarded', 'money'),
      f('money_received_date', 'Received', 'date'),
      f('reporting_due_date', 'Reporting due', 'date'),
      f('stipulations', 'Stipulations', 'longtext', { inList: false }),
    ],
  },

  volunteers: {
    key: 'volunteers',
    title: 'Volunteers',
    singular: 'Volunteer',
    subtitle: 'People who give their time.',
    pk: 'volunteer_id',
    primaryField: 'name',
    detailRoute: (id) => screenRoute('hestia', `volunteers/${id}`),
    fields: [
      f('name', 'Name', 'text', { required: true, width: 'w-56' }),
      f('status', 'Status', 'lookup', { lookup: 'volunteer_status' }),
      f('phone', 'Phone'),
      f('email', 'Email'),
    ],
  },

  /* ---------- Phase 2 ---------- */

  people: {
    key: 'people',
    title: 'People',
    singular: 'Person',
    subtitle: 'One record per person or organization — donor, volunteer, board member, or someone you serve.',
    pk: 'person_id',
    primaryField: 'full_name',
    related: [{ entity: 'donations', foreignKey: 'person_id', title: 'Donations' }, { entity: 'pledges', foreignKey: 'person_id', title: 'Pledges' }],
    detailRoute: (id) => screenRoute('hestia', `people/${id}`),
    fields: [
      f('full_name', 'Name', 'text', { required: true, width: 'w-64' }),
      f('organization', 'Organization'),
      f('email', 'Email'),
      f('phone', 'Phone'),
      f('city', 'City'),
      f('state_province', 'State', 'text', { inList: false }),
      f('street', 'Street', 'text', { inList: false }),
      f('postal_code', 'ZIP', 'text', { inList: false }),
      f('county', 'County', 'text', { inList: false }),
      f('additional_names', 'Additional names', 'text', { inList: false }),
    ],
  },

  donations: {
    key: 'donations',
    title: 'Donations',
    singular: 'Donation',
    subtitle: 'Every gift received, with what is deductible and where it was designated.',
    pk: 'donation_id',
    primaryField: 'donor_name',
    detailRoute: (id) => screenRoute('hestia', `donations/${id}`),
    fields: [
      f('person_id', 'Donor', 'entity', { entity: 'people', displayKey: 'donor_name', required: true, width: 'w-56' }),
      f('received_on', 'Received', 'date', { required: true }),
      f('amount', 'Amount', 'money'),
      // Read-only in the form: the database computes it, so a form that let
      // someone type it would be offering to be wrong.
      f('deductible_amount', 'Deductible', 'money', { inForm: false }),
      f('campaign_id', 'Campaign', 'entity', { entity: 'campaigns', displayKey: 'campaign_name', width: 'w-48' }),
      f('payment_method', 'Method', 'lookup', { lookup: 'payment_method' }),
      f('status', 'Status', 'lookup', { lookup: 'donation_status' }),
      f('non_deductible_value', 'Value received back', 'money', { inList: false }),
      f('gift_kind', 'Gift kind', 'lookup', { lookup: 'gift_kind', inList: false }),
      f('in_kind_description', 'In-kind description', 'longtext', { inList: false }),
      f('check_number', 'Check number', 'text', { inList: false }),
      f('processor_fee', 'Processing fee', 'money', { inList: false }),
      f('notes', 'Notes', 'longtext', { inList: false }),
    ],
  },

  campaigns: {
    key: 'campaigns',
    title: 'Campaigns',
    singular: 'Campaign',
    subtitle: 'Appeals and events — what you asked for, what it cost, what came in.',
    pk: 'campaign_id',
    primaryField: 'name',
    related: [{ entity: 'donations', foreignKey: 'campaign_id', title: 'Donations' }],
    detailRoute: (id) => screenRoute('hestia', `campaigns/${id}`),
    fields: [
      f('name', 'Name', 'text', { required: true, width: 'w-56' }),
      f('campaign_type', 'Type', 'lookup', { lookup: 'campaign_type' }),
      f('channel', 'Channel', 'lookup', { lookup: 'campaign_channel' }),
      f('start_date', 'Start', 'date'),
      f('end_date', 'End', 'date'),
      f('goal_amount', 'Goal', 'money'),
      f('cost_amount', 'Cost', 'money'),
      f('fund_id', 'Default fund', 'entity', { entity: 'funds', displayKey: 'fund_name', inList: false }),
      f('code', 'Code', 'text', { inList: false }),
    ],
  },

  funds: {
    key: 'funds',
    title: 'Funds',
    singular: 'Fund',
    subtitle: 'Where gifts are designated, and whether the donor restricted them.',
    pk: 'fund_id',
    primaryField: 'name',
    related: [{ entity: 'donations', foreignKey: 'fund_id', title: 'Donations' }],
    detailRoute: (id) => screenRoute('hestia', `funds/${id}`),
    fields: [
      f('name', 'Name', 'text', { required: true, width: 'w-56' }),
      f('code', 'Code'),
      f('restriction', 'Restriction', 'lookup', { lookup: 'fund_restriction' }),
      f('purpose', 'Purpose', 'longtext'),
    ],
  },

  pledges: {
    key: 'pledges',
    title: 'Pledges',
    singular: 'Pledge',
    subtitle: 'Promises to give, and how much of each is still outstanding.',
    pk: 'pledge_id',
    primaryField: 'donor_name',
    detailRoute: (id) => screenRoute('hestia', `pledges/${id}`),
    fields: [
      f('person_id', 'Donor', 'entity', { entity: 'people', displayKey: 'donor_name', required: true, width: 'w-56' }),
      f('total_amount', 'Pledged', 'money'),
      f('pledged_on', 'Pledged on', 'date'),
      f('due_by', 'Due by', 'date'),
      f('status', 'Status', 'lookup', { lookup: 'pledge_status' }),
      f('campaign_id', 'Campaign', 'entity', { entity: 'campaigns', displayKey: 'campaign_name', width: 'w-48' }),
      f('fund_id', 'Fund', 'entity', { entity: 'funds', inList: false }),
      f('notes', 'Notes', 'longtext', { inList: false }),
    ],
  },

  recurring: {
    key: 'recurring',
    title: 'Recurring Gifts',
    singular: 'Recurring Gift',
    subtitle: 'Standing gifts, when each next runs, and which ones have failed.',
    pk: 'recurring_gift_id',
    primaryField: 'donor_name',
    detailRoute: (id) => screenRoute('hestia', `recurring/${id}`),
    fields: [
      f('person_id', 'Donor', 'entity', { entity: 'people', displayKey: 'donor_name', required: true, width: 'w-56' }),
      f('amount', 'Amount', 'money'),
      f('frequency', 'Frequency', 'lookup', { lookup: 'recurring_frequency' }),
      f('status', 'Status', 'lookup', { lookup: 'recurring_status' }),
      f('next_run_on', 'Next run', 'date'),
      f('started_on', 'Started', 'date'),
      f('ended_on', 'Ended', 'date', { inList: false }),
      f('fund_id', 'Fund', 'entity', { entity: 'funds', inList: false }),
      f('campaign_id', 'Campaign', 'entity', { entity: 'campaigns', inList: false }),
    ],
  },

  relationships: {
    key: 'relationships',
    title: 'Relationships',
    singular: 'Relationship',
    subtitle: 'People connected to a client.',
    pk: 'relationship_id',
    primaryField: 'related_name',
    fields: [
      f('client_id', 'Client', 'entity', { entity: 'clients', required: true }),
      f('related_name', 'Related person', 'text', { required: true }),
      f('relationship', 'Relationship'),
    ],
  },
};

/**
 * Lookup values are stored lower_snake_case so that a value picked in the UI is
 * byte-identical to the value every report and every CHECK constraint tests
 * against. That is right for storage and wrong for a dropdown, so the label —
 * and only the label — is turned back into English here.
 */
const ACRONYMS: Record<string, string> = { ach: 'ACH', ein: 'EIN', sms: 'SMS' };

export const humanizeValue = (v: string) => {
  // Only touch values that are clearly machine identifiers. A value someone
  // typed themselves ("Bathroom modification", "Approved") is left exactly as
  // they typed it — this is a display nicety, not an editor.
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(v)) return v;
  if (ACRONYMS[v]) return ACRONYMS[v];
  return v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

export const money = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
        .format(Number(v));

export const moneyExact = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));

/**
 * Calendar dates (start/end of an assistance period, a service, an application
 * deadline) are DATE columns — they carry no time and no zone. SQL Server sends
 * them as midnight UTC, so rendering with the browser's local zone pushed every
 * one of them back a day west of Greenwich: an assistance running 1 Jan–31 Dec
 * displayed as 31 Dec–30 Dec. Format in UTC so a calendar date reads as the
 * calendar date that was entered.
 */
export const shortDate = (v: unknown) => {
  if (!v) return '—';
  const raw = String(v);
  // Plain YYYY-MM-DD needs no parsing at all.
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = plain ? new Date(Date.UTC(+plain[1], +plain[2] - 1, +plain[3])) : new Date(raw);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export const cellValue = (row: Record<string, unknown>, field: FieldDef) => {
  if (field.type === 'entity' && field.displayKey) return (row[field.displayKey] as string) || '—';
  const v = row[field.key];
  if (v === null || v === undefined || v === '') return '—';
  if (field.type === 'money') return money(v);
  if (field.type === 'date') return shortDate(v);
  return String(v);
};
