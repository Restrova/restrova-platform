import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { shouldShowDesignSystemRoute } from "../app/routes.jsx";
import { DesignSystemPage } from "../pages/DesignSystemPage.jsx";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";

describe("design-system development route", () => {
  it("is enabled in development/test and disabled for production env", () => {
    expect(shouldShowDesignSystemRoute({ DEV: true, MODE: "development" })).toBe(true);
    expect(shouldShowDesignSystemRoute({ DEV: false, MODE: "test" })).toBe(true);
    expect(shouldShowDesignSystemRoute({ DEV: false, MODE: "production" })).toBe(false);
  });

  it("renders the showcase route in tests", () => {
    render(
      <LocaleProvider>
        <MemoryRouter initialEntries={["/dev/design-system"]}>
          <Routes>
            <Route path="/dev/design-system" element={<DesignSystemPage />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    );
    expect(screen.getByRole("heading", { name: "نظام التصميم" })).toBeInTheDocument();
  });
});
