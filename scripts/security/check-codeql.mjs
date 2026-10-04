import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function evaluateCodeql(report) {
  if (!Array.isArray(report.runs) || !report.runs.length) throw new Error("Missing CodeQL scan runs");
  let total = 0;
  let blocking = 0;
  for (const run of report.runs) {
    if (!Array.isArray(run.results) || !Array.isArray(run.tool?.driver?.rules)) throw new Error("Invalid CodeQL run");
    for (const result of run.results) {
      total++;
      const componentIndex = result.rule?.toolComponent?.index;
      const component = componentIndex === undefined ? run.tool.driver : run.tool.extensions?.[componentIndex];
      const ruleId = result.ruleId ?? result.rule?.id;
      const rule = component?.rules?.find((entry) => entry.id === ruleId);
      if (!rule) throw new Error("Missing result rule metadata");
      const raw = rule.properties?.["security-severity"];
      // Non-security diagnostics are retained for review, not assigned an invented CVSS score.
      if (raw === undefined) continue;
      const score = Number(raw);
      if (raw === "" || !Number.isFinite(score) || score < 0 || score > 10)
        throw new Error("Invalid security severity");
      if (score >= 7) blocking++;
    }
  }
  return { total, blocking };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const directory = process.argv[2];
    const files = readdirSync(directory).filter((file) => file.endsWith(".sarif"));
    if (!files.length) throw new Error("No source scan evidence");
    const counts = files.map((file) => evaluateCodeql(JSON.parse(readFileSync(join(directory, file), "utf8"))));
    const total = counts.reduce((sum, count) => sum + count.total, 0);
    const blocking = counts.reduce((sum, count) => sum + count.blocking, 0);
    console.log(`Source findings: ${total}; high/critical: ${blocking}`);
    if (blocking) process.exitCode = 1;
  } catch (error) {
    console.error(`Source scan gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
