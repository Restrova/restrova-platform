import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { LandingPage } from "../pages/LandingPage.jsx";
import { MotionControl } from "../components/brand/MotionControl.jsx";

afterEach(() => {
  delete document.documentElement.dataset.motion;
});
function show(children = <LandingPage />) {
  localStorage.setItem("locale", "ar");
  return render(
    <LocaleProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </LocaleProvider>
  );
}
it("offers Business access while clearly marking both future products as in development", () => {
  show();
  expect(screen.getAllByText("قيد التطوير")).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "اكتشف Restrova Business" })).toHaveLength(2);
  for (const link of screen.getAllByRole("link", { name: "اكتشف Restrova Business" }))
    expect(link).toHaveAttribute("href", "/login");
});
it("switches the full public page from Arabic RTL to English LTR", async () => {
  show();
  expect(document.documentElement.dir).toBe("rtl");
  await userEvent.selectOptions(screen.getByLabelText("تغيير اللغة"), "en");
  expect(document.documentElement.dir).toBe("ltr");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("GOOD FOOD.");
});
it("keeps the user's motion choice when moving between page controls", async () => {
  const first = show(<MotionControl />);
  await userEvent.click(screen.getByRole("button", { name: "إيقاف الحركة" }));
  expect(document.documentElement).toHaveAttribute("data-motion", "paused");
  first.unmount();
  show(<MotionControl />);
  expect(screen.getByRole("button", { name: "تشغيل الحركة" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "تشغيل الحركة" }));
  expect(document.documentElement).toHaveAttribute("data-motion", "active");
});
