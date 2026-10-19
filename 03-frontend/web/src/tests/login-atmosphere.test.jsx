import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { LoginPage } from "../pages/LoginPage.jsx";

vi.mock("../contexts/AuthContext.jsx", () => ({ useAuth: () => ({ isAuthenticated: false }) }));
afterEach(() => vi.unstubAllGlobals());
function show({ desktop = true, reduced = false } = {}) {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query.includes("min-width") ? desktop : reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  localStorage.setItem("locale", "ar");
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </LocaleProvider>
  );
}
it.each([{ desktop: false }, { reduced: true }, { desktop: true }])(
  "uses static Restrova artwork without autoplay media: %j",
  (settings) => {
    const { container } = show(settings);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector(".brand-story__art img")).toHaveAttribute("src", "/images/restrova/brand-hero.webp");
    expect(screen.getByRole("complementary", { name: "عالم Restrova" })).toBeInTheDocument();
    expect(container.querySelectorAll(".brand-family__product")).toHaveLength(3);
    expect(container.querySelectorAll(".brand-family a")).toHaveLength(0);
    expect(screen.getAllByText("قريبًا")).toHaveLength(2);
  }
);
it("switches the public form from Arabic RTL to English LTR and preserves the password toggle", async () => {
  show();
  const user = userEvent.setup();
  expect(document.documentElement.dir).toBe("rtl");
  await user.selectOptions(screen.getByLabelText("تغيير اللغة"), "en");
  expect(document.documentElement.dir).toBe("ltr");
  expect(screen.getByRole("heading", { name: /Welcome back/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
});
