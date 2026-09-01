/**
 * forgeConfig.ts — column/field configuration per HESTIA entity.
 *
 * One config drives the list grid, the filters and the create/edit form for
 * every entity. Adding a screen is an entry here, not a new component — the
 * same idea the legacy app used, kept because it was the right one.
 */
import type { EntityKey } from '../../lib/forgeApi';
import { screenRoute } from './forgeSoftware';

export type FieldType =
  | 'text' | 'longtext' | 'date' | 'daterange' | 'money' | 'number' | 'percent' | 'lookup' | 'entity'
  /** street/city/state/ZIP as ONE column - an address is one fact, not four. */
  | 'address'
  /** Computed from the row for display only. Never posted back. */
  | 'derived';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  lookup?: string;          // lookup type_key when type === 'lookup'
  entity?: EntityKey;       // referenced entity when type === 'entity'
  displayKey?: string;      // joined display column for entity refs
  /**
   * The far end of a 'daterange'. Such a field deliberately keeps the START
   * column's own key: the grid sorts by the column key and the API only
   * allow-lists real column names, so a Period whose key were 'period' would
   * render a sort caret that silently did nothing.
   */
  endKey?: string;
  inList?: boolean;
  inForm?: boolean;
  required?: boolean;
  /**
   * A MAX width for the cell, not a width. Every list cell used to be
   * `whitespace-nowrap`, so each column was sized to its longest value and no
   * column could ever compress — which is what pushed the Actions block off the
   * right edge of the scroll box on six of seven screens. Cells now truncate at
   * this cap instead. The old fixed `w-64`/`w-56` classes were inert under
   * `table-layout: auto` (clients declared w-64 and rendered 168px), so they are
   * gone rather than converted.
   */
  maxW?: string;
  /**
   * For type 'derived'. Reads the row and returns what the cell should say.
   * Exists so a screen can show a STATUS built from data the API already
   * returns, without inventing a column to store it. `key` still names a real
   * column so the sort caret sorts something real.
   */
  derive?: (row: Record<string, unknown>) => string;
}

export interface EntityConfig {
  key: EntityKey;
  title: string;
  singular: string;
  subtitle: string;
  pk: string;
  primaryField: string;
  /**
   * Extra fields the PICKER appends to distinguish otherwise identical labels.
   * Assistance is labelled by client name, and a third of clients have more
   * than one award — so a real customer's picker showed "Renee Hessing" four
   * times, identically, with no way to tell which award you were attaching to.
   * At eight fixture rows every client was distinct and it looked fine.
   */
  pickerSubtitle?: string[];
  detailRoute?: (id: string | number) => string;
  /**
   * Child records to show on this record's page. Declared here rather than
   * written per entity, so the record modal stays ONE component: a client
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
    detailRoute: (id) => `${screenRoute('hestia', 'clients')}?record=${id}`,
    fields: [
      /* Contact details, and nothing else.
         This screen had assistance_count, service_count and total_awarded on it,
         which made it a second Assistance screen wearing a different hat - the
         reasonable-sounding argument was "contact details alone cannot tell you
         whether we are helping this person", and the result was two screens that
         answered the same question. Clients answers WHO, Assistance answers WHAT
         WE COMMITTED, Services answers WHAT IS BEING DELIVERED. The rollups live
         on the record's Assistance and Services tabs, one click away, where they
         belong to a person rather than competing with the screen that owns them. */
      f('full_name', 'Name', 'text', { required: true, maxW: 'max-w-[180px]' }),
      f('phone', 'Phone'),
      f('email', 'Email', 'text', { maxW: 'max-w-[200px]' }),
      f('street', 'Address', 'address', { inForm: false, maxW: 'max-w-[240px]' }),
      f('county', 'County', 'text', { maxW: 'max-w-[110px]' }),
      /* The one thing that is not contact detail, because "is this person
         currently being helped" is the question the list is actually opened to
         answer. Derived from a rollup the API already returns - no new column,
         and it reads as a state rather than as a number to compare. */
      f('service_count', 'Status', 'derived', {
        inForm: false,
        derive: (row) => (Number(row.service_count) > 0 ? 'Receiving services' : 'No active services'),
      }),
      f('city', 'City', 'text', { inList: false }),
      f('state_province', 'State', 'text', { inList: false }),
      f('postal_code', 'ZIP', 'text', { inList: false }),
      f('assistance_count', 'Assistance awards', 'number', { inForm: false, inList: false }),
      f('total_awarded', 'Total awarded', 'money', { inForm: false, inList: false }),
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
    pickerSubtitle: ['award_ref', 'value_amount', 'start_date'],
    related: [{ entity: 'services', foreignKey: 'assistance_id', title: 'Services delivered' }],
    detailRoute: (id) => `${screenRoute('hestia', 'assistance')}?record=${id}`,
    fields: [
      /* WHO first, then everything about the award.
         This led with the award reference on the argument that leading with a
         person made it read as a client list. That was the wrong fix for the
         right observation: what made it read as a client list was that CLIENTS
         also showed award totals. Clients is contact details now, so this screen
         can lead with the name people actually search for and still be
         unmistakably about the money - every column after the name is the
         award. */
      f('client_id', 'Client', 'entity', { entity: 'clients', displayKey: 'client_name', required: true, maxW: 'max-w-[170px]' }),
      f('award_ref', 'Award', 'text', { inForm: false, maxW: 'max-w-[110px]' }),
      f('status', 'Status', 'lookup', { lookup: 'assistance_status' }),
      f('start_date', 'Period', 'daterange', { endKey: 'end_date', inForm: false, maxW: 'max-w-[180px]' }),
      f('value_amount', 'Value', 'money'),
      // Is this award being drawn down, or approved and untouched?
      f('service_count', 'Services', 'number', { inForm: false }),
      f('referral_source', 'Referred by', 'text', { maxW: 'max-w-[140px]' }),
      f('start_date', 'Start', 'date', { inList: false }),
      f('end_date', 'End', 'date', { inList: false }),
      f('gl_reference', 'GL ref', 'text', { inList: false }),
    ],
  },

  services: {
    key: 'services',
    title: 'Services',
    singular: 'Service',
    subtitle: 'A client receiving a service from a provider, paid from their assistance.',
    pk: 'service_id',
    primaryField: 'client_name',
    detailRoute: (id) => `${screenRoute('hestia', 'services')}?record=${id}`,
    fields: [
      /* The most detailed of the three, deliberately. Assistance says what was
         committed; this says what is actually being delivered, by whom, and how
         it is paid - so payment method and frequency belong here rather than
         only on the record.
         It is the widest table in HESTIA and that is fine: it scrolls inside the
         page, and the Actions column is pinned to the right so Open/Edit/Archive
         never move. Widening the PAGE to fit it was the previous answer and it
         cost the 80% measure the rest of the portal uses. */
      f('client_id', 'Client', 'entity', { entity: 'clients', displayKey: 'client_name', required: true, maxW: 'max-w-[140px]' }),
      f('provider_id', 'Provider', 'entity', { entity: 'providers', displayKey: 'provider_name', maxW: 'max-w-[140px]' }),
      f('service_type', 'Type', 'lookup', { lookup: 'service_type', maxW: 'max-w-[110px]' }),
      f('status', 'Status', 'lookup', { lookup: 'service_status' }),
      f('start_date', 'Period', 'daterange', { endKey: 'end_date', inForm: false, maxW: 'max-w-[180px]' }),
      f('payment_method', 'Payment', 'lookup', { lookup: 'payment_method', maxW: 'max-w-[110px]' }),
      f('payment_frequency', 'Frequency', 'lookup', { lookup: 'payment_frequency', maxW: 'max-w-[110px]' }),
      f('estimated_monthly_cost', 'Monthly', 'money'),
      f('assistance_id', 'Assistance', 'entity', { entity: 'assistance', displayKey: 'assistance_reference', inList: false }),
      f('start_date', 'Start', 'date', { inList: false }),
      f('end_date', 'End', 'date', { inList: false }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'providers')}?record=${id}`,
    fields: [
      /* A VENDOR ledger, not a fourth list of names. Brandon looked at this
         screen and asked what it was for — fairly: Name / Type / City with an
         empty Contact and an empty Phone is a stripped-down person list, and
         three of its six columns were null on every row. What makes a provider
         a provider is the volume and cost of the work we send it, so that is
         what the row states now. Contact and Phone are on the record. */
      f('name', 'Name', 'text', { required: true, maxW: 'max-w-[190px]' }),
      f('provider_type', 'Type', 'lookup', { lookup: 'provider_type', maxW: 'max-w-[130px]' }),
      f('client_count', 'Clients', 'number', { inForm: false }),
      // SUM of the ACTIVE arrangements only — what this vendor costs us a month
      // right now, not what it has ever cost.
      f('monthly_committed', 'Committed / mo', 'money', { inForm: false }),
      f('city', 'City'),
      f('service_count', 'Services', 'number', { inList: false, inForm: false }),
      f('primary_contact', 'Contact', 'text', { inList: false }),
      f('primary_phone', 'Phone', 'text', { inList: false }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'funders')}?record=${id}`,
    fields: [
      /* Money IN, from the other direction of travel. The identity was designed
         into this screen and then rendered away: Contact, Email and Deadline
         were null on every row, so a funder read "Blackhawk Community Trust |
         — | — | — | $25,000 | — | —" and looked like one more list with names
         in it. Every column here is a grantmaker fact a client row cannot
         carry, and Success rate in particular is the one no person record
         could ever imitate. */
      f('name', 'Name', 'text', { required: true, maxW: 'max-w-[190px]' }),
      f('application_count', 'Applications', 'number', { inForm: false }),
      f('total_awarded', 'Awarded', 'money', { inForm: false }),
      f('grant_max', 'Grant max', 'money'),
      f('apply_deadline', 'Deadline', 'text', { maxW: 'max-w-[130px]' }),
      // Dollars awarded over dollars asked for, across every application to
      // this funder — "is it worth applying here again".
      f('award_rate', 'Success rate', 'percent', { inForm: false }),
      f('primary_contact', 'Contact', 'text', { inList: false }),
      f('primary_email', 'Email', 'text', { inList: false }),
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
    title: 'Grant Applications',
    singular: 'Application',
    subtitle: 'Applications your organization has made to funders.',
    pk: 'application_id',
    primaryField: 'funder_name',
    detailRoute: (id) => `${screenRoute('hestia', 'applications')}?record=${id}`,
    fields: [
      f('funder_id', 'Funder', 'entity', { entity: 'funders', displayKey: 'funder_name', maxW: 'max-w-[180px]' }),
      f('applied_date', 'Applied', 'date'),
      f('decision_type', 'Decision', 'lookup', { lookup: 'decision_type', maxW: 'max-w-[130px]' }),
      f('amount_applied_for', 'Applied for', 'money'),
      f('amount_awarded', 'Awarded', 'money'),
      // The date that is a DEADLINE stays in the grid; the two that merely
      // record when something already happened move to the record.
      f('reporting_due_date', 'Reporting due', 'date'),
      f('decision_date', 'Decided', 'date', { inList: false }),
      f('money_received_date', 'Received', 'date', { inList: false }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'volunteers')}?record=${id}`,
    fields: [
      f('name', 'Name', 'text', { required: true, maxW: 'max-w-[190px]' }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'people')}?record=${id}`,
    fields: [
      f('full_name', 'Name', 'text', { required: true, maxW: 'max-w-[190px]' }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'donations')}?record=${id}`,
    fields: [
      f('person_id', 'Donor', 'entity', { entity: 'people', displayKey: 'donor_name', required: true, maxW: 'max-w-[190px]' }),
      f('received_on', 'Received', 'date', { required: true }),
      f('amount', 'Amount', 'money'),
      // Read-only in the form: the database computes it, so a form that let
      // someone type it would be offering to be wrong.
      f('deductible_amount', 'Deductible', 'money', { inForm: false }),
      f('campaign_id', 'Campaign', 'entity', { entity: 'campaigns', displayKey: 'campaign_name', maxW: 'max-w-[160px]' }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'campaigns')}?record=${id}`,
    fields: [
      f('name', 'Name', 'text', { required: true, maxW: 'max-w-[190px]' }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'funds')}?record=${id}`,
    fields: [
      f('name', 'Name', 'text', { required: true, maxW: 'max-w-[190px]' }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'pledges')}?record=${id}`,
    fields: [
      f('person_id', 'Donor', 'entity', { entity: 'people', displayKey: 'donor_name', required: true, maxW: 'max-w-[190px]' }),
      f('total_amount', 'Pledged', 'money'),
      f('pledged_on', 'Pledged on', 'date'),
      f('due_by', 'Due by', 'date'),
      f('status', 'Status', 'lookup', { lookup: 'pledge_status' }),
      f('campaign_id', 'Campaign', 'entity', { entity: 'campaigns', displayKey: 'campaign_name', maxW: 'max-w-[160px]' }),
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
    detailRoute: (id) => `${screenRoute('hestia', 'recurring')}?record=${id}`,
    fields: [
      f('person_id', 'Donor', 'entity', { entity: 'people', displayKey: 'donor_name', required: true, maxW: 'max-w-[190px]' }),
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
  /* A period is ONE fact. Start and End were two columns and two headers to say
     what "Sep 8, 2025 → " says, on the two screens that could least afford the
     width. An open end reads as ongoing rather than as a missing value, because
     that is what it is — most awards and arrangements have no end date yet. */
  if (field.type === 'daterange') {
    const from = row[field.key];
    const to = field.endKey ? row[field.endKey] : null;
    if (!from && !to) return '—';
    if (!to) return `${shortDate(from)} →`;
    if (!from) return `→ ${shortDate(to)}`;
    return `${shortDate(from)} – ${shortDate(to)}`;
  }
  if (field.type === 'derived') return field.derive ? field.derive(row) : '—';
  /* An address is one fact. Four columns of street/city/state/ZIP cost most of
     the table's width to say what one line says, and three of them were empty
     on the older records anyway. */
  if (field.type === 'address') {
    const parts = [row.street, row.city, [row.state_province, row.postal_code].filter(Boolean).join(' ')]
      .map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }
  const v = row[field.key];
  if (v === null || v === undefined || v === '') return '—';
  if (field.type === 'money') return money(v);
  if (field.type === 'percent') return `${Math.round(Number(v))}%`;
  if (field.type === 'date') return shortDate(v);
  return String(v);
};

/** Right-aligned, tabular columns — a number should line up with the number above it. */
export const isNumericField = (f: FieldDef) =>
  f.type === 'money' || f.type === 'number' || f.type === 'percent';
