import type { PropsWithChildren } from 'react';
import { HeaderBar } from './HeaderBar';
import { SidebarNav } from './SidebarNav';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="iadm-shell text-gray-900">
      <HeaderBar />
      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="w-72 shrink-0">
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1 iadm-content">{children}</main>
      </div>
    </div>
  );
}
