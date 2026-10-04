import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function evaluateContainer(report) {
  if (report.SchemaVersion !== 2 || !Array.isArray(report.Results) || !report.Metadata?.OS)
    throw new Error("Missing container scan evidence");
  let total = 0;
  let blocking = 0;
  let unfixed = 0;
  for (const result of report.Results) {
    for (const finding of result.Vulnerabilities || []) {
      if (!finding.VulnerabilityID || !["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(finding.Severity))
        throw new Error("Invalid vulnerability record");
      total++;
      if (!finding.FixedVersion) unfixed++;
      if (["HIGH", "CRITICAL"].includes(finding.Severity)) blocking++;
    }
  }
  return { total, blocking, unfixed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { total, blocking, unfixed } = evaluateContainer(JSON.parse(readFileSync(process.argv[2], "utf8")));
    console.log(`Container findings: ${total}; high/critical: ${blocking}; no published fix: ${unfixed}`);
    if (blocking) process.exitCode = 1;
  } catch (error) {
    console.error(`Container scan gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
