import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RegisterPage } from "../pages/RegisterPage.jsx";

const { authMock, checkEmail } = vi.hoisted(() => ({
  checkEmail: vi.fn(),
  authMock: {
    isAuthenticated: false,
    register: vi.fn(),
    login: vi.fn()
  }
}));

vi.mock("../contexts/AuthContext.jsx", () => ({
  useAuth: () => authMock
}));
vi.mock("../lib/auth.js", () => ({ checkEmailAvailabilityRequest: checkEmail }));

describe("restaurant onboarding", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "en");
    authMock.register.mockReset().mockResolvedValue({});
    checkEmail.mockReset().mockResolvedValue({ available: true });
  });

  it("checks email before step two and lets the owner correct a duplicate or retry a failed check", async () => {
    const user = userEvent.setup();
    checkEmail.mockResolvedValueOnce({ available: false }).mockRejectedValueOnce(new Error("offline"));
    render(
      <LocaleProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </LocaleProvider>
    );
    await user.type(screen.getByLabelText("Email"), "duplicate@example.test");
    await user.type(screen.getByLabelText("Password"), "strongpass123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already registered");
    expect(screen.getByLabelText("Email")).toHaveValue("duplicate@example.test");
    expect(screen.queryByLabelText("Organization")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "available@example.test");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
    expect(screen.getByLabelText("Password")).toHaveValue("strongpass123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByRole("group", { name: "Set up the organization" })).toBeInTheDocument();
    expect(authMock.register).not.toHaveBeenCalled();
  });

  it("stays on the account step for an invalid email and locks inputs during verification", async () => {
    const user = userEvent.setup();
    let resolveCheck;
    checkEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        })
    );
    render(
      <LocaleProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </LocaleProvider>
    );
    await user.type(screen.getByLabelText("Email"), "invalid");
    await user.type(screen.getByLabelText("Password"), "strongpass123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(checkEmail).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "valid@example.test");
    await user.dblClick(screen.getByRole("button", { name: /Continue/ }));
    expect(checkEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Email")).toBeDisabled();
    resolveCheck({ available: true });
    expect(await screen.findByLabelText("Organization")).toBeInTheDocument();
  });

  it("returns to the account step if an available email is registered before final submission", async () => {
    const user = userEvent.setup();
    authMock.register.mockRejectedValueOnce({ status: 409 });
    render(
      <LocaleProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </LocaleProvider>
    );
    await user.type(screen.getByLabelText("Email"), "race@example.test");
    await user.type(screen.getByLabelText("Password"), "strongpass123");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.clear(screen.getByLabelText("Restaurant"));
    await user.type(screen.getByLabelText("Restaurant"), "Retained Restaurant");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already registered");
    expect(screen.getByLabelText("Email")).toHaveValue("race@example.test");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "new-address@example.test");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByLabelText("Restaurant")).toHaveValue("Retained Restaurant");
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
