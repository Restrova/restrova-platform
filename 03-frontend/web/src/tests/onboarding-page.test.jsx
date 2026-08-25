import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RegisterPage } from "../pages/RegisterPage.jsx";

const { authMock } = vi.hoisted(() => ({
  authMock: {
    isAuthenticated: false,
    register: vi.fn(),
    login: vi.fn()
  }
}));

vi.mock("../contexts/AuthContext.jsx", () => ({
  useAuth: () => authMock
}));

describe("restaurant onboarding", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "en");
    authMock.register.mockReset().mockResolvedValue({});
  });

  it("collects account, organization, restaurant, and first-branch details before registration", async () => {
    const user = userEvent.setup();

    render(
      <LocaleProvider>
        <MemoryRouter initialEntries={["/register"]}>
          <RegisterPage />
        </MemoryRouter>
      </LocaleProvider>
    );

    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "Demo Owner");
    await user.type(screen.getByLabelText("Email"), "owner@example.test");
    await user.type(screen.getByLabelText("Password"), "strongpass123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    expect(screen.getByRole("group", { name: "Set up the organization" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Currency"), "SAR");
    await user.selectOptions(screen.getByLabelText("Timezone"), "Asia/Riyadh");
    await user.selectOptions(screen.getByLabelText("Default language"), "en");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    expect(screen.getByRole("group", { name: "Set up the restaurant" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Restaurant"));
    await user.type(screen.getByLabelText("Restaurant"), "Restrova Test Kitchen");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    expect(screen.getByRole("group", { name: "Set up the first branch" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("First branch"));
    await user.type(screen.getByLabelText("First branch"), "Riyadh Main");
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "RUH-01");
    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "Riyadh");
    await user.click(screen.getByRole("button", { name: /Continue/ }));

    expect(screen.getByRole("group", { name: "Review and create" })).toBeInTheDocument();
    expect(screen.getByText("Restrova Test Kitchen")).toBeInTheDocument();
    expect(screen.getByText(/RUH-01/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    await waitFor(() =>
      expect(authMock.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Demo Owner",
          email: "owner@example.test",
          password: "strongpass123",
          restaurantName: "Restrova Test Kitchen",
          branchName: "Riyadh Main",
          branchCode: "RUH-01",
          city: "Riyadh",
          currency: "SAR",
          timezone: "Asia/Riyadh",
          language: "en"
        })
      )
    );
  });
});
