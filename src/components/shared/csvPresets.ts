/**
 * csvPresets.ts — "Import from another system" column maps (scope §3.5, step I1).
 *
 * WHAT THIS IS
 * ------------
 * Presets are DATA, not code paths. One entry per vendor x entity. Each entry
 * says: "if a column is called any of these things, it is this field of ours."
 * The widget consults the chosen preset first and falls back to the generic
 * regex detection for anything the preset does not claim.
 *
 * HONESTY ABOUT THE HEADERS  (read this before trusting a mapping)
 * ----------------------------------------------------------------
 * Every alias list below was written from the vendors' published export /
 * import documentation as I know it on 2026-09-04. NOT ONE of them has been
 * checked against a real export file yet — which is why every preset carries
 *
 *     confirmed_against_real_export: false
 *
 * and the UI shows "we have not yet confirmed this against a real <vendor>
 * export; check the preview carefully" on every single one. `assumed_headers`
 * lists exactly what I assumed so Brandon can diff it against a real file in
 * one pass (FORGE to-do T-EXPORTS). When a file arrives: fix the aliases, flip
 * the flag, and the warning disappears for that preset. A wrong alias is a
 * data edit, not a release.
 *
 * WHY MISMATCHES FAIL SAFE
 * ------------------------
 * Matching is EXACT, then exact-after-normalisation (lowercase, strip
 * non-alphanumerics). Never substring. A header we guessed wrong therefore
 * lands as UNMAPPED (visible, harmless) rather than being pulled into the
 * wrong field (invisible, corrupting). That property is what the
 * "swapped columns" mutation test in scope §5.5 checks: a phone column must
 * never end up in email.
 *
 * A header is also claimed at most ONCE per import: the first field whose
 * alias list matches it wins, and later fields must find a different column.
 * Without that, "Phone Numbers" could satisfy both `phone` and `mobile_phone`
 * and the second one would silently duplicate the first.
 */

// ─── Field vocabulary ────────────────────────────────────────────────────

export type ImportEntity = 'contacts' | 'jobs' | 'invoices';

export type VendorKey =
  | 'quickbooks_online'
  | 'wave'
  | 'jobber'
  | 'housecall_pro';

export type ContactField =
  | 'first_name' | 'last_name' | 'display_name' | 'company' | 'title'
  | 'email' | 'phone'
  | 'address_line1' | 'address_line2' | 'city' | 'state' | 'postal_code' | 'country'
  | 'tag_names' | 'notes' | 'source' | 'external_id';

export type JobField =
  | 'external_id' | 'job_number' | 'title'
  | 'customer_name' | 'customer_email' | 'customer_phone' | 'customer_company'
  | 'address_line1' | 'address_line2' | 'city' | 'state' | 'postal_code' | 'country'
  | 'status' | 'scheduled_start' | 'scheduled_end' | 'job_type'
  | 'total' | 'team_notes' | 'customer_notes';

export type InvoiceField =
  | 'external_id' | 'invoice_number' | 'job_external_id'
  | 'customer_name' | 'customer_email' | 'customer_phone' | 'customer_company'
  | 'issued_date' | 'due_date' | 'paid_date' | 'status'
  | 'subtotal' | 'tax_amount' | 'total' | 'balance_due' | 'amount_paid'
  | 'description';

export type AnyField = ContactField | JobField | InvoiceField;

export interface FieldSpec {
  key: AnyField;
  label: string;
  /** Shown under the picker. Plain words — the owner is not a developer. */
  hint?: string;
  kind?: 'text' | 'date' | 'money' | 'status' | 'list';
}

/** Fields we can fill, per entity, in the order the mapping UI shows them. */
export const TARGET_FIELDS: Record<ImportEntity, FieldSpec[]> = {
  contacts: [
    { key: 'first_name', label: 'First name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'display_name', label: 'Display name', hint: 'Used when there is no first/last name' },
    { key: 'company', label: 'Business name' },
    { key: 'title', label: 'Job title' },
    { key: 'email', label: 'Email', hint: 'Email or phone is required' },
    { key: 'phone', label: 'Phone', hint: 'Email or phone is required' },
    { key: 'address_line1', label: 'Street address' },
    { key: 'address_line2', label: 'Unit / suite' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State / province' },
    { key: 'postal_code', label: 'ZIP / postal code' },
    { key: 'country', label: 'Country' },
    { key: 'tag_names', label: 'Tags', kind: 'list', hint: 'Separated by commas or semicolons' },
    { key: 'notes', label: 'Notes' },
    { key: 'source', label: 'Where they came from' },
    { key: 'external_id', label: 'Their ID in the old system', hint: 'Stops a repeat import creating duplicates' },
  ],
  jobs: [
    { key: 'external_id', label: 'Job ID in the old system', hint: 'Stops a repeat import creating duplicates' },
    { key: 'job_number', label: 'Job number' },
    { key: 'title', label: 'Job title' },
    { key: 'customer_name', label: 'Customer name', hint: 'How we find or create the customer' },
    { key: 'customer_email', label: 'Customer email', hint: 'The most reliable way to match' },
    { key: 'customer_phone', label: 'Customer phone' },
    { key: 'customer_company', label: 'Customer business name' },
    { key: 'address_line1', label: 'Service street address' },
    { key: 'address_line2', label: 'Unit / suite' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State / province' },
    { key: 'postal_code', label: 'ZIP / postal code' },
    { key: 'country', label: 'Country' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'scheduled_start', label: 'Scheduled date', kind: 'date' },
    { key: 'scheduled_end', label: 'Finish date', kind: 'date' },
    { key: 'job_type', label: 'Job type' },
    { key: 'total', label: 'Job total', kind: 'money' },
    { key: 'team_notes', label: 'Internal notes' },
    { key: 'customer_notes', label: 'Notes the customer sees' },
  ],
  invoices: [
    { key: 'external_id', label: 'Invoice ID in the old system', hint: 'Stops a repeat import creating duplicates' },
    { key: 'invoice_number', label: 'Invoice number' },
    { key: 'job_external_id', label: 'Job ID this belongs to', hint: 'Optional — we make a completed job if there is none' },
    { key: 'customer_name', label: 'Customer name' },
    { key: 'customer_email', label: 'Customer email' },
    { key: 'customer_phone', label: 'Customer phone' },
    { key: 'customer_company', label: 'Customer business name' },
    { key: 'issued_date', label: 'Invoice date', kind: 'date' },
    { key: 'due_date', label: 'Due date', kind: 'date' },
    { key: 'paid_date', label: 'Date paid', kind: 'date' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'subtotal', label: 'Subtotal', kind: 'money' },
    { key: 'tax_amount', label: 'Tax', kind: 'money' },
    { key: 'total', label: 'Total', kind: 'money' },
    { key: 'balance_due', label: 'Balance still owing', kind: 'money' },
    { key: 'amount_paid', label: 'Amount paid', kind: 'money' },
    { key: 'description', label: 'Description', hint: 'Becomes the invoice line' },
  ],
};

/** Fields that must be mapped before an import can run. */
export const REQUIRED_FIELDS: Record<ImportEntity, AnyField[][]> = {
  // Inner arrays are OR-groups: at least one member of each group.
  contacts: [['email', 'phone']],
  jobs: [['customer_name', 'customer_email', 'customer_phone']],
  invoices: [['customer_name', 'customer_email', 'customer_phone'], ['total']],
};

// ─── Preset shape ────────────────────────────────────────────────────────

export interface CsvPreset {
  preset_key: string;
  vendor: VendorKey;
  vendor_label: string;
  entity: ImportEntity;
  label: string;
  /** Where in the vendor's UI this file comes from — shown to the owner. */
  export_path: string;
  /**
   * 'likely'      — the vendor documents this report's default columns and
   *                 they are widely reproduced; still unverified here.
   * 'unconfirmed' — I am guessing at spelling, plurals or which report the
   *                 owner will actually export.
   */
  confidence: 'likely' | 'unconfirmed';
  /** Flips to true only when a REAL export file has been diffed against this. */
  confirmed_against_real_export: false;
  /** Exactly the headers assumed, so a real file can be diffed in one pass. */
  assumed_headers: string[];
  /** The vendor has no such export at all — the owner must map by hand. */
  vendor_has_no_native_export?: boolean;
  aliases: Partial<Record<AnyField, string[]>>;
  /** Vendor status word (lowercased) → our status. */
  status_map?: Record<string, string>;
  /** 'mdy' (US) or 'dmy'. Only used for ambiguous all-numeric dates. */
  date_order?: 'mdy' | 'dmy';
  notes?: string;
}

const UNCONFIRMED = false as const;

// ─── QuickBooks Online ───────────────────────────────────────────────────

const QBO_CONTACTS: CsvPreset = {
  preset_key: 'quickbooks_online.contacts',
  vendor: 'quickbooks_online',
  vendor_label: 'QuickBooks Online',
  entity: 'contacts',
  label: 'QuickBooks Online — Customer Contact List',
  export_path: 'Reports → Customer Contact List → Export to Excel/CSV',
  confidence: 'likely',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Customer', 'Full Name', 'Phone Numbers', 'Email', 'Billing Address',
    'Company', 'Mobile', 'Shipping Address', 'Customer Type', 'Notes',
  ],
  aliases: {
    display_name: ['Customer', 'Customer full name', 'Display Name', 'Name'],
    company: ['Company', 'Company Name'],
    // QBO's contact report ships ONE "Full Name" column, not first/last. The
    // importer splits it on the last space when first/last are unmapped.
    first_name: ['First Name', 'Given Name'],
    last_name: ['Last Name', 'Family Name', 'Surname'],
    email: ['Email', 'E-mail', 'Email Address'],
    phone: ['Phone Numbers', 'Phone', 'Phone Number', 'Mobile', 'Main Phone'],
    // QBO exports the billing address as ONE multi-line cell. The importer
    // splits it; see splitOneLineAddress().
    address_line1: ['Billing Address', 'Bill Address', 'Street', 'Address'],
    city: ['City', 'Bill City'],
    state: ['State', 'Bill State', 'Province'],
    postal_code: ['ZIP', 'Zip', 'Postal Code', 'Bill Zip'],
    country: ['Country', 'Bill Country'],
    notes: ['Notes', 'Memo'],
    external_id: ['Customer ID', 'Id', 'ID'],
  },
  notes: 'The Full Name and Billing Address columns are single cells — we split them. Check the preview.',
};

const QBO_JOBS: CsvPreset = {
  preset_key: 'quickbooks_online.jobs',
  vendor: 'quickbooks_online',
  vendor_label: 'QuickBooks Online',
  entity: 'jobs',
  label: 'QuickBooks Online — Projects (no true job export)',
  export_path: 'Projects → (Plus/Advanced only) export the project list',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  vendor_has_no_native_export: true,
  assumed_headers: ['Project', 'Customer', 'Status', 'Start date', 'End date', 'Income', 'Costs'],
  aliases: {
    title: ['Project', 'Project Name', 'Job'],
    customer_name: ['Customer', 'Customer full name'],
    status: ['Status', 'Project Status'],
    scheduled_start: ['Start date', 'Start Date'],
    scheduled_end: ['End date', 'End Date', 'Completion date'],
    total: ['Income', 'Total', 'Amount'],
  },
  status_map: {
    'in progress': 'in_progress', open: 'in_progress',
    completed: 'completed', complete: 'completed',
    canceled: 'cancelled', cancelled: 'cancelled',
  },
  date_order: 'mdy',
  notes: 'QuickBooks Online has no work-order/job object outside Projects. Most businesses will not have this file — map by hand or skip the Jobs tab.',
};

const QBO_INVOICES: CsvPreset = {
  preset_key: 'quickbooks_online.invoices',
  vendor: 'quickbooks_online',
  vendor_label: 'QuickBooks Online',
  entity: 'invoices',
  label: 'QuickBooks Online — Invoice List',
  export_path: 'Reports → Invoice List (or Sales → Invoices) → Export to Excel/CSV',
  confidence: 'likely',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Date', 'Transaction Type', 'Num', 'Customer', 'Memo/Description',
    'Due Date', 'Amount', 'Open Balance', 'Status',
  ],
  aliases: {
    invoice_number: ['Num', 'No.', 'Number', 'Invoice No.', 'Invoice Number', '#'],
    external_id: ['Transaction ID', 'Id'],
    customer_name: ['Customer', 'Customer full name', 'Name'],
    issued_date: ['Date', 'Invoice Date', 'Transaction Date'],
    due_date: ['Due Date'],
    status: ['Status'],
    total: ['Amount', 'Total', 'Total Amount'],
    balance_due: ['Open Balance', 'Balance', 'Balance Due'],
    description: ['Memo/Description', 'Memo', 'Description'],
  },
  status_map: {
    paid: 'paid', closed: 'paid', deposited: 'paid',
    open: 'sent', sent: 'sent', overdue: 'sent', 'partially paid': 'sent',
    draft: 'draft',
    void: 'void', voided: 'void',
  },
  date_order: 'mdy',
  notes: '"Num" is spelled "No." in some QuickBooks regions — both are mapped. The Invoice List is header-level, so each invoice imports as one line item.',
};

// ─── Wave ────────────────────────────────────────────────────────────────

const WAVE_CONTACTS: CsvPreset = {
  preset_key: 'wave.contacts',
  vendor: 'wave',
  vendor_label: 'Wave',
  entity: 'contacts',
  label: 'Wave — Customers export',
  export_path: 'Sales → Customers → Export (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'customer_name', 'first_name', 'last_name', 'email', 'phone', 'mobile',
    'address_line_1', 'address_line_2', 'city', 'province/state',
    'postal_code/zip_code', 'country', 'account_number',
  ],
  aliases: {
    display_name: ['customer_name', 'Customer Name', 'Customer'],
    company: ['business_name', 'Business Name', 'customer_name'],
    first_name: ['first_name', 'contact_first_name', 'First Name'],
    last_name: ['last_name', 'contact_last_name', 'Last Name'],
    email: ['email', 'Email', 'email_address'],
    phone: ['phone', 'Phone', 'mobile', 'Mobile', 'phone_number'],
    address_line1: ['address_line_1', 'Address Line 1', 'address1', 'address'],
    address_line2: ['address_line_2', 'Address Line 2', 'address2'],
    city: ['city', 'City'],
    state: ['province/state', 'province', 'state', 'Province/State', 'State'],
    postal_code: ['postal_code/zip_code', 'postal_code', 'zip_code', 'Postal Code', 'ZIP'],
    country: ['country', 'Country'],
    external_id: ['account_number', 'Account Number', 'customer_id'],
  },
  notes: 'Wave uses lowercase snake_case headers in its own template; the exported file may use Title Case. Both spellings are mapped.',
};

const WAVE_JOBS: CsvPreset = {
  preset_key: 'wave.jobs',
  vendor: 'wave',
  vendor_label: 'Wave',
  entity: 'jobs',
  label: 'Wave — no job export',
  export_path: 'Wave has no jobs or work orders',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  vendor_has_no_native_export: true,
  assumed_headers: [],
  aliases: {},
  notes: 'Wave is accounting only — it has no job or work-order record to export. Import your customers and invoices, and start jobs fresh in OLIVER.',
};

const WAVE_INVOICES: CsvPreset = {
  preset_key: 'wave.invoices',
  vendor: 'wave',
  vendor_label: 'Wave',
  entity: 'invoices',
  label: 'Wave — Invoices export',
  export_path: 'Sales → Invoices → Export (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Invoice Number', 'Customer', 'Invoice Date', 'Due Date', 'Status',
    'Total', 'Amount Due', 'Currency',
  ],
  aliases: {
    invoice_number: ['Invoice Number', 'invoice_number', 'Invoice #', 'Number'],
    customer_name: ['Customer', 'customer_name', 'Customer Name'],
    issued_date: ['Invoice Date', 'invoice_date', 'Date'],
    due_date: ['Due Date', 'due_date'],
    status: ['Status', 'status'],
    total: ['Total', 'total', 'Invoice Total', 'Amount'],
    balance_due: ['Amount Due', 'amount_due', 'Balance', 'Balance Due'],
    description: ['Memo', 'Notes', 'Description'],
  },
  status_map: {
    paid: 'paid',
    sent: 'sent', unpaid: 'sent', overdue: 'sent', 'partially paid': 'sent', viewed: 'sent',
    draft: 'draft', saved: 'draft',
    void: 'void',
  },
  date_order: 'mdy',
};

// ─── Jobber ──────────────────────────────────────────────────────────────

const JOBBER_CONTACTS: CsvPreset = {
  preset_key: 'jobber.contacts',
  vendor: 'jobber',
  vendor_label: 'Jobber',
  entity: 'contacts',
  label: 'Jobber — Clients export',
  export_path: 'Clients → ⋯ → Export clients (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'First name', 'Last name', 'Company name', 'Email', 'Phone',
    'Street 1', 'Street 2', 'City', 'Province/State', 'Postal/Zip code',
    'Country', 'Lead source', 'Tags', 'Client notes',
  ],
  aliases: {
    first_name: ['First name', 'First Name'],
    last_name: ['Last name', 'Last Name'],
    display_name: ['Client name', 'Client Name', 'Client'],
    company: ['Company name', 'Company Name', 'Company'],
    email: ['Email', 'Emails', 'Email address'],
    phone: ['Phone', 'Phone numbers', 'Phone number', 'Main phone', 'Mobile phone'],
    address_line1: ['Street 1', 'Street1', 'Street', 'Address'],
    address_line2: ['Street 2', 'Street2', 'Unit'],
    city: ['City'],
    state: ['Province/State', 'Province', 'State'],
    postal_code: ['Postal/Zip code', 'Postal code', 'Zip code', 'Postal/Zip Code'],
    country: ['Country'],
    source: ['Lead source', 'Lead Source', 'Referred by'],
    tag_names: ['Tags', 'Client tags'],
    notes: ['Client notes', 'Notes'],
    external_id: ['Client ID', 'Client id', 'ID'],
  },
  notes: 'Jobber pluralises some columns ("Emails", "Phone numbers"). Both spellings are mapped.',
};

const JOBBER_JOBS: CsvPreset = {
  preset_key: 'jobber.jobs',
  vendor: 'jobber',
  vendor_label: 'Jobber',
  entity: 'jobs',
  label: 'Jobber — Jobs export',
  export_path: 'Jobs → ⋯ → Export jobs (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Job #', 'Client', 'Title', 'Job type', 'Status', 'Start date', 'End date',
    'Address', 'Total', 'Team', 'Instructions',
  ],
  aliases: {
    job_number: ['Job #', 'Job number', 'Job Number'],
    external_id: ['Job ID', 'Job id'],
    title: ['Title', 'Job title', 'Subject'],
    customer_name: ['Client', 'Client name', 'Customer'],
    customer_email: ['Client email', 'Email'],
    customer_phone: ['Client phone', 'Phone'],
    address_line1: ['Address', 'Street 1', 'Service address'],
    city: ['City'],
    state: ['Province/State', 'Province', 'State'],
    postal_code: ['Postal/Zip code', 'Postal code', 'Zip code'],
    country: ['Country'],
    status: ['Status', 'Job status'],
    scheduled_start: ['Start date', 'Start Date', 'Scheduled date', 'Visit date'],
    scheduled_end: ['End date', 'End Date'],
    job_type: ['Job type', 'Job Type'],
    total: ['Total', 'Job total'],
    team_notes: ['Instructions', 'Internal notes', 'Team'],
    customer_notes: ['Description', 'Details'],
  },
  status_map: {
    'requires invoicing': 'completed',
    complete: 'completed', completed: 'completed', closed: 'completed',
    active: 'scheduled', upcoming: 'scheduled', scheduled: 'scheduled',
    'action required': 'scheduled', today: 'scheduled',
    unscheduled: 'inquiry',
    archived: 'cancelled', cancelled: 'cancelled', canceled: 'cancelled',
    'late': 'scheduled',
  },
  date_order: 'dmy',
  notes: 'Jobber is Canadian — numeric dates are read day/month/year. If your file uses month/day, switch the date order on the preview.',
};

const JOBBER_INVOICES: CsvPreset = {
  preset_key: 'jobber.invoices',
  vendor: 'jobber',
  vendor_label: 'Jobber',
  entity: 'invoices',
  label: 'Jobber — Invoices export',
  export_path: 'Invoices → ⋯ → Export invoices (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Invoice #', 'Client', 'Subject', 'Issued date', 'Due date', 'Status',
    'Subtotal', 'Tax', 'Total', 'Balance',
  ],
  aliases: {
    invoice_number: ['Invoice #', 'Invoice number', 'Invoice Number'],
    external_id: ['Invoice ID', 'Invoice id'],
    job_external_id: ['Job #', 'Job number'],
    customer_name: ['Client', 'Client name', 'Customer'],
    customer_email: ['Client email', 'Email'],
    issued_date: ['Issued date', 'Issued Date', 'Invoice date', 'Date'],
    due_date: ['Due date', 'Due Date'],
    status: ['Status'],
    subtotal: ['Subtotal', 'Sub total'],
    tax_amount: ['Tax', 'Tax total', 'Total tax'],
    total: ['Total', 'Invoice total'],
    balance_due: ['Balance', 'Balance due', 'Amount due', 'Outstanding'],
    description: ['Subject', 'Description', 'Message'],
  },
  status_map: {
    paid: 'paid',
    'awaiting payment': 'sent', sent: 'sent', 'past due': 'sent', 'partially paid': 'sent',
    draft: 'draft',
    'bad debt': 'void', void: 'void',
  },
  date_order: 'dmy',
};

// ─── Housecall Pro ───────────────────────────────────────────────────────

const HCP_CONTACTS: CsvPreset = {
  preset_key: 'housecall_pro.contacts',
  vendor: 'housecall_pro',
  vendor_label: 'Housecall Pro',
  entity: 'contacts',
  label: 'Housecall Pro — Customers export',
  export_path: 'Customers → Export (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'First Name', 'Last Name', 'Display Name', 'Company', 'Email',
    'Mobile Number', 'Home Number', 'Work Number', 'Street', 'Unit',
    'City', 'State', 'Zip', 'Tags', 'Lead Source', 'Notes',
  ],
  aliases: {
    first_name: ['First Name', 'First name'],
    last_name: ['Last Name', 'Last name'],
    display_name: ['Display Name', 'Customer Name', 'Customer'],
    company: ['Company', 'Company Name', 'Business Name'],
    email: ['Email', 'Email Address'],
    // First non-empty wins across these three — see MULTI_PHONE below.
    phone: ['Mobile Number', 'Home Number', 'Work Number', 'Phone', 'Phone Number'],
    address_line1: ['Street', 'Street Line 1', 'Address', 'Street Address'],
    address_line2: ['Unit', 'Street Line 2', 'Apt/Suite'],
    city: ['City'],
    state: ['State'],
    postal_code: ['Zip', 'Zip Code', 'Postal Code'],
    country: ['Country'],
    tag_names: ['Tags', 'Customer Tags'],
    source: ['Lead Source', 'Lead source', 'Customer Source'],
    notes: ['Notes', 'Customer Notes'],
    external_id: ['Customer ID', 'Customer Id'],
  },
  notes: 'Housecall Pro exports three phone columns. We take the first one that has a value: mobile, then home, then work.',
};

const HCP_JOBS: CsvPreset = {
  preset_key: 'housecall_pro.jobs',
  vendor: 'housecall_pro',
  vendor_label: 'Housecall Pro',
  entity: 'jobs',
  label: 'Housecall Pro — Jobs export',
  export_path: 'Jobs → Export (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Job #', 'Customer', 'Address', 'Scheduled Date', 'Scheduled Start',
    'Scheduled End', 'Job Status', 'Employee', 'Total Amount', 'Job Type',
    'Tags', 'Job Description', 'Invoice #',
  ],
  aliases: {
    job_number: ['Job #', 'Job Number', 'Job No.'],
    external_id: ['Job ID', 'Job Id'],
    title: ['Job Description', 'Description', 'Job Name'],
    customer_name: ['Customer', 'Customer Name'],
    customer_email: ['Customer Email', 'Email'],
    customer_phone: ['Customer Phone', 'Phone', 'Mobile Number'],
    address_line1: ['Address', 'Street', 'Service Address'],
    address_line2: ['Unit'],
    city: ['City'],
    state: ['State'],
    postal_code: ['Zip', 'Zip Code'],
    country: ['Country'],
    status: ['Job Status', 'Status'],
    scheduled_start: ['Scheduled Start', 'Scheduled Date', 'Start Date'],
    scheduled_end: ['Scheduled End', 'End Date'],
    job_type: ['Job Type'],
    total: ['Total Amount', 'Total', 'Job Total'],
    team_notes: ['Employee', 'Assigned To', 'Internal Notes'],
    customer_notes: ['Customer Notes', 'Notes'],
  },
  status_map: {
    scheduled: 'scheduled', 'needs scheduling': 'inquiry', unscheduled: 'inquiry',
    'in progress': 'in_progress', 'on my way': 'dispatched', dispatched: 'dispatched',
    completed: 'completed', complete: 'completed', finished: 'completed',
    canceled: 'cancelled', cancelled: 'cancelled',
    'pro finished': 'completed', paid: 'paid', invoiced: 'invoiced',
  },
  date_order: 'mdy',
};

const HCP_INVOICES: CsvPreset = {
  preset_key: 'housecall_pro.invoices',
  vendor: 'housecall_pro',
  vendor_label: 'Housecall Pro',
  entity: 'invoices',
  label: 'Housecall Pro — Invoices export',
  export_path: 'Invoices → Export (CSV)',
  confidence: 'unconfirmed',
  confirmed_against_real_export: UNCONFIRMED,
  assumed_headers: [
    'Invoice #', 'Customer', 'Job #', 'Invoice Date', 'Due Date', 'Status',
    'Total', 'Balance', 'Amount Paid', 'Paid Date',
  ],
  aliases: {
    invoice_number: ['Invoice #', 'Invoice Number', 'Invoice No.'],
    external_id: ['Invoice ID', 'Invoice Id'],
    job_external_id: ['Job #', 'Job Number', 'Job ID'],
    customer_name: ['Customer', 'Customer Name'],
    customer_email: ['Customer Email', 'Email'],
    issued_date: ['Invoice Date', 'Date', 'Issued Date'],
    due_date: ['Due Date'],
    paid_date: ['Paid Date', 'Date Paid', 'Payment Date'],
    status: ['Status', 'Invoice Status'],
    subtotal: ['Subtotal'],
    tax_amount: ['Tax', 'Tax Amount'],
    total: ['Total', 'Total Amount', 'Invoice Total'],
    balance_due: ['Balance', 'Balance Due', 'Amount Due', 'Outstanding'],
    amount_paid: ['Amount Paid', 'Paid'],
    description: ['Description', 'Service', 'Line Item'],
  },
  status_map: {
    paid: 'paid',
    sent: 'sent', unpaid: 'sent', 'past due': 'sent', overdue: 'sent', 'partially paid': 'sent',
    draft: 'draft', pending: 'draft',
    void: 'void', canceled: 'void', cancelled: 'void',
  },
  date_order: 'mdy',
};

// ─── Registry ────────────────────────────────────────────────────────────

export const CSV_PRESETS: CsvPreset[] = [
  QBO_CONTACTS, QBO_JOBS, QBO_INVOICES,
  WAVE_CONTACTS, WAVE_JOBS, WAVE_INVOICES,
  JOBBER_CONTACTS, JOBBER_JOBS, JOBBER_INVOICES,
  HCP_CONTACTS, HCP_JOBS, HCP_INVOICES,
];

export const VENDORS: { key: VendorKey; label: string }[] = [
  { key: 'quickbooks_online', label: 'QuickBooks Online' },
  { key: 'wave', label: 'Wave' },
  { key: 'jobber', label: 'Jobber' },
  { key: 'housecall_pro', label: 'Housecall Pro' },
];

export function presetsFor(entity: ImportEntity): CsvPreset[] {
  return CSV_PRESETS.filter((p) => p.entity === entity);
}

export function getPreset(presetKey: string): CsvPreset | null {
  return CSV_PRESETS.find((p) => p.preset_key === presetKey) || null;
}

/** The one sentence the UI must show above every unconfirmed preset. */
export function presetWarning(preset: CsvPreset): string | null {
  if (preset.vendor_has_no_native_export) {
    return `${preset.vendor_label} does not export this. ${preset.notes || 'Map your columns by hand and check the preview.'}`;
  }
  if (!preset.confirmed_against_real_export) {
    return `We have not yet confirmed this against a real ${preset.vendor_label} export — check the preview carefully before you import.`;
  }
  return null;
}

// ─── Header matching ─────────────────────────────────────────────────────

/** lowercase, drop everything that is not a letter or a digit. */
export function normalizeHeader(h: string): string {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export type Mapping = Partial<Record<AnyField, string>>;

/**
 * Apply a preset's aliases to a CSV's header row.
 *
 * Exact match first (so "Phone" beats "Phone Numbers" when the file has both
 * and the alias list prefers "Phone Numbers" — the preference order in the
 * alias array decides, and a header is claimed at most once).
 */
export function applyPreset(headers: string[], preset: CsvPreset): Mapping {
  const mapping: Mapping = {};
  const claimed = new Set<string>();
  const byExact = new Map<string, string>();
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    if (!byExact.has(h)) byExact.set(h, h);
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }

  const order = TARGET_FIELDS[preset.entity].map((f) => f.key);
  for (const field of order) {
    const aliases = preset.aliases[field];
    if (!aliases || !aliases.length) continue;
    for (const alias of aliases) {
      const hit = byExact.get(alias) ?? byNorm.get(normalizeHeader(alias));
      if (hit && !claimed.has(hit)) {
        mapping[field] = hit;
        claimed.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/** Generic fallback for headers a preset did not claim. Same exactness rule. */
const GENERIC_ALIASES: Partial<Record<AnyField, string[]>> = {
  first_name: ['first name', 'firstname', 'first', 'given name', 'fname'],
  last_name: ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'],
  display_name: ['display name', 'full name', 'name', 'contact', 'customer', 'client'],
  company: ['company', 'company name', 'business', 'business name', 'organization', 'organisation'],
  title: ['title', 'job title', 'role', 'position'],
  email: ['email', 'e-mail', 'email address', 'emails'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'cell', 'telephone', 'tel'],
  address_line1: ['address', 'address line 1', 'street', 'street address', 'street 1', 'address1'],
  address_line2: ['address line 2', 'street 2', 'unit', 'suite', 'apt', 'address2'],
  city: ['city', 'town'],
  state: ['state', 'province', 'province/state', 'region'],
  postal_code: ['zip', 'zip code', 'postal code', 'postcode', 'postal/zip code'],
  country: ['country'],
  tag_names: ['tags', 'tag', 'labels'],
  notes: ['notes', 'note', 'memo', 'comments'],
  source: ['source', 'lead source', 'referred by'],
  invoice_number: ['invoice number', 'invoice #', 'invoice no', 'number', 'num', 'no.'],
  job_number: ['job number', 'job #', 'job no', 'work order', 'work order #'],
  customer_name: ['customer', 'client', 'customer name', 'client name'],
  customer_email: ['customer email', 'client email', 'email'],
  customer_phone: ['customer phone', 'client phone', 'phone'],
  status: ['status', 'job status', 'invoice status'],
  issued_date: ['invoice date', 'issued date', 'date', 'issue date'],
  due_date: ['due date', 'due'],
  paid_date: ['paid date', 'date paid', 'payment date'],
  scheduled_start: ['scheduled date', 'start date', 'scheduled start', 'date'],
  scheduled_end: ['end date', 'scheduled end', 'finish date'],
  total: ['total', 'amount', 'total amount', 'grand total'],
  subtotal: ['subtotal', 'sub total'],
  tax_amount: ['tax', 'tax amount', 'total tax'],
  balance_due: ['balance', 'balance due', 'amount due', 'open balance', 'outstanding'],
  amount_paid: ['amount paid', 'paid'],
  description: ['description', 'memo/description', 'memo', 'subject', 'service'],
};

export function genericMapping(headers: string[], entity: ImportEntity, already: Mapping = {}): Mapping {
  const mapping: Mapping = { ...already };
  const claimed = new Set<string>(Object.values(already).filter(Boolean) as string[]);
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  for (const f of TARGET_FIELDS[entity]) {
    if (mapping[f.key]) continue;
    for (const alias of GENERIC_ALIASES[f.key] || []) {
      const hit = byNorm.get(normalizeHeader(alias));
      if (hit && !claimed.has(hit)) { mapping[f.key] = hit; claimed.add(hit); break; }
    }
  }
  return mapping;
}

/** Preset first, generic for the leftovers. This is what the widget calls. */
export function buildMapping(headers: string[], entity: ImportEntity, preset: CsvPreset | null): Mapping {
  const base = preset ? applyPreset(headers, preset) : {};
  return genericMapping(headers, entity, base);
}

/**
 * Guess the vendor from the header row. Returns null unless ONE preset for
 * this entity clearly wins — a tie is a guess, and a guess that silently
 * picks the wrong vendor's status map is worse than asking.
 */
export function detectPreset(headers: string[], entity: ImportEntity): CsvPreset | null {
  const normHeaders = new Set(headers.map(normalizeHeader).filter(Boolean));
  const scored = presetsFor(entity)
    .filter((p) => !p.vendor_has_no_native_export)
    .map((p) => {
      // Score = how many of the preset's OWN assumed headers are present.
      // Assumed headers are vendor-specific; generic ones ("Email", "City")
      // appear everywhere and are worth less.
      let score = 0;
      for (const h of p.assumed_headers) {
        const n = normalizeHeader(h);
        if (!n || !normHeaders.has(n)) continue;
        score += GENERIC_HEADER_SET.has(n) ? 1 : 3;
      }
      return { preset: p, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < 9) return null;      // too little evidence
  if (scored[1] && scored[0].score - scored[1].score < 3) return null; // ambiguous
  return scored[0].preset;
}

const GENERIC_HEADER_SET = new Set(
  ['Email', 'Phone', 'City', 'State', 'Country', 'Zip', 'Status', 'Total', 'Date',
   'Notes', 'Tags', 'Company', 'Customer', 'Client', 'First Name', 'Last Name',
   'Due Date', 'Description', 'Address'].map(normalizeHeader)
);

// ─── Value parsers ───────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a vendor date to 'YYYY-MM-DD', or null when it is not a date.
 *
 * NEVER returns "today" as a fallback. A row whose date we cannot read is a
 * row the owner must see in the error list — quietly stamping the import date
 * onto a two-year-old invoice is exactly the silent corruption this importer
 * exists to avoid.
 */
export function parseDate(raw: string | null | undefined, order: 'mdy' | 'dmy' = 'mdy'): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // ISO first — unambiguous.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);

  // "12 Mar 2026" / "Mar 12, 2026" / "March 12 2026"
  const named = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
    || s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (named) {
    const monthWord = /^[A-Za-z]/.test(named[1]) ? named[1] : named[2];
    const dayStr = /^[A-Za-z]/.test(named[1]) ? named[2] : named[1];
    const m = MONTHS[monthWord.slice(0, 4).toLowerCase()] ?? MONTHS[monthWord.slice(0, 3).toLowerCase()];
    if (m) return ymd(+named[3], m, +dayStr);
  }

  // Numeric with / . or -
  const num = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (num) {
    let a = +num[1], b = +num[2], y = +num[3];
    if (num[1].length === 4) return ymd(a, b, y);   // 2026/03/12
    if (y < 100) y += y < 70 ? 2000 : 1900;
    // A value > 12 can only be the day — that beats the configured order.
    let month: number, day: number;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { month = a; day = b; }
    else if (order === 'dmy') { day = a; month = b; }
    else { month = a; day = b; }
    return ymd(y, month, day);
  }
  return null;
}

function ymd(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse a vendor money value to a number, or null.
 *
 * Handles $1,234.56 · 1 234,56 · (45.00) as negative · CAD 12.00 · trailing -.
 * Returns null (not 0) for an unreadable value — "0" and "we could not read
 * it" are different facts and the second one belongs in the error list.
 */
export function parseMoney(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? '').trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, ''); }

  s = s.replace(/[A-Za-z$£€¥\s ]/g, '');
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "1,234" = thousands · "12,50" = decimal comma (exactly 2 trailing digits
    // and only one comma).
    const parts = s.split(',');
    s = (parts.length === 2 && parts[1].length === 2) ? `${parts[0]}.${parts[1]}` : s.replace(/,/g, '');
  }

  if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Split "Tag A, Tag B; Tag C" into trimmed, de-duplicated tag names. */
export function parseList(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const out: string[] = [];
  for (const part of s.split(/[,;|]/)) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Map a vendor status word to ours. Unknown → null (the row is flagged). */
export function mapStatus(raw: string | null | undefined, preset: CsvPreset | null): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = preset?.status_map?.[s];
  return m || null;
}

/**
 * Split a one-cell address ("12 Main St, Springfield, IL 62704") into parts.
 * Best effort, US/CA shape. Everything we cannot place stays in line 1 — never
 * dropped.
 */
export function splitOneLineAddress(raw: string | null | undefined): {
  address_line1: string; city: string; state: string; postal_code: string; country: string;
} {
  const empty = { address_line1: '', city: '', state: '', postal_code: '', country: '' };
  const s = String(raw ?? '').replace(/\r/g, '').trim();
  if (!s) return empty;

  const parts = s.split(/\n|,/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) return { ...empty, address_line1: parts[0] };

  const out = { ...empty };
  let tail = parts[parts.length - 1];

  // Trailing country word, if any.
  if (/^(usa|us|united states|canada|ca)$/i.test(tail) && parts.length >= 3) {
    out.country = /^(canada|ca)$/i.test(tail) ? 'CA' : 'US';
    parts.pop();
    tail = parts[parts.length - 1];
  }

  // "IL 62704" / "ON K1A 0B1" / "62704"
  const stateZip = tail.match(/^([A-Za-z]{2})\s+([A-Za-z0-9][A-Za-z0-9 \-]{2,9})$/)
    || tail.match(/^([A-Za-z]{2})\s*$/);
  const zipOnly = tail.match(/^(\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d)$/);
  if (stateZip) {
    out.state = stateZip[1].toUpperCase();
    out.postal_code = (stateZip[2] || '').trim();
    parts.pop();
  } else if (zipOnly) {
    out.postal_code = zipOnly[1];
    parts.pop();
    const maybeState = parts[parts.length - 1];
    if (maybeState && /^[A-Za-z]{2}$/.test(maybeState)) { out.state = maybeState.toUpperCase(); parts.pop(); }
  }

  if (parts.length >= 2) { out.city = parts.pop() as string; }
  out.address_line1 = parts.join(', ');
  if (!out.address_line1) { out.address_line1 = out.city; out.city = ''; }
  return out;
}

/**
 * Split "Jane Q. Public" into first/last. Last token is the surname; the rest
 * is the given name. Single-token names become the FIRST name (a mononym is a
 * first name, not a surname).
 */
export function splitFullName(raw: string | null | undefined): { first_name: string; last_name: string } {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { first_name: '', last_name: '' };
  const bits = s.split(' ');
  if (bits.length === 1) return { first_name: bits[0], last_name: '' };
  return { first_name: bits.slice(0, -1).join(' '), last_name: bits[bits.length - 1] };
}

// ─── Row projection ──────────────────────────────────────────────────────

export type CsvRow = Record<string, string>;

/**
 * Turn one CSV row into the canonical shape the API takes, using the mapping.
 * Pure — no I/O, no defaults invented. Missing = null, unreadable = null.
 * The API validates again; this is only about shape.
 */
export function projectRow(
  row: CsvRow,
  mapping: Mapping,
  entity: ImportEntity,
  preset: CsvPreset | null,
): Record<string, unknown> {
  const order = preset?.date_order || 'mdy';
  const raw = (f: AnyField): string => {
    const col = mapping[f];
    return col ? String(row[col] ?? '').trim() : '';
  };
  const out: Record<string, unknown> = {};
  for (const spec of TARGET_FIELDS[entity]) {
    const v = raw(spec.key);
    if (!v) continue;
    switch (spec.kind) {
      case 'date': out[spec.key] = parseDate(v, order); out[`${spec.key}_raw`] = v; break;
      case 'money': out[spec.key] = parseMoney(v); out[`${spec.key}_raw`] = v; break;
      case 'list': out[spec.key] = parseList(v); break;
      case 'status': out[spec.key] = mapStatus(v, preset); out.status_raw = v; break;
      default: out[spec.key] = v;
    }
  }

  // Contacts: fill first/last from a display name when the file has no
  // first/last columns (QBO's Customer Contact List is exactly this shape).
  if (entity === 'contacts' && !out.first_name && !out.last_name && out.display_name) {
    const { first_name, last_name } = splitFullName(String(out.display_name));
    if (first_name) out.first_name = first_name;
    if (last_name) out.last_name = last_name;
  }

  // A one-cell address column with no separate city/state/zip.
  if (out.address_line1 && !out.city && !out.state && !out.postal_code) {
    const parsed = splitOneLineAddress(String(out.address_line1));
    if (parsed.city || parsed.state || parsed.postal_code) {
      out.address_line1 = parsed.address_line1;
      if (parsed.city) out.city = parsed.city;
      if (parsed.state) out.state = parsed.state;
      if (parsed.postal_code) out.postal_code = parsed.postal_code;
      if (parsed.country && !out.country) out.country = parsed.country;
    }
  }

  return out;
}

/** Which required groups are still unmapped. Empty array = ready to import. */
export function missingRequired(mapping: Mapping, entity: ImportEntity): string[] {
  const missing: string[] = [];
  for (const group of REQUIRED_FIELDS[entity]) {
    if (group.some((f) => mapping[f])) continue;
    const labels = group.map((f) => TARGET_FIELDS[entity].find((s) => s.key === f)?.label || f);
    missing.push(labels.join(' or '));
  }
  return missing;
}
