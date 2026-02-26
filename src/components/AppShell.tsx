import { Outlet } from "react-router-dom";
import { HeaderBar } from "./HeaderBar";
import { SidebarNav } from "./SidebarNav";

export function AppShell() {
  return (
    <div className="iadm-shell flex min-h-screen flex-col">
      {/* Top header uses .iadm-header from index.css */}
      <header className="iadm-header">
        <HeaderBar />
      </header>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-1">
        {/* Sidebar branding is now handled entirely by .iadm-sidebar in index.css */}
        <aside className="w-72 shrink-0 iadm-sidebar">
          <SidebarNav />
        </aside>

        {/* Main content area */}
        <main className="flex-1 bg-iadm-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}