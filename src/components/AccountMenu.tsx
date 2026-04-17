import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, CreditCard, Bell, Users, Link2, LogOut } from 'lucide-react';

export function AccountMenu({
  userLabel,
  userEmail,
  onSignOut
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
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {/* User header */}
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">{userLabel}</div>
            {userEmail && <div className="mt-0.5 text-xs text-gray-500">{userEmail}</div>}
          </div>

          {/* Menu items */}
          <ul className="p-1.5">
            <MenuItem
              to="/app/account"
              icon={<User className="h-4 w-4" />}
              label="Profile & Personal Info"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              to="/app/settings"
              icon={<CreditCard className="h-4 w-4" />}
              label="Subscription & Billing"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              to="/app/account"
              icon={<Bell className="h-4 w-4" />}
              label="Notification Preferences"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              to="/app/settings"
              icon={<Users className="h-4 w-4" />}
              label="Team & User Management"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              to="/app/settings"
              icon={<Link2 className="h-4 w-4" />}
              label="Connected Accounts"
              onClick={() => setOpen(false)}
            />

            {/* Divider */}
            <li className="my-1.5 border-t border-gray-100" aria-hidden="true" />

            {/* Sign out */}
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  setOpen(false);
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

function MenuItem({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <li>
      <Link
        to={to}
        role="menuitem"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        onClick={onClick}
      >
        <span className="text-gray-400">{icon}</span>
        {label}
      </Link>
    </li>
  );
}
