import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useCurrentRoute } from "../../hooks/useCurrentRoute.js";
import { MobileDrawer } from "./MobileDrawer.jsx";
import { MobileNavigation } from "./MobileNavigation.jsx";
import { PageContainer } from "./PageContainer.jsx";
import { Sidebar } from "./Sidebar.jsx";
import { SkipLink } from "./SkipLink.jsx";
import { Topbar } from "./Topbar.jsx";

const SIDEBAR_KEY = "sidebarCollapsed";

function getInitialCollapsed() {
  const stored = localStorage.getItem(SIDEBAR_KEY);
  return stored === "true" ? true : false;
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const route = useCurrentRoute();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "true" : "false");
  }, [collapsed]);

  return (
    <div className={`app-shell ${collapsed ? "is-sidebar-collapsed" : ""}`.trim()}>
      <SkipLink />
      <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="app-shell__content">
        <Topbar onOpenMobileNavigation={() => setDrawerOpen(true)} />
        <PageContainer fullBleed={route.fullBleed}>
          <Outlet />
        </PageContainer>
      </div>
      <MobileNavigation onMore={() => setDrawerOpen(true)} />
    </div>
  );
}
