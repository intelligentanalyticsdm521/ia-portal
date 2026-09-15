import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { AccountMenu } from './AccountMenu';
import { ArgusBalanceBadge } from './ArgusBalanceBadge';
import { DevBusinessPicker } from './DevBusinessPicker';
import { FounderTenantPicker } from './FounderTenantPicker';
import { GlobalSearch } from './GlobalSearch';
import { GuidedTourLauncher } from './GuidedTourLauncher';
import { LocationPicker } from './oliver/LocationPicker';
import { DEV_AUTH } from '../lib/devAuth';

export function HeaderBar() {
  const { active, bootstrap } = useAppState();
  const { activeAccount, logout } = useAccessToken();
  const isSuperUser = !!bootstrap?.user?.isSuperUser;
  const [searchOpen, setSearchOpen] = useState(false);

  const tenantLabel = active?.tenant?.tenantFullName || active?.tenant?.tenantName || 'Your account';
  const rawUserLabel = active?.user?.displayName || activeAccount?.name || activeAccount?.username || 'Signed in';
  const userLabel = rawUserLabel === 'unknown' ? 'Signed in' : rawUserLabel;
  const userEmail = activeAccount?.username || '';

  // F-117 — Cmd/Ctrl+K opens global search palette from anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="iadm-header">
      <div className="iadm-header-inner">
        <Link to="/app/overview" className="flex items-center gap-3">
          <img src="/ia-lockup-horiz-blue.svg" alt="Intelligent Analytics" className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          {/* F-117 — search trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden md:inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="hidden lg:inline-block text-[10px] font-mono bg-white/10 px-1 py-0.5 rounded">⌘K</kbd>
          </button>

          {/* F-119 — guided tours launcher */}
          <GuidedTourLauncher />

          {/* OLIVER multi-location — renders only on an OLIVER surface for a
              business with 2+ active locations (or on Business). */}
          <LocationPicker />

          {/* ARGUS AI credit balance badge — clickable popover w/ buy + usage */}
          <ArgusBalanceBadge />

          {/* Founder super-user tenant picker — Design Option C. Only rendered
              when bootstrap.user.isSuperUser is true (SUPER_ADMIN platform
              role). Replaces the static "Welcome, X" tenant greeting so the
              founder can switch context without leaving their auth session. */}
          {isSuperUser ? (
            <div className="hidden md:block">
              <FounderTenantPicker />
            </div>
          ) : (
            <div className="hidden md:block iadm-header-tenant" aria-label="Tenant greeting">
              <span className="text-white/70">Welcome,</span> <span className="font-medium text-white">{tenantLabel}</span>
            </div>
          )}

          {/* LOCAL DEV ONLY, and only where the founder picker is not. Under
              VITE_DEV_AUTH=1 the backend resolves the dev user from the business
              in the x-dev-tenant header, and most fixture businesses resolve to
              somebody with no platform role — no founder picker, and no way out
              of that business but editing .env.local and restarting Vite. This
              switches the same per-tab key the founder picker writes
              (lib/actAsSession.ts), so there is one mechanism either way.

              DEV_AUTH is inlined by Vite at build time, so a production build
              folds this to `false && …` and rollup drops the component.
              See components/DevBusinessPicker.tsx. */}
          {DEV_AUTH && !isSuperUser && (
            <div className="hidden md:block">
              <DevBusinessPicker />
            </div>
          )}

          <AccountMenu userLabel={userLabel} userEmail={userEmail} onSignOut={() => logout()} />
        </div>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
