import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  financialAssumptions,
  financialCategories,
  getFinancialModel,
  taxTreatmentPolicy
} from "../src/services/financialService.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const financialDocsDirectory = path.join(repositoryRoot, "docs", "financial");

function readRepositoryFile(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function readFinancialDoc(fileName) {
  return readFileSync(path.join(financialDocsDirectory, fileName), "utf8");
}

function implementationVersion(relativePath, field) {
  const source = readRepositoryFile(relativePath);
  const match = source.match(new RegExp(`${field}:\\s*"([^"]+)"`));
  assert.ok(match, `${field} must remain a literal version in ${relativePath}`);
  return match[1];
}

test("Task 3.8 documents every ledger category, assumption, and tax-policy value", () => {
  const metricReference = readFinancialDoc("metric-reference.md");
  const assumptions = readFinancialDoc("assumptions.md");

  for (const { key } of financialCategories) {
    assert.match(metricReference, new RegExp(`\\x60${key}\\x60`), `Missing documented category ${key}`);
  }
  for (const assumption of financialAssumptions) {
    assert.ok(assumptions.includes(assumption), `Missing engine assumption: ${assumption}`);
  }
  for (const [field, value] of Object.entries(taxTreatmentPolicy)) {
    assert.ok(assumptions.includes(field), `Missing tax policy field ${field}`);
    assert.ok(assumptions.includes(value), `Missing tax policy value ${value}`);
  }
});

test("Task 3.8 keeps the documentation version matrix aligned with implementation literals", () => {
  const index = readFinancialDoc("README.md");
  const releaseNotes = readFinancialDoc("release-notes.md");
  const versions = [
    String(getFinancialModel().version),
    implementationVersion("02-backend/server/src/services/financialService.js", "formulaVersion"),
    implementationVersion("02-backend/server/src/services/financialPeriodService.js", "periodVersion"),
    implementationVersion("02-backend/server/src/services/financialReportService.js", "reportVersion"),
    implementationVersion("02-backend/server/src/services/financialDashboardService.js", "dashboardVersion")
  ];

  for (const version of versions) {
    assert.ok(index.includes(`\`${version}\``), `Financial index is missing version ${version}`);
    assert.ok(releaseNotes.includes(`\`${version}\``), `Release notes are missing version ${version}`);
  }
});

test("Task 3.8 publishes complete examples, lineage, assumptions, and release history", () => {
  const examples = readFinancialDoc("calculation-examples.md");
  const lineage = readFinancialDoc("lineage-and-audit.md");
  const assumptions = readFinancialDoc("assumptions.md");
  const releaseNotes = readFinancialDoc("release-notes.md");

  for (const fragment of [
    "Revenue = 15000 − 1000 − 500 = `13500`",
    "Gross margin = round(9500 × 10000 ÷ 13500) = `7037`",
    "Net margin = round(4000 × 10000 ÷ 13500) = `2963`",
    "AOV = round(13500 ÷ 2) = `6750`",
    "Cost per order = round(9500 ÷ 2) = `4750`",
    "Gross/contribution/net margin | `null`"
  ]) {
    assert.ok(examples.includes(fragment), `Worked examples are missing: ${fragment}`);
  }
  for (const fragment of ["source_reference", "missingCategories", "unallocated", "reconciliation", "cross-tenant"]) {
    assert.ok(lineage.includes(fragment), `Lineage guide is missing: ${fragment}`);
  }
  for (const fragment of ["Tax treatment", "Currency", "Time and operating periods", "Not an accounting close"]) {
    assert.ok(assumptions.includes(fragment), `Assumptions guide is missing: ${fragment}`);
  }
  for (let task = 1; task <= 8; task += 1) {
    assert.ok(releaseNotes.includes(`Task 3.${task}`), `Release notes are missing Task 3.${task}`);
  }
});

test("Task 3.8 financial documentation navigation contains no broken local links", () => {
  const indexPath = path.join(financialDocsDirectory, "README.md");
  const index = readFileSync(indexPath, "utf8");
  const localLinks = [...index.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)].map((match) => match[1].split("#")[0]);

  assert.ok(localLinks.length >= 10);
  for (const target of localLinks) {
    assert.ok(
      existsSync(path.resolve(financialDocsDirectory, target)),
      `Broken financial documentation link: ${target}`
    );
  }

  assert.ok(readRepositoryFile("README.md").includes("docs/financial/README.md"));
  assert.ok(readRepositoryFile("02-backend/README.md").includes("../docs/financial/README.md"));
  assert.ok(readRepositoryFile("CHANGELOG.md").includes("docs/financial/release-notes.md"));
});
