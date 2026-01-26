import { Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';

export function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
