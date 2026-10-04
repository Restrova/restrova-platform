# Dependency security maintenance

Related: #129; dependency scanning contributes to #128. Code and container scanning remain separate outstanding work for #128.

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

The initial production dependency audit reported nine advisories (five high, four moderate). The full-tree fix command addressed 27 advisory findings across production and development dependencies. One high advisory remained in `concurrently > shell-quote`: GHSA-395f-4hp3-45gv. A conditional override resolves affected `shell-quote` versions to the patched 1.9.x range; upstream `concurrently` still constrains the affected minor. Remove this override after the upstream range accepts a safe version, then re-audit.

Sources: [pnpm audit documentation](https://pnpm.io/cli/audit) and [shell-quote advisory](https://github.com/advisories/GHSA-395f-4hp3-45gv). These sources describe the update mechanism and patched range; the registry results and repository tests provide the project-specific evidence.
