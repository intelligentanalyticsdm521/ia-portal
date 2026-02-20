import { useState } from 'react';
import type { PortalService } from '../../config/serviceCatalog';

type SparkTier = {
  id: string;
  label: string;
  emailsPerMonth: number;
  contactsIncluded: number;
  smsIncluded: number;
  priceMonthly: number;
};

const SPARK_TIERS: SparkTier[] = [
  {
    id: 'tier-5k',
    label: '5,000 emails / month',
    emailsPerMonth: 5000,
    contactsIncluded: 1000,
    smsIncluded: 100,
    priceMonthly: 19,
  },
  {
    id: 'tier-10k',
    label: '10,000 emails / month',
    emailsPerMonth: 10000,
    contactsIncluded: 1500,
    smsIncluded: 150,
    priceMonthly: 29,
  },
  {
    id: 'tier-15k',
    label: '15,000 emails / month',
    emailsPerMonth: 15000,
    contactsIncluded: 2500,
    smsIncluded: 200,
    priceMonthly: 39,
  },
  {
    id: 'tier-25k',
    label: '25,000 emails / month',
    emailsPerMonth: 25000,
    contactsIncluded: 5000,
    smsIncluded: 300,
    priceMonthly: 59,
  },
  {
    id: 'tier-50k',
    label: '50,000 emails / month',
    emailsPerMonth: 50000,
    contactsIncluded: 20000,
    smsIncluded: 500,
    priceMonthly: 89,
  },
  {
    id: 'tier-100k',
    label: '100,000 emails / month',
    emailsPerMonth: 100000,
    contactsIncluded: 50000,
    smsIncluded: 1000,
    priceMonthly: 149,
  },
  {
    id: 'tier-150k',
    label: '150,000 emails / month',
    emailsPerMonth: 150000,
    contactsIncluded: 100000,
    smsIncluded: 2000,
    priceMonthly: 209,
  },
  {
    id: 'tier-250k',
    label: '250,000 emails / month',
    emailsPerMonth: 250000,
    contactsIncluded: 200000,
    smsIncluded: 3000,
    priceMonthly: 279,
  },
  {
    id: 'tier-350k',
    label: '350,000 emails / month',
    emailsPerMonth: 350000,
    contactsIncluded: 350000,
    smsIncluded: 4000,
    priceMonthly: 349,
  },
  {
    id: 'tier-500k',
    label: '500,000 emails / month',
    emailsPerMonth: 500000,
    contactsIncluded: 500000,
    smsIncluded: 5000,
    priceMonthly: 429,
  },
];

export function ComingSoonPage({ service }: { service: PortalService }) {
  // Special-case SPARK (internal IL key: LUMEN)
  if (service.key === 'LUMEN') {
    return <SparkPreview />;
  }

  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body">
          <h1 className="text-2xl font-semibold">{service.displayName}</h1>
          <p className="mt-2 text-sm text-gray-600">Coming soon.</p>
        </div>
      </section>

      <section className="iadm-card">
        <div className="iadm-card-body">
          <h2 className="text-base font-semibold">Status</h2>
          <p className="mt-2 text-sm text-gray-700">
            This section is a placeholder for upcoming software. When the full build is released, this placeholder will be
            replaced with the linked experience.
          </p>
        </div>
      </section>
    </div>
  );
}

function SparkPreview() {
  const [tierIndex, setTierIndex] = useState(0);
  const tier = SPARK_TIERS[tierIndex];
  const annualPrice = Math.round(tier.priceMonthly * 12 * 0.9); // simple 10% discount helper

  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">
              SPARK — Growth Platform
            </h1>
            <p className="text-sm text-gray-600">
              Sales Pipeline Acceleration &amp; Relationship Kit. SPARK is your growth engine for contacts, campaigns, and
              lead generation.
            </p>
            <p className="text-xs text-gray-500">
              This is a read-only preview inside the IADM Portal. Live data, configuration, and editing will happen in the full SPARK app.
            </p>
          </div>
          <div className="rounded-md bg-gray-50 px-4 py-3 text-xs text-gray-600 md:max-w-xs">
            <p className="font-semibold">Portal preview only</p>
            <p className="mt-1">
              When a tenant is not subscribed to SPARK, they will see sample cards and pricing here with a clear overlay.
              Enabling SPARK will swap this for live usage and reporting surfaces.
            </p>
          </div>
        </div>
      </section>

      <section className="iadm-card">
        <div className="iadm-card-body space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Standard plan – usage slider</h2>
              <p className="mt-1 text-sm text-gray-600">
                Choose the volume that fits the business. Contacts and SMS scale automatically with email volume.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold">
                ${tier.priceMonthly}
                <span className="text-sm font-normal text-gray-500"> / month</span>
              </div>
              <div className="text-xs text-gray-500">
                or approximately ${annualPrice} / year with 10% annual prepay
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>5k emails</span>
              <span>50k emails</span>
              <span>250k+</span>
            </div>
            <input
              type="range"
              min={0}
              max={SPARK_TIERS.length - 1}
              step={1}
              value={tierIndex}
              onChange={(e) => setTierIndex(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SparkStat label="Emails / month" value={tier.emailsPerMonth.toLocaleString()} />
              <SparkStat label="Contacts included" value={tier.contactsIncluded.toLocaleString()} />
              <SparkStat label="SMS bundle" value={`${tier.smsIncluded.toLocaleString()} / month`} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-sm font-semibold">What&apos;s included in Standard</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Full CRM contact database with tags &amp; basic segmentation</li>
                <li>Email campaigns, scheduling, and simple templates</li>
                <li>Lightweight SMS sending for confirmations &amp; small campaigns</li>
                <li>Core performance metrics for campaigns and contacts</li>
              </ul>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <h3 className="text-sm font-semibold">How this appears in Portal</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Greyed preview cards when SPARK is not yet enabled for a tenant</li>
                <li>&quot;Open SPARK&quot; and &quot;Manage subscription&quot; CTAs when enabled</li>
                <li>Read-only overview surfaces across Overview, CRM, Campaigns, Leads, and Reporting</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SparkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
