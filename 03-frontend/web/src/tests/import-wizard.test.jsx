import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportWizardPage } from "../pages/ImportWizardPage.jsx";
import * as importsApi from "../lib/imports.js";

vi.mock("../lib/imports.js", () => ({
  listImportTemplates: vi.fn(),
  downloadImportTemplate: vi.fn(),
  previewImportFile: vi.fn(),
  updateImportMapping: vi.fn(),
  confirmImportJob: vi.fn(),
  cancelImportJob: vi.fn()
}));

const templates = [
  {
    key: "branches",
    displayName: "Branches",
    description: "Create or update restaurant branches.",
    requiredColumns: ["branch_code", "name", "city"],
    optionalColumns: ["address"]
  }
];

const readyJob = {
  id: 12,
  templateKey: "branches",
  status: "preview_ready",
  validationStatus: "ready",
  confirmationToken: "confirm-me",
  file: { name: "branches.csv", byteSize: 128 },
  mapping: {
    sourceHeaders: ["Branch Code", "Name", "City"],
    columns: [
      { sourceColumn: "Branch Code", targetField: "branch_code", confidence: "exact_alias" },
      { sourceColumn: "Name", targetField: "name", confidence: "exact_alias" },
      { sourceColumn: "City", targetField: "city", confidence: "exact_alias" }
    ],
    targetFields: [
      { name: "branch_code", required: true, type: "string" },
      { name: "name", required: true, type: "string" },
      { name: "city", required: true, type: "string" }
    ],
    ready: true,
    missingRequiredMappings: [],
    warnings: []
  },
  statistics: { total: 1, accepted: 1, rejected: 0, duplicates: 0, warnings: 0, imported: 0 },
  previewRows: [{ rowNumber: 2, status: "accepted", raw: { "Branch Code": "MAIN", Name: "Main", City: "Riyadh" } }],
  rowErrors: [],
  rowWarnings: []
};

describe("ImportWizardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importsApi.listImportTemplates.mockResolvedValue(templates);
  });

  it("completes template selection, upload preview and shows confirmation", async () => {
    const user = userEvent.setup();
    importsApi.previewImportFile.mockResolvedValue(readyJob);

    render(<ImportWizardPage />);

    expect(await screen.findByText("Branches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose" }));

    const file = new File(["Branch Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Validate file" }));

    expect(await screen.findByText("Validation results")).toBeInTheDocument();
    expect(screen.getByText("Ready to confirm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
    expect(importsApi.previewImportFile).toHaveBeenCalledWith({ templateKey: "branches", file });
  });

  it("saves a manual mapping when required fields are missing", async () => {
    const user = userEvent.setup();
    const needsMapping = {
      ...readyJob,
      validationStatus: "needs_mapping",
      confirmationToken: null,
      mapping: {
        ...readyJob.mapping,
        ready: false,
        missingRequiredMappings: ["branch_code"],
        columns: [
          { sourceColumn: "Code", targetField: null, confidence: "unmapped" },
          { sourceColumn: "Name", targetField: "name", confidence: "exact_alias" },
          { sourceColumn: "City", targetField: "city", confidence: "exact_alias" }
        ]
      }
    };
    importsApi.previewImportFile.mockResolvedValue(needsMapping);
    importsApi.updateImportMapping.mockResolvedValue(readyJob);

    render(<ImportWizardPage />);
    await user.click(await screen.findByRole("button", { name: "Choose" }));
    const file = new File(["Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Validate file" }));

    const select = await screen.findByLabelText("Map Code");
    await user.selectOptions(select, "branch_code");
    await user.click(screen.getByRole("button", { name: "Save mapping & validate" }));

    await waitFor(() => expect(importsApi.updateImportMapping).toHaveBeenCalled());
    expect(await screen.findByText("Ready to confirm")).toBeInTheDocument();
  });

  it("confirms a ready import and shows the completion state", async () => {
    const user = userEvent.setup();
    importsApi.previewImportFile.mockResolvedValue(readyJob);
    importsApi.confirmImportJob.mockResolvedValue({
      ...readyJob,
      status: "confirmed",
      confirmationToken: null,
      statistics: { ...readyJob.statistics, imported: 1 }
    });

    render(<ImportWizardPage />);
    await user.click(await screen.findByRole("button", { name: "Choose" }));
    const file = new File(["Branch Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Validate file" }));
    await user.click(await screen.findByRole("button", { name: "Confirm import" }));

    expect(await screen.findByRole("heading", { name: "Import completed" })).toBeInTheDocument();
    expect(screen.getByText("1 rows were imported successfully.")).toBeInTheDocument();
    expect(importsApi.confirmImportJob).toHaveBeenCalledWith(12, "confirm-me");
  });

  it("blocks confirmation and explains row-level validation errors", async () => {
    const user = userEvent.setup();
    importsApi.previewImportFile.mockResolvedValue({
      ...readyJob,
      validationStatus: "validation_failed",
      confirmationToken: null,
      statistics: { ...readyJob.statistics, accepted: 0, rejected: 1 },
      rowErrors: [
        {
          rowNumber: 2,
          errors: [
            {
              field: "city",
              sourceColumn: "City",
              value: "",
              message: "city is required."
            }
          ]
        }
      ]
    });

    render(<ImportWizardPage />);
    await user.click(await screen.findByRole("button", { name: "Choose" }));
    const file = new File(["Branch Code,Name,City\nMAIN,Main,\n"], "branches.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Validate file" }));

    expect(await screen.findByText("Action required")).toBeInTheDocument();
    expect(screen.getByText("city is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  });

  it("cancels a staged import without confirming it", async () => {
    const user = userEvent.setup();
    importsApi.previewImportFile.mockResolvedValue(readyJob);
    importsApi.cancelImportJob.mockResolvedValue({
      ...readyJob,
      status: "cancelled",
      confirmationToken: null
    });

    render(<ImportWizardPage />);
    await user.click(await screen.findByRole("button", { name: "Choose" }));
    const file = new File(["Branch Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Validate file" }));
    await user.click(await screen.findByRole("button", { name: "Cancel import" }));

    expect(await screen.findByRole("heading", { name: "Import cancelled" })).toBeInTheDocument();
    expect(importsApi.cancelImportJob).toHaveBeenCalledWith(12);
    expect(importsApi.confirmImportJob).not.toHaveBeenCalled();
  });
});
