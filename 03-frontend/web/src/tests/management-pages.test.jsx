import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import * as management from "../lib/management.js";
import { BranchesPage } from "../pages/BranchesPage.jsx";
import { TeamPage } from "../pages/TeamPage.jsx";

const { authMock } = vi.hoisted(() => ({
  authMock: {
    user: { id: 1, email: "owner@example.test", role: "owner" },
    restore: vi.fn()
  }
}));

vi.mock("../contexts/AuthContext.jsx", () => ({
  useAuth: () => authMock
}));

vi.mock("../lib/management.js", () => ({
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  listUsers: vi.fn(),
  inviteUser: vi.fn(),
  updateUserRole: vi.fn()
}));

const branches = [
  {
    id: 11,
    name: "Main Branch",
    code: "MAIN",
    city: "Riyadh",
    operating_day_start: "10:00",
    operating_day_end: "02:00"
  }
];

function renderLocalized(ui) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe("branch and team management", () => {
  beforeEach(() => {
    localStorage.setItem("locale", "en");
    vi.clearAllMocks();
    management.listBranches.mockResolvedValue(branches);
    management.listUsers.mockResolvedValue([
      { id: 1, name: "Owner", email: "owner@example.test", role: "owner", branch_id: null },
      { id: 2, name: "Viewer", email: "viewer@example.test", role: "viewer", branch_id: null }
    ]);
    management.createBranch.mockResolvedValue({ id: 12 });
    management.updateBranch.mockResolvedValue({});
    management.inviteUser.mockResolvedValue({
      id: 3,
      email: "manager@example.test",
      temporaryPassword: "temporary-123"
    });
    management.updateUserRole.mockResolvedValue({ updated: true });
    authMock.restore.mockResolvedValue({});
  });

  it("creates a scoped branch and refreshes the authenticated restaurant context", async () => {
    const user = userEvent.setup();
    renderLocalized(<BranchesPage />);

    expect(await screen.findByText("Main Branch")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Branch name"));
    await user.type(screen.getByLabelText("Branch name"), "North Branch");
    await user.clear(screen.getByLabelText("Branch code"));
    await user.type(screen.getByLabelText("Branch code"), "NORTH");
    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "Jeddah");
    await user.click(screen.getByRole("button", { name: "Create branch" }));

    await waitFor(() =>
      expect(management.createBranch).toHaveBeenCalledWith(
        expect.objectContaining({ name: "North Branch", code: "NORTH", city: "Jeddah" })
      )
    );
    expect(authMock.restore).toHaveBeenCalled();
    expect(await screen.findByText("Branch created.")).toBeInTheDocument();
  });

  it("invites a branch manager and displays the one-time credential", async () => {
    const user = userEvent.setup();
    renderLocalized(<TeamPage />);

    await screen.findByText("viewer@example.test");
    await user.type(screen.getByLabelText("Email"), "manager@example.test");
    await user.selectOptions(screen.getByLabelText("Role"), "branch_manager");
    await user.selectOptions(screen.getByLabelText("Branch"), "11");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(management.inviteUser).toHaveBeenCalledWith({
        name: undefined,
        email: "manager@example.test",
        role: "branch_manager",
        branchId: 11
      })
    );
    expect(await screen.findByText("temporary-123")).toBeInTheDocument();
    expect(screen.getByText("Shown once")).toBeInTheDocument();
  });

  it("updates a member role with an explicit branch scope", async () => {
    const user = userEvent.setup();
    renderLocalized(<TeamPage />);

    await screen.findByText("viewer@example.test");
    await user.selectOptions(screen.getByLabelText("Role viewer@example.test"), "branch_manager");
    await user.selectOptions(screen.getByLabelText("Branch viewer@example.test"), "11");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(management.updateUserRole).toHaveBeenCalledWith(2, { role: "branch_manager", branchId: 11 })
    );
    expect(await screen.findByText("Role updated.")).toBeInTheDocument();
  });
});
