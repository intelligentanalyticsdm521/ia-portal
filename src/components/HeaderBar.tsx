import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { useAccessToken } from '../auth/useAccessToken';
import { AccountMenu } from './AccountMenu';
import { SparkGlobalSearch } from './spark/SparkGlobalSearch';

export function HeaderBar() {
  const { active } = useAppState();
  const { activeAccount, logout } = useAccessToken();

  const tenantLabel = active?.tenant?.tenantFullName || active?.tenant?.tenantName || 'Your account';
  const rawUserLabel = active?.user?.displayName || activeAccount?.name || activeAccount?.username || 'Signed in';
  const userLabel = rawUserLabel === 'unknown' ? 'Signed in' : rawUserLabel;
  const userEmail = activeAccount?.username || '';

  return (
    <header className="iadm-header">
      <div className="iadm-header-inner">
        <Link to="/app/overview" className="flex items-center gap-3">
          <img src="/ia-lockup-horiz-blue.svg" alt="Intelligent Analytics" className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          {/* Global SPARK search — keyboard shortcut ⌘K from anywhere */}
          <SparkGlobalSearch />

          <div className="hidden md:block iadm-header-tenant" aria-label="Tenant greeting">
            <span className="text-white/70">Welcome,</span> <span className="font-medium text-white">{tenantLabel}</span>
          </div>

          <AccountMenu userLabel={userLabel} userEmail={userEmail} onSignOut={() => logout()} />
        </div>
      </div>
    </header>
  );
}
