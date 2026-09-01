import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportWizardPage } from "../pages/ImportWizardPage.jsx";
import * as importsApi from "../lib/imports.js";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";

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
  detection: {
    mode: "automatic",
    templateKey: "branches",
    displayName: "Branches",
    confidence: "high",
    requiredCoverageBps: 10000,
    matchedFields: ["branch_code", "name", "city"]
  },
  datasetEvaluation: {
    rowCount: 1,
    columnCount: 3,
    completenessBps: 10000,
    duplicateRows: 0,
    numericColumns: [],
    importReady: true,
    missingRequiredFields: [],
    mode: "operational_import"
  },
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

function renderPage() {
  return render(
    <LocaleProvider>
      <ImportWizardPage />
    </LocaleProvider>
  );
}

describe("ImportWizardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("locale", "en");
    importsApi.listImportTemplates.mockResolvedValue(templates);
  });

  it("automatically detects the file type, evaluates it and shows confirmation", async () => {
    const user = userEvent.setup();
    importsApi.previewImportFile.mockResolvedValue(readyJob);

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Upload a file and let Restrova identify it" })
    ).toBeInTheDocument();

    const file = new File(["Branch Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Analyze and evaluate file" }));

    expect(await screen.findByRole("heading", { name: "Branches" })).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dataset quality summary" })).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    expect(await screen.findByText("Validation results")).toBeInTheDocument();
    expect(screen.getByText("Ready to confirm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
    expect(importsApi.previewImportFile).toHaveBeenCalledWith({ templateKey: undefined, file });
    expect(screen.getByLabelText("Map Branch Code")).not.toBeVisible();
    await user.click(screen.getByText("Columns matched automatically"));
    expect(screen.getByLabelText("Map Branch Code")).toBeVisible();
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

    renderPage();
    const file = new File(["Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Analyze and evaluate file" }));

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

    renderPage();
    const file = new File(["Branch Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Analyze and evaluate file" }));
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

    renderPage();
    const file = new File(["Branch Code,Name,City\nMAIN,Main,\n"], "branches.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Analyze and evaluate file" }));

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

    renderPage();
    const file = new File(["Branch Code,Name,City\nMAIN,Main,Riyadh\n"], "branches.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Analyze and evaluate file" }));
    await user.click(await screen.findByRole("button", { name: "Cancel import" }));

    expect(await screen.findByRole("heading", { name: "Import cancelled" })).toBeInTheDocument();
    expect(importsApi.cancelImportJob).toHaveBeenCalledWith(12);
    expect(importsApi.confirmImportJob).not.toHaveBeenCalled();
  });

  it("shows analytical evaluation without POS mapping controls", async () => {
    const user = userEvent.setup();
    importsApi.previewImportFile.mockResolvedValue({
      ...readyJob,
      validationStatus: "needs_mapping",
      confirmationToken: null,
      datasetEvaluation: {
        rowCount: 10000,
        columnCount: 13,
        completenessBps: 10000,
        duplicateRows: 3,
        numericColumns: [
          { column: "actual_selling_price", count: 10000, minimum: 5.5, average: 42.25, maximum: 112.3 }
        ],
        importReady: false,
        missingRequiredFields: ["external_order_id"],
        mode: "analysis_only"
      }
    });

    renderPage();
    const file = new File(["date,menu_item_name,quantity_sold\n1/1/2024,Saltah,10"], "sales.csv", {
      type: "text/csv"
    });
    await user.upload(await screen.findByLabelText("CSV or XLSX file"), file);
    await user.click(screen.getByRole("button", { name: "Analyze and evaluate file" }));

    expect(await screen.findByRole("heading", { name: "Dataset quality summary" })).toBeInTheDocument();
    expect(screen.getByText("10,000")).toBeInTheDocument();
    expect(screen.getByText("42.25")).not.toBeVisible();
    await user.click(screen.getByText("View detailed statistics (optional)"));
    expect(screen.getByText("42.25")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Review column mapping" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm import" })).not.toBeInTheDocument();
    expect(screen.getByText("File analysis complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to decision center" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Analyze another file" })).toBeEnabled();
  });
});
