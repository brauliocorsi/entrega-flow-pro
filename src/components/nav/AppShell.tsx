import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { DesktopSidebar } from "@/components/nav/DesktopSidebar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { MoreSheet } from "@/components/nav/MoreSheet";
import { TopBar } from "@/components/nav/TopBar";
import { pageTitle, visibleItems, type Role } from "@/lib/nav-items";

export function AppShell({
  role,
  email,
  onSignOut,
  children,
}: {
  role: Role;
  email: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { bp } = useBreakpoint();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(bp === "tablet");

  const isActive = (p: string) => path === p || path.startsWith(p + "/");
  const primary = mobileTabs(role);
  const moreActive = !primary.some((i) => isActive(i.to)) && path !== "/agendar";
  const canGoBack = path.split("/").filter(Boolean).length > 1;

  const sidebarCollapsed = bp === "tablet" ? true : collapsed;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <DesktopSidebar
        role={role}
        isActive={isActive}
        collapsed={sidebarCollapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={pageTitle(path)}
          email={email}
          role={role ?? undefined}
          bp={bp}
          onSignOut={onSignOut}
          canGoBack={canGoBack}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-8 md:pb-10">
          {children}
        </main>
      </div>

      <MobileTabBar role={role} isActive={isActive} onMore={() => setMoreOpen(true)} moreActive={moreActive} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} role={role} isActive={isActive} onSignOut={onSignOut} />
    </div>
  );
}
