/**
 * DevBusinessPicker — LOCAL-DEV ONLY business switcher, in the Portal header.
 *
 * Switching the dev stack between the agency business and a client business used
 * to mean editing `VITE_DEV_TENANT` in `Portal/.env.local` and restarting Vite.
 * This does it in two clicks and a reload.
 *
 * ONE MECHANISM, NOT A SECOND ONE. The pick goes exactly where the founder
 * business picker puts it — `lib/actAsSession.ts`, the per-tab key AppGate
 * resolves the active business from. Nothing here knows how a business is
 * chosen; it only supplies a list and calls `setActAsTenantId`, the same call
 * `FounderTenantPicker.handleSelect` makes. The dev seam
 * (lib/devAuth.ts → resolveDevTenant) reads that one key, so the `x-dev-tenant`
 * header and the app can never disagree about which business you are in.
 *
 * WHY IT EXISTS ALONGSIDE THE FOUNDER PICKER, RATHER THAN INSTEAD OF IT. The
 * founder picker is for a super user and it calls `/super/tenants` and
 * `/act-as`, which a non-super user is refused. Under `VITE_DEV_AUTH=1` the
 * backend resolves the dev USER from the business in the header — the first
 * active member of it — and on this fixture database only the agency fixtures
 * resolve to a super user. Summit Lawn resolves to `avery.rasmussen0`, who has
 * no platform role: no founder picker, no way out of that business without
 * editing `.env.local`. That is the hole this fills, and it is why HeaderBar
 * renders this one only when the founder picker is NOT there.
 *
 * WHY IT RELOADS: every page holds data fetched under the previous business
 * (convention_data_fetching — fetch once per page). The founder picker
 * hard-navigates for exactly this reason; showing Summit Lawn's invoices under
 * the POC fixture's header would be the cross-tenant symptom, not a saving.
 *
 * WHY IT CANNOT SHIP: `DEV_AUTH` is `import.meta.env.VITE_DEV_AUTH === '1'`,
 * which Vite inlines at BUILD time. A production build has no such variable, so
 * HeaderBar's `DEV_AUTH && …` folds to `false` and rollup drops this module —
 * verified by grepping `dist/` after a production build; the picker's strings
 * are not in it. `test/dev-business-picker.test.mjs` pins the guard and the
 * exact spelling of the flag that makes the fold possible.
 *
 * THE FOUNDER TENANT IS NOT ON THE MENU. Every backend dev seam refuses it — the
 * shared CIAM directory means its GUID is every JWT's `tid`, so a dev box that
 * could select it could authenticate as the real business. `devBusinessOptions()`
 * filters it out of the list and `resolveDevTenantId()` refuses to return it
 * even if it somehow reached storage.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FlaskConical } from 'lucide-react';
import { devBusinessOptions, findDevBusiness } from '../lib/devBusinesses';
import { setActAsTenantId } from '../lib/actAsSession';
import { DEV_AUTH, resolveDevTenant } from '../lib/devAuth';
import { FOUNDER_TENANT_ID_DEFAULT } from '../lib/founderTenant';

const KIND_LABEL: Record<string, string> = { agency: 'Agency', client: 'Client' };

export function DevBusinessPicker() {
  // Belt and braces with HeaderBar's own guard: this component is never supposed
  // to exist in a production bundle, and if it somehow did it renders nothing.
  if (!DEV_AUTH) return null;
  return <DevBusinessPickerInner />;
}

function DevBusinessPickerInner() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // What the header ACTUALLY sends right now — not what was picked, not the env
  // pin. The two can differ (an emergency act-as session outranks the pick), and
  // a picker showing the wrong one is how "the header says one business and the
  // data says another" starts.
  const currentId = resolveDevTenant().trim().toLowerCase();
  const current = findDevBusiness(currentId);
  const options = devBusinessOptions(FOUNDER_TENANT_ID_DEFAULT);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handlePick(tenantId: string) {
    if (tenantId.toLowerCase() === currentId) {
      setOpen(false);
      return;
    }
    // The same call the founder picker makes. Written BEFORE the navigation,
    // because the navigation throws the whole app state away.
    setActAsTenantId(tenantId);
    // AppGate keeps a long-term pin of the PREVIOUS business in localStorage and
    // only rewrites it after its own /select-tenant answers. Clearing it means
    // the very first requests of the reload already name the new business rather
    // than the old one.
    try { localStorage.removeItem('iadm.portal.activeTenantId'); } catch { /* denied — the per-tab pick still applies */ }
    window.location.assign('/app/overview');
  }

  const label = current ? current.name : currentId || '(no dev business)';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`LOCAL DEV ONLY — x-dev-tenant: ${currentId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border border-emerald-300/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-400/20"
      >
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden md:inline opacity-80">Dev business:</span>
        <span className="max-w-[12rem] truncate font-semibold">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[24rem] max-w-[90vw] rounded-md border border-gray-200 bg-white shadow-xl"
          role="listbox"
          aria-label="Dev business"
        >
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Local dev · Switch business
          </div>

          <ul className="max-h-96 overflow-y-auto py-1">
            {options.map((b) => {
              const isActive = b.tenantId === currentId;
              return (
                <li key={b.tenantId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handlePick(b.tenantId)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      isActive ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="mt-0.5 w-4 flex-shrink-0">
                      {isActive && <Check className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-gray-900">{b.name}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                            b.kind === 'agency'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {KIND_LABEL[b.kind]}
                        </span>
                      </div>
                      <div className="truncate text-xs text-gray-500">{b.note}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-500">
            Local dev only — sets the <code>x-dev-tenant</code> header and reloads.
            Fixture businesses only; the founder business is refused by every dev seam.
          </div>
        </div>
      )}
    </div>
  );
}
