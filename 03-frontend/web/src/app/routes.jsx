import { Navigate, Route, Routes } from "react-router-dom";
import { AuthBoundary } from "../components/auth/AuthBoundary.jsx";
import { AppShell } from "../components/layout/AppShell.jsx";
import { navigationItems } from "./navigation.js";
import { DesignSystemPage } from "../pages/DesignSystemPage.jsx";
import { BranchesPage } from "../pages/BranchesPage.jsx";
import { LegacyWorkspacePage } from "../pages/LegacyWorkspacePage.jsx";
import { ImportWizardPage } from "../pages/ImportWizardPage.jsx";
import { FinancialDashboardPage } from "../pages/FinancialDashboardPage.jsx";
import { LoginPage } from "../pages/LoginPage.jsx";
import { NotFoundPage } from "../pages/NotFoundPage.jsx";
import { PlaceholderPage } from "../pages/PlaceholderPage.jsx";
import { RegisterPage } from "../pages/RegisterPage.jsx";
import { TeamPage } from "../pages/TeamPage.jsx";
import { UnauthorizedPage } from "../pages/UnauthorizedPage.jsx";

const descriptionsById = {
  dashboard:
    "Validated restaurant metrics and the highest-priority recommendation will appear here in the next implementation phase.",
  imports:
    "The complete CSV and XLSX validation workflow will be developed in a later phase. Existing import functionality remains available in the current workspace.",
  menuProfitability:
    "This page will compare net sales, direct costs, delivery commissions and estimated contribution margin for each menu item.",
  salesComparison: "This page will compare sales performance across operating days, branches and time periods.",
  alerts: "Operational alerts for stock, refunds and unusual sales patterns will appear here in a later phase.",
  recommendations: "Approved AI recommendations and their follow-up status will be managed here later.",
  reports: "Owner-ready daily and weekly reports will be generated here in a later implementation phase.",
  assistant:
    "The dedicated assistant experience will move here after the shell and navigation foundation are complete.",
  dataQuality: "This page will show missing, stale or conflicting restaurant data before decisions are made.",
  settings: "Restaurant, currency, timezone and language settings will be organized here in a later phase."
};

export function shouldShowDesignSystemRoute(env = import.meta.env) {
  return Boolean(env.DEV || env.MODE === "test");
}

export function AppRoutes() {
  const showDesignSystem = shouldShowDesignSystemRoute();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/workspace" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      {showDesignSystem && <Route path="/dev/design-system" element={<DesignSystemPage />} />}
      <Route element={<AuthBoundary />}>
        <Route element={<AppShell />}>
          <Route path="/app" element={<Navigate to="/app/workspace" replace />} />
          <Route path="/app/workspace" element={<LegacyWorkspacePage />} />
          <Route path="/app/dashboard" element={<FinancialDashboardPage />} />
          <Route path="/app/imports" element={<ImportWizardPage />} />
          <Route path="/app/branches" element={<BranchesPage />} />
          <Route path="/app/team" element={<TeamPage />} />
          {navigationItems
            .filter((item) => !["dashboard", "workspace", "imports", "branches", "team"].includes(item.id))
            .map((item) => (
              <Route
                key={item.path}
                path={item.path}
                element={<PlaceholderPage titleKey={item.titleKey} description={descriptionsById[item.id]} />}
              />
            ))}
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
