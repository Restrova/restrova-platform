import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  GitCompare,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Store,
  Users,
  Utensils
} from "lucide-react";

export const ROLE_OWNER = "owner";
export const ROLE_BRANCH_MANAGER = "branch_manager";
export const ROLE_VIEWER = "viewer";
export const allRoles = [ROLE_OWNER, ROLE_BRANCH_MANAGER, ROLE_VIEWER];

export const navigationGroups = [
  {
    id: "primary",
    translationKey: "navigation.mainNavigation",
    items: [
      {
        id: "dashboard",
        translationKey: "navigation.dashboard",
        titleKey: "navigation.dashboard",
        path: "/app/dashboard",
        icon: LayoutDashboard,
        mobilePriority: true,
        requiredRoles: allRoles
      },
      {
        id: "workspace",
        translationKey: "navigation.workspace",
        titleKey: "navigation.workspace",
        path: "/app/workspace",
        icon: Gauge,
        mobilePriority: true,
        fullBleed: true,
        requiredRoles: allRoles
      },
      {
        id: "imports",
        translationKey: "navigation.imports",
        titleKey: "navigation.imports",
        path: "/app/imports",
        icon: Database,
        requiredRoles: [ROLE_OWNER, ROLE_BRANCH_MANAGER]
      },
      {
        id: "menuProfitability",
        translationKey: "navigation.menuProfitability",
        titleKey: "navigation.menuProfitability",
        path: "/app/menu-profitability",
        icon: Utensils,
        mobilePriority: true,
        requiredRoles: allRoles
      },
      {
        id: "salesComparison",
        translationKey: "navigation.salesComparison",
        titleKey: "navigation.salesComparison",
        path: "/app/sales-comparison",
        icon: GitCompare,
        requiredRoles: allRoles
      },
      {
        id: "alerts",
        translationKey: "navigation.alerts",
        titleKey: "navigation.alerts",
        path: "/app/alerts",
        icon: AlertTriangle,
        mobilePriority: true,
        requiredRoles: allRoles
      },
      {
        id: "recommendations",
        translationKey: "navigation.recommendations",
        titleKey: "navigation.recommendations",
        path: "/app/recommendations",
        icon: Lightbulb,
        requiredRoles: allRoles
      },
      {
        id: "reports",
        translationKey: "navigation.reports",
        titleKey: "navigation.reports",
        path: "/app/reports",
        icon: FileText,
        requiredRoles: allRoles
      },
      {
        id: "assistant",
        translationKey: "navigation.assistant",
        titleKey: "navigation.assistant",
        path: "/app/assistant",
        icon: Bot,
        mobilePriority: true,
        requiredRoles: allRoles
      },
      {
        id: "dataQuality",
        translationKey: "navigation.dataQuality",
        titleKey: "navigation.dataQuality",
        path: "/app/data-quality",
        icon: ClipboardList,
        requiredRoles: [ROLE_OWNER, ROLE_BRANCH_MANAGER]
      }
    ]
  },
  {
    id: "management",
    translationKey: "navigation.management",
    items: [
      {
        id: "branches",
        translationKey: "navigation.branches",
        titleKey: "navigation.branches",
        path: "/app/branches",
        icon: Store,
        requiredRoles: [ROLE_OWNER]
      },
      {
        id: "team",
        translationKey: "navigation.team",
        titleKey: "navigation.team",
        path: "/app/team",
        icon: Users,
        requiredRoles: [ROLE_OWNER]
      },
      {
        id: "settings",
        translationKey: "navigation.settings",
        titleKey: "navigation.settings",
        path: "/app/settings",
        icon: Settings,
        requiredRoles: [ROLE_OWNER]
      }
    ]
  }
];

export const navigationItems = navigationGroups.flatMap((group) => group.items.map((item) => ({ ...item, groupId: group.id })));
export const mobilePriorityItems = navigationItems.filter((item) => item.mobilePriority).slice(0, 4);

export function roleCanAccess(item, role) {
  return !item.requiredRoles || item.requiredRoles.includes(role || ROLE_VIEWER);
}

export function getNavigationForRole(role) {
  return navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => roleCanAccess(item, role))
  })).filter((group) => group.items.length > 0);
}

export function findNavigationItem(pathname) {
  return navigationItems.find((item) => item.path === pathname) || null;
}

export function isNavigationItemActive(item, pathname) {
  return item.path === pathname;
}
