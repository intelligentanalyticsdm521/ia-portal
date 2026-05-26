import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Bell,
  LogOut,
  Building2,
  CreditCard,
  Users,
  Plug,
  ShieldCheck,
  DatabaseZap,
  ChevronRight,
} from 'lucide-react';

/**
 * AccountMenu — the hamburger ☰ at the top right of every page.
 *
 * F-02 LOCKED 2026-05-26 — strict cross-product scope only:
 *   - My account (Profile, Notification preferences)
 *   - Business settings (whole-org: profile, plan, team, integrations)
 *   - Platform (notification rules, security, data + privacy)
 *
 * Per-PRODUCT settings (OLIVER / ARION / SPARK / etc.) DO NOT belong in the
 * hamburger anymore — they live behind the gear icon in the IconRail, which
 * routes to the current product's settings page. This keeps cross-product
 * concerns separate from per-product configuration.
 */
export function AccountMenu({
  userLabel,
  userEmail,
  onSignOut,
}: {
  userLabel: string;
  userEmail?: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="iadm-btn-ghost flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="max-w-[14rem] truncate">{userLabel}</span>
        <span className="text-lg leading-none" aria-hidden="true">
          ☰
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 z-50 mt-2 max-h-[calc(100vh-6rem)] w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {/* User header */}
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">{userLabel}</div>
            {userEmail && <div className="mt-0.5 text-xs text-gray-500">{userEmail}</div>}
          </div>

          {/* Personal */}
          <MenuSection label="My account">
            <MenuItem to="/app/account" icon={<User className="h-4 w-4" />} label="Profile & Personal Info" onClick={close} />
            <MenuItem to="/app/account" icon={<Bell className="h-4 w-4" />} label="Notification Preferences" onClick={close} />
          </MenuSection>

          {/* Business — applies to whole organization */}
          <MenuSection label="Business settings">
            <MenuItem to="/app/settings/business-profile" icon={<Building2 className="h-4 w-4" />} label="Business Profile" onClick={close} />
            <MenuItem to="/app/settings/plan-pricing" icon={<CreditCard className="h-4 w-4" />} label="Plan & Pricing" onClick={close} />
            <MenuItem to="/app/settings/team-members" icon={<Users className="h-4 w-4" />} label="Team Members" onClick={close} />
            <MenuItem to="/app/settings/integrations" icon={<Plug className="h-4 w-4" />} label="Connected Accounts" onClick={close} />
          </MenuSection>

          {/* F-02 — REMOVED OLIVER settings block from hamburger. Per-product
              settings now live behind the gear icon in the IconRail (which
              routes to the active product's settings page). The hamburger is
              strictly cross-product scope. */}

          {/* Platform */}
          <MenuSection label="Platform">
            <MenuItem to="/app/settings/notifications" icon={<Bell className="h-4 w-4" />} label="Notification Rules" onClick={close} />
            <MenuItem to="/app/settings/security" icon={<ShieldCheck className="h-4 w-4" />} label="Security & Compliance" onClick={close} />
            <MenuItem to="/app/settings/data-privacy" icon={<DatabaseZap className="h-4 w-4" />} label="Data & Privacy" onClick={close} />
          </MenuSection>

          {/* All settings shortcut */}
          <ul className="px-1.5 pb-1.5">
            <li>
              <Link
                to="/app/settings"
                role="menuitem"
                onClick={close}
                className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                <span>All settings</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </li>
          </ul>

          {/* Divider */}
          <div className="border-t border-gray-100" aria-hidden="true" />

          {/* Sign out */}
          <ul className="p-1.5">
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  close();
                  onSignOut();
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-1.5 first:border-t-0 first:pt-0">
      <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <ul className="px-1.5 pb-1.5">{children}</ul>
    </div>
  );
}

function MenuItem({
  to,
  icon,
  label,
  onClick,
  pill,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  pill?: string;
}) {
  return (
    <li>
      <Link
        to={to}
        role="menuitem"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        onClick={onClick}
      >
        <span className="text-gray-400">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {pill && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
            {pill}
          </span>
        )}
      </Link>
    </li>
  );
}
