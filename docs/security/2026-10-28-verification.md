# Dependency remediation and local verification — 28 October 2026

## Evidence and limits

The supplied PR #236 screenshot shows failed dependency-security and container-security
checks, with successful quality and source-security checks. The actual GitHub job logs were
not available to this environment; the exact cause of that historical container job remains
unverified. This report distinguishes local reproduction from remote workflow results.

The original lockfile reproduced a failing `pnpm security:audit`: 13 findings (4 high,
8 moderate, 1 low). A subsequent registry audit identified an additional `qs` advisory.
Compatible patched releases were installed and the lockfile regenerated with pnpm.
No workflow was disabled, no threshold lowered, and no finding suppressed.

| Dependency                  | Patched floor | Current locked version |
| --------------------------- | ------------- | ---------------------- |
| Vite                        | 7.3.7         | 7.3.7                  |
| @vitest/mocker (via Vitest) | 4.1.12        | 4.1.12                 |
| Zod                         | 4.6.6         | 4.6.7                  |
| body-parser                 | 2.4.0         | 2.4.0                  |
| undici                      | 8.12.2        | 8.12.3                 |
| ip-address                  | 10.7.4        | 10.7.5                 |
| qs                          | 6.16.1        | 6.16.1                 |

`scripts/security/dependency-baseline.test.mjs` records the advisory IDs, checks affected and
patched fixtures, and verifies every locked consumer of these dependencies. This protects
against reintroducing known versions; it does not replace registry audits or exploit testing.
Application authentication, tenant guards, storage checks, existing regression tests and
security workflow enforcement remain in place.

## Final local results

| Check                                    | Result                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`         | Passed, using the existing store directory                                                                            |
| `pnpm security:audit`                    | Passed: `No known vulnerabilities found`                                                                              |
| `pnpm security:test`                     | Passed: 14 tests                                                                                                      |
| `pnpm validate`                          | Passed: lint, formatting, type checks, 171 frontend tests, 263 backend tests, 106 AI evaluations and production build |
| Production container build               | Passed with fresh base images                                                                                         |
| Runtime smoke test                       | Passed: non-root, mounted `/data`, `/api/ready`, `/login`, new artwork HTTP response                                  |
| Trivy 0.75.0 and existing container gate | Passed threshold: 0 high/critical; 23 medium and 8 low, all without a published fix in this scan                      |

The scanned image ID is
`sha256:7d1e34bbb1ec9d808a9c762e66c5a4f4fde287ed60d1f143233df1b24266f28b`.
The production Dockerfile was left unchanged. A local-only copy mounted the managed
environment's proxy CA at dependency-install steps with TLS verification enabled. The CA
was not copied into runtime layers. Trivy scanned both OS and application packages; the
existing `check-container.mjs` enforced the unchanged high/critical threshold. Remaining
medium/low findings are not waived: rerun the scan as upstream patches become available.

The Vite build still reports an approximately 531 kB minified shared JavaScript chunk.
This is a performance follow-up, not a passing security result or a build failure.

## Failures encountered and corrected

- A dependency-install attempt used a different pnpm store and failed with
  `ERR_PNPM_UNEXPECTED_STORE`. Reusing `/tmp/restrova-pnpm/store` resolved it.
- Initial container dependency fetching failed with `EAI_AGAIN registry.npmjs.org`.
  The local build was configured to use the environment's existing proxy and CA.
- The default Trivy database mirror returned `Get "https://mirror.gcr.io/v2/": Forbidden`.
  The scan then succeeded with the official, permitted `ghcr.io/aquasecurity/trivy-db:2`
  repository. The repository workflow configuration was not changed.
- Validation failed at `[vite:prepare-out-dir] ENOSPC: no space left on device, mkdir
'/workspace/restrova-platform/03-frontend/web/dist/fonts'`; Docker also failed with
  `ResourceExhausted: ... no space left on device`. Unused local Docker build cache was
  cleared and temporary scanner data moved to `/tmp`. The full validation and build were
  rerun successfully.
- The local generated WebP initially had mode `0600`. The non-root image served `/login`
  but the image request returned HTTP 500; a direct read confirmed `EACCES`. The public
  asset was normalized to `0644`, the image rebuilt, and the same HTTP check passed.

Logs and the full Trivy JSON remain in `/workspace/restrova-review/` in the execution
workspace. They are not an assertion that GitHub checks or a hosted deployment passed.

## Operator follow-up

Inspect the new GitHub Actions run before merging or releasing. Obtain the failed historical
container job log if its exact cause still needs attribution. No production secrets or
Render settings were changed. Render deployment, persistent storage, backup credentials,
scheduling and restore verification still require the existing operational runbook and
operator checks. The free visual preview is a static design gallery and does not launch the
full application or implement Market/Discover.
