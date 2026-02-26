import { AppShell } from "./AppShell";

/**
 * AppLayout is now just a thin wrapper around AppShell.
 * AppShell owns the header, sidebar, and <Outlet /> for child routes.
 */
export function AppLayout() {
  return <AppShell />;
}