import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { ErrorState } from "../components/ui/ErrorState.jsx";
import { FormField } from "../components/ui/FormField.jsx";
import { Input } from "../components/ui/Input.jsx";
import { StatusBadge } from "../components/ui/StatusBadge.jsx";
import { renderWithLocale } from "./test-utils.jsx";

describe("UI primitives", () => {
  it("renders button variants, disabled/loading states and click behavior", async () => {
    const onClick = vi.fn();
    renderWithLocale(
      <>
        <Button variant="danger" onClick={onClick}>
          Delete
        </Button>
        <Button loading loadingLabel="Saving">
          Save
        </Button>
        <Button aria-label="Icon only">★</Button>
      </>
    );

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toHaveClass("ui-button--danger");
    await userEvent.click(deleteButton);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /saving.*save/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Icon only" })).toBeInTheDocument();
  });

  it("associates labels, descriptions, errors and disabled input state", () => {
    renderWithLocale(
      <FormField label="Email" description="Work email" error="Required field" required id="email">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} invalid={invalid} disabled type="email" />
        )}
      </FormField>
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-describedby", expect.stringContaining("email-description"));
    expect(input).toHaveAttribute("aria-describedby", expect.stringContaining("email-error"));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();
    expect(screen.getByText("مطلوب")).toBeInTheDocument();
  });

  it("renders badges, translated status text and unknown status fallback", () => {
    renderWithLocale(
      <>
        <Badge variant="success">Ready</Badge>
        <StatusBadge status="complete" />
        <StatusBadge status="not_real" />
      </>
    );
    expect(screen.getByText("Ready")).toHaveClass("ui-badge--success");
    expect(screen.getByText("مكتمل")).toBeInTheDocument();
    expect(screen.getByText("محايد")).toBeInTheDocument();
  });

  it("renders empty and error states with translated defaults and action callbacks", async () => {
    const retry = vi.fn();
    const action = <Button onClick={retry}>Action</Button>;
    renderWithLocale(
      <>
        <EmptyState primaryAction={action} />
        <ErrorState type="network" onRetry={retry} />
      </>
    );
    expect(screen.getByText("لا توجد بيانات بعد")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Action" }));
    await userEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("opens, focuses, cancels, confirms, escapes and restores focus in confirmation dialog", async () => {
    const onConfirm = vi.fn();
    renderWithLocale(
      <ConfirmationDialog
        trigger={<Button>Open dialog</Button>}
        title="Confirm change"
        description="Approve this operation?"
        onConfirm={onConfirm}
        danger
      />
    );

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Confirm change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إغلاق" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows loading confirmation state", () => {
    renderWithLocale(
      <ConfirmationDialog open title="Saving" description="Please wait." loading onOpenChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: /loading.*تأكيد/i })).toBeDisabled();
  });
});
