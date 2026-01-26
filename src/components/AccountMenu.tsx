import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export function AccountMenu({
  userLabel,
  onSignOut
}: {
  userLabel: string;
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
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border bg-white shadow-sm"
        >
          <div className="border-b px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Account</div>
            <div className="mt-1 truncate text-sm font-medium text-gray-900">{userLabel}</div>
          </div>

          <ul className="p-1">
            <li>
              <Link
                to="/app/profile"
                role="menuitem"
                className="block rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Profile
              </Link>
            </li>
            <li>
              <Link
                to="/app/settings"
                role="menuitem"
                className="block rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Settings
              </Link>
            </li>
            <li className="my-1 border-t" aria-hidden="true" />
            <li>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
