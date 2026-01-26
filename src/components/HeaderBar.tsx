import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { AccountMenu } from './AccountMenu';

export function HeaderBar() {
  const { session } = useAppState();
  const { activeAccount, logout } = useAccessToken();

  const tenantLabel = session?.tenant?.tenantFullName || session?.tenant?.tenantName || 'Your account';
  const rawUserLabel = session?.user?.displayName || activeAccount?.name || activeAccount?.username || 'Signed in';
  const userLabel = rawUserLabel === 'unknown' ? 'Signed in' : rawUserLabel;

  return (
    <header className="iadm-header">
      <div className="iadm-header-inner">
        <Link to="/app/overview" className="flex items-center gap-3">
          <img src="/iadm-logo.png" alt="IADM" className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden md:block iadm-header-tenant" aria-label="Tenant greeting">
            <span className="text-white/70">Welcome,</span> <span className="font-medium text-white">{tenantLabel}</span>
          </div>

          <AccountMenu userLabel={userLabel} onSignOut={() => logout()} />
        </div>
      </div>
    </header>
  );
}
