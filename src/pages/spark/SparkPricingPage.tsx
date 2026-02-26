import { useState } from 'react';

export function SparkPricingPage() {
  const [contacts, setContacts] = useState(1000);

  const emailAllowance = contacts * 5; // example: 5x emails per contact
  const smsAllowance = Math.round(contacts * 0.5);

  // Basic tiered example pricing curve
  const basePrice = 19;
  const contactMultiplier = contacts / 1000;
  const monthlyPrice = Math.round(basePrice * contactMultiplier);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">SPARK — Growth Platform</h1>
          <p className="mt-1 text-sm text-slate-600">
            Simple, transparent pricing for email &amp; SMS campaigns. Only the standard plan is
            available in v1; advanced add-ons will be introduced later.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,3fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Contacts &amp; volume</h2>
          <p className="mt-1 text-xs text-slate-500">
            Choose the number of contacts you want SPARK to manage. Pricing scales linearly so
            you&apos;re never surprised.
          </p>

          <div className="mt-4">
            <label className="flex items-center justify-between text-xs text-slate-600">
              <span>Contacts</span>
              <span className="font-semibold text-slate-900">{contacts.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={500}
              max={10000}
              step={500}
              value={contacts}
              onChange={(e) => setContacts(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-2 flex justify-between text-[11px] text-slate-500">
              <span>500</span>
              <span>10,000+</span>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-slate-900">Estimated monthly price</span>
              <span className="text-lg font-semibold text-slate-900">
                ${monthlyPrice.toLocaleString()}
              </span>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-4">
              <li>Up to {contacts.toLocaleString()} contacts</li>
              <li>Approx. {emailAllowance.toLocaleString()} email sends / month</li>
              <li>Approx. {smsAllowance.toLocaleString()} SMS sends / month</li>
              <li>Unlimited campaigns and basic reporting</li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">What&apos;s included</h2>
          <div className="mt-3 grid gap-3 text-xs text-slate-700 md:grid-cols-2">
            <Feature pill="Standard" title="Email campaigns">
              Build and schedule one-off and recurring email campaigns with basic templates.
            </Feature>
            <Feature pill="Standard" title="SMS campaigns">
              Send SMS broadcasts once SMS support is enabled for your tenant.
            </Feature>
            <Feature pill="Standard" title="CRM contacts">
              Centralised contact list with tags, segments, and consent tracking.
            </Feature>
            <Feature pill="Standard" title="Reporting preview">
              High-level SPARK metrics surfaced directly in the IADM Portal.
            </Feature>
            <Feature pill="Future" title="Advanced automation" muted>
              Multi-step automation flows, scoring and journey analytics. Planned for a future
              release.
            </Feature>
            <Feature pill="Future" title="Lead management" muted>
              Deeper SPARK + OLIVER lead routing and qualification workflows.
            </Feature>
          </div>

          <div className="mt-5 rounded-lg bg-sky-50 p-4 text-xs text-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-sky-900">
                  Ready to add SPARK to your account?
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  In v1 this page is informational. When the billing workflow is ready, this button
                  will start the self-service upgrade flow.
                </div>
              </div>
              <button className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700">
                Start SPARK onboarding
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FeatureProps {
  pill: string;
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}

function Feature({ pill, title, muted, children }: FeatureProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-900">{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            muted ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {pill}
        </span>
      </div>
      <div className="text-xs text-slate-700">{children}</div>
    </div>
  );
}