/**
 * ForgeLinePage — /app/services/forge_overview.
 *
 * The FORGE product LINE landing page, not a software page. FORGE is the
 * "we build you the thing" line, so its landing screen is an invitation, and
 * the builds a tenant owns are listed underneath as a way in.
 *
 * This used to be HESTIA's overview, which meant a tenant that owned no FORGE
 * software still landed on an empty HESTIA — a client's bespoke software,
 * rendered blank, to someone with no relationship to it. Builds now live at
 * /app/services/forge/<slug> and this page never touches their data.
 */
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { ForgePage } from './ForgePage';
import { Card } from './ForgeLayout';
import { ownedSoftware, softwareRoot } from './forgeSoftware';

const CONSULT_URL =
  (import.meta.env.VITE_FORGE_CATALOG_URL as string | undefined) ||
  'https://intelligentanalyticsdm.com/forge';

export function ForgeLinePage() {
  const { ownedProducts } = useAppState();
  const mine = ownedSoftware(ownedProducts);

  return (
    <ForgePage>
      <div className="space-y-6">
        <section className="iadm-card overflow-hidden">
          <div className="bg-slate-900 px-8 py-12 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">FORGE</div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Need custom software?
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              FORGE is where we build the thing that does not exist yet — the system your
              organization runs on, designed around how you actually work rather than how
              an off-the-shelf tool assumes you do. We scope it with you, build it, and it
              lives here alongside the rest of your platform.
            </p>
            <a
              href={CONSULT_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              Book a consultation
            </a>
          </div>
        </section>

        {mine.length > 0 && (
          <Card title={mine.length === 1 ? 'Your software' : 'Your software'}>
            <ul className="divide-y divide-slate-100">
              {mine.map((s) => (
                <li key={s.slug} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <Link
                      to={softwareRoot(s.slug)}
                      className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                    >
                      {s.name} — {s.tagline}
                    </Link>
                    <p className="mt-0.5 max-w-2xl text-sm text-slate-600">{s.description}</p>
                  </div>
                  <Link
                    to={softwareRoot(s.slug)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="How a FORGE build works">
          <ol className="space-y-3 text-sm text-slate-600">
            <li><span className="font-medium text-slate-900">1. Scope.</span> We map what you do now, what it costs you, and what the software has to be true about.</li>
            <li><span className="font-medium text-slate-900">2. Build.</span> Your software, on your data, in your portal — not a template with your logo on it.</li>
            <li><span className="font-medium text-slate-900">3. Run.</span> It sits beside your other tools and shares the same login, billing and support.</li>
          </ol>
        </Card>
      </div>
    </ForgePage>
  );
}

export default ForgeLinePage;
