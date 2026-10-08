/**
 * ArgusSettingsPage — Left rail → Settings → ARGUS (/app/services/argus_settings).
 *
 * 2026-10-08. Replaces the "Coming soon" placeholder (argus_coming) that sat
 * here while ARGUS was live. A small page in the Settings style: one card per
 * place you set ARGUS up, each with one plain sentence. The words live in
 * lib/argusSettings.ts (pure, so the test reads exactly what the page says).
 */
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { ARGUS_SETTINGS_INTRO, ARGUS_SETTINGS_LINKS, ARGUS_SETTINGS_TITLE } from "../../lib/argusSettings";

export function ArgusSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-3.5 w-3.5" />
          All settings
        </Link>
      </div>
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">{ARGUS_SETTINGS_TITLE}</h1>
        <p className="mt-1 text-sm text-gray-500">{ARGUS_SETTINGS_INTRO}</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ARGUS_SETTINGS_LINKS.map((item) => (
          <div key={item.label} className="rounded-lg border bg-white p-4">
            <Link to={item.to} className="text-sm font-semibold text-gray-900 underline-offset-2 hover:underline">
              {item.label}
            </Link>
            <p className="mt-1 text-xs text-gray-500">{item.sentence}</p>
            {item.more && item.more.length > 0 && (
              <ul className="mt-3 space-y-1">
                {item.more.map((m) => (
                  <li key={m.to}>
                    <Link to={m.to} className="text-xs font-semibold text-gray-700 underline">{m.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArgusSettingsPage;
