import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const menuDocs = resolve(repositoryRoot, "docs/menu");

test("Task 4.8 documents the complete versioned menu pipeline and QA release gate", () => {
  const index = readFileSync(resolve(menuDocs, "README.md"), "utf8");
  const qa = readFileSync(resolve(menuDocs, "qa-release-checklist.md"), "utf8");
  for (const version of ["4.1-v1", "4.2-v1", "4.3-v1", "4.4-v1", "4.5-v1", "4.6-v1", "4.7-v1"]) {
    assert.match(index, new RegExp(version.replace(".", "\\.")));
  }
  for (const endpoint of [
    "/api/menu/costs",
    "/api/menu/margins",
    "/api/menu/engineering-matrix",
    "/api/menu/price-simulation",
    "/api/menu/cost-simulation",
    "/api/menu/recommendations"
  ]) {
    assert.match(qa, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  for (const phrase of [
    "integer minor units",
    "integer basis points",
    "Arabic RTL",
    "Chinese",
    "organization",
    "branch",
    "pnpm validate",
    "rollback"
  ]) {
    assert.match(qa, new RegExp(phrase, "i"));
  }
});

test("Task 4.8 menu documentation navigation contains no broken local links", () => {
  const files = ["README.md", "qa-release-checklist.md"];
  for (const filename of files) {
    const path = resolve(menuDocs, filename);
    const content = readFileSync(path, "utf8");
    for (const [, target] of content.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
      if (/^(https?:|\/)/.test(target)) continue;
      assert.equal(existsSync(resolve(dirname(path), target)), true, `${filename} links to missing ${target}`);
    }
  }
});
