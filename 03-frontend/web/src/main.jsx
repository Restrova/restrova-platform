import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { Providers } from "./app/providers.jsx";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/utilities.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/import-wizard.css";
import "./styles/financial-dashboard.css";
import "./styles/menu-profitability.css";
import "./styles/onboarding.css";
import "./styles.css";
import "./decision.css";
import "./data-panel.css";
import "./feedback.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
);
