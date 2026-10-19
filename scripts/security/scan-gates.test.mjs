import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCodeql } from "./check-codeql.mjs";
import { evaluateContainer } from "./check-container.mjs";
const source = (scores) => ({
  runs: [
    {
      tool: {
        driver: { rules: scores.map((score, i) => ({ id: `rule-${i}`, properties: { "security-severity": score } })) }
      },
      results: scores.map((_, i) => ({ ruleId: `rule-${i}` }))
    }
  ]
});
const container = (findings) => ({
  SchemaVersion: 2,
  Metadata: { OS: { Family: "debian" } },
  Results: [{ Target: "restrova (debian 13)", Type: "debian", Vulnerabilities: findings }]
});
test("source gate blocks both new and existing high/critical findings", () => {
  assert.deepEqual(evaluateCodeql(source(["6.9", "7", "9.8"])), { total: 3, blocking: 2 });
  assert.deepEqual(evaluateCodeql(source([])), { total: 0, blocking: 0 });
});
test("source gate fails closed for missing scan output or malformed severity", () => {
  for (const report of [
    {},
    { runs: [] },
    ...["bad", "", " ", "11", null, false, [], ["8"], {}].map((severity) => source([severity]))
  ])
    assert.throws(() => evaluateCodeql(report));
  const report = source(["8"]);
  report.runs[0].tool.driver.rules = [];
  assert.throws(() => evaluateCodeql(report));
});
test("container gate does not bypass high findings without published fixes", () => {
  assert.deepEqual(
    evaluateContainer(
      container([
        { VulnerabilityID: "CVE-1", Severity: "HIGH" },
        { VulnerabilityID: "CVE-2", Severity: "CRITICAL", FixedVersion: "2" },
        { VulnerabilityID: "CVE-3", Severity: "LOW", FixedVersion: "2" }
      ])
    ),
    { total: 3, blocking: 2, unfixed: 1 }
  );
});
test("container gate accepts clean evidence and rejects missing evidence", () => {
  assert.deepEqual(evaluateContainer(container([])), { total: 0, blocking: 0, unfixed: 0 });
  for (const report of [{}, { SchemaVersion: 2, Results: [] }, container([{ Severity: "HIGH" }])])
    assert.throws(() => evaluateContainer(report));
});

test("source gate resolves CodeQL extension rule metadata", () => {
  const report = source(["8"]);
  const run = report.runs[0];
  run.tool.extensions = [{ name: "codeql/javascript-queries", rules: run.tool.driver.rules }];
  run.tool.driver.rules = [];
  run.results[0].rule = { id: "rule-0", index: 0, toolComponent: { index: 0 } };
  assert.deepEqual(evaluateCodeql(report), { total: 1, blocking: 1 });
  run.results[0].rule.toolComponent.index = 1;
  assert.throws(() => evaluateCodeql(report));
});

test("container gate rejects empty or malformed scan results rather than reporting a clean scan", () => {
  for (const results of [[], [null], [{}], [{ Target: "restrova", Type: "debian", Vulnerabilities: {} }]])
    assert.throws(() => evaluateContainer({ ...container([]), Results: results }));
  for (const os of [null, {}, { Family: "" }, { Family: true }])
    assert.throws(() => evaluateContainer({ ...container([]), Metadata: { OS: os } }));
  const report = container([]);
  delete report.Results[0].Vulnerabilities;
  assert.deepEqual(evaluateContainer(report), { total: 0, blocking: 0, unfixed: 0 });
});

test("source gate preserves non-security diagnostics without inventing security severity", () => {
  const report = source(["8"]);
  delete report.runs[0].tool.driver.rules[0].properties["security-severity"];
  assert.deepEqual(evaluateCodeql(report), { total: 1, blocking: 0 });
});
