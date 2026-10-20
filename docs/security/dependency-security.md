# Dependency security maintenance

Related: #129; dependency scanning contributes to #128. Code and container scanning have separate gates and evidence described in [vulnerability-scanning.md](vulnerability-scanning.md).

## Gate and evidence

The `Dependency security` workflow scans the committed lockfile on pull requests, main pushes, weekly on Monday at 01:00 UTC, and manual dispatch. It has read-only repository permissions, installs without lifecycle scripts, and audits production **and development** dependencies. It fails on known advisories at every severity and registry errors. No advisory ignore list or registry-error bypass is configured. The Actions run logs record findings and status.

Locally, use `pnpm install --frozen-lockfile` then `pnpm security:audit`. Capture `pnpm audit --json` for a machine-readable incident record. A clean registry audit means no known reported advisories in the resolved dependency tree at that time; it does not establish exploitability, detect application bugs, or certify container/base-OS security.

## Remediation process

The existing Dependabot configuration opens weekly npm and GitHub Actions update PRs. Backend maintenance owns server dependencies, frontend maintenance owns UI/build dependencies, and DevOps maintenance owns workflow/tooling dependencies. Assign a named maintainer on each advisory or PR; the role names here are routing guidance, not evidence that a person has accepted an incident.

1. Record GHSA, package, resolved version, dependency path, severity, affected environments, and source link. Assess production exposure separately from build/test exposure.
2. Triage critical findings within one business day, high within two, and lower severities within five. These are maintenance targets; record actual response times.
3. Try compatible lockfile updates: `pnpm audit --fix=update`. Review every changed package and lockfile integrity value. If an upstream range excludes its patched minor version, use a narrowly scoped override with the GHSA reason documented.
4. Run `pnpm install --frozen-lockfile`, `pnpm security:audit`, and `pnpm validate`. Require passing quality and dependency-security workflows on the proposed commit. Avoid automated merge of native-addon or major-version changes.
5. Record the remediation commit, verification runs, deploy version and follow-up. Revert a broken rollout through a reviewed corrective PR; do not silently restore a vulnerable lockfile or suppress advisories to make CI green.

If no fix is available, document containment, exposure, a named owner and a review deadline in a security incident; leave the security gate failing until the approved mitigation/removal is implemented. Report sensitive exploit details through the repository's security-report process instead of a public issue.

## 4 October 2026 remediation

The initial production dependency audit reported nine advisories (five high, four moderate). The full-tree fix command addressed 27 advisory findings across production and development dependencies. One high advisory remained in `concurrently > shell-quote`: GHSA-395f-4hp3-45gv. A conditional override resolves affected `shell-quote` versions to the patched >=1.9.0 <2.0.0 range (currently resolved to 1.12.0); upstream `concurrently` still constrains the affected minor. Remove this override after the upstream range accepts a safe version, then re-audit.

Sources: [pnpm audit documentation](https://pnpm.io/cli/audit) and [shell-quote advisory](https://github.com/advisories/GHSA-395f-4hp3-45gv). These sources describe the update mechanism and patched range; the registry results and repository tests provide the project-specific evidence.

Verification on the remediation tree: frozen-lockfile install, `pnpm security:audit` (no known vulnerabilities), `pnpm validate` (154 frontend tests, 227 backend tests, 106 AI evaluations and production build), and parsing both existing dev commands with the patched shell-quote passed. GitHub dependency-security also passed after workspace manifests were included with their corresponding lockfile updates.

## October 2026 follow-up remediation

The later local audit of commit `7de92fa41f58963563c3622d96245a5c115d5d82` failed with two advisories:

| Advisory                                                                                                    | Locked package        | Patched resolution | Exposure path                           |
| ----------------------------------------------------------------------------------------------------------- | --------------------- | ------------------ | --------------------------------------- |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), critical IP spoofing              | `proxy-addr@2.0.7`    | `2.0.8`            | Express runtime/proxy client addressing |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), high event-loop denial of service | `source-map-js@1.2.1` | `1.2.2`            | Frontend build/test dependency paths    |

Conditional transitive overrides in `pnpm-workspace.yaml` and the regenerated lockfile apply patched versions to all consumers. Existing integrity verification, the all-dependency audit and its `low` failure threshold are retained. Review upstream dependency ranges before removing the overrides, then rerun the audit. These findings reproduce the dependency gate failure on the inspected tree; detailed logs of historical GitHub runs require authenticated access, so their advisory contents must not be invented from the local result.
