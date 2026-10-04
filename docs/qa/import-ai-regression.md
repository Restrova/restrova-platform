# Import and AI regression gate — #152 / #153

## Scope and reproduction

Run `pnpm validate` from the repository root. Backend coverage runs through `pnpm --filter server test:unit`; CI invokes the same suite. `scripts/run-unit-tests.js` supplies a temporary SQLite database when DATABASE_PATH is absent. Never point these tests at production: they register synthetic accounts and insert fixtures. All HTTP requests target a locally started app; no paid storage or external AI provider is required.

New files: `test/importRegression.test.js`, `test/aiSafetyRegression.test.js` and `test-support/importRegressionFixtures.js` under `02-backend/server`. Ten top-level tests cover the matrix below. The Excel fixture is a standards-based XLSX package with inline UTF-8 strings, workbook relationships and ZIP CRCs, generated without another dependency. CSV includes a BOM, CRLF, quoted commas and embedded quotation marks.

| Template | CSV                                          | XLSX           | Confirmed facts                                                   |
| -------- | -------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| Branches | automatic detection → preview → confirmation | same lifecycle | Arabic/Chinese name, city, overnight hours                        |
| Menu     | automatic detection → preview → confirmation | same lifecycle | exact name and item identity; 100.05 selling price                |
| Costs    | automatic detection → preview → confirmation | same lifecycle | 12.35 direct food, 1.15 packaging, branch and effective date      |
| Sales    | automatic detection → preview → confirmation | same lifecycle | two lines, one distinct order; exact discounts/refunds/commission |

Every template preview preserves complete operational table snapshots and data revision. Foreign-tenant confirmation returns 404. A successful confirmation imports exactly the accepted rows and increments the revision once; repeating that confirmation returns 409 without changes. Re-uploading the same sales rows yields two duplicates, zero newly imported rows and unchanged financial data. The template inventory assertion fails if a new active template is added without expanding this matrix.

Four additional template-specific tests mix a valid and an invalid row. Missing branch city, negative menu price, negative cost and negative sale each block the whole confirmation, preserve data/revision, and issue no confirmation token. Viewers cannot upload any of the four templates. Existing suites separately cover mapping, cancellation, token expiry, malformed/oversized files, upload rate limits, empty files and aggregate-report analysis.

## Independent golden amounts

Expected values are hand-calculated, not obtained from the financial implementation:

| Recorded fact                            | Minor units (SAR) |
| ---------------------------------------- | ----------------: |
| Gross sales: 100.05 + 101.05             |             20110 |
| Discounts                                |              1005 |
| Refunds                                  |               505 |
| Delivery commission                      |               600 |
| Direct food: 12.35 × 3 units             |              3705 |
| Packaging: 1.15 × 3 units                |               345 |
| Net revenue: gross − discounts − refunds |             18600 |
| Distinct external orders                 |                 1 |

Both CSV and XLSX pipelines reconcile these imported ledger facts. The AI and executive report must return net revenue 18600 and one order, for the same pinned completed local date and branch. Net profit remains unavailable because operational categories such as labor/rent are absent; this fixture does not assert that item contribution is full restaurant profit. Existing `financialAccuracyGolden` datasets and Task 3 financial suites cover signed facts, supported currencies, boundaries, rounding, missing categories and multi-branch reconciliation.

## AI safety evidence

The new safety suite uses confirmed imports through the real HTTP API. Arabic, English and Chinese requests must produce matching revenue, pinned date, SAR currency, revision and restaurant/branch scope. Every non-null numeric claim refers to an existing source ID, and persisted evidence has a stable SHA-256 digest accessible only within the authorized conversation.

- Arabic/English/Chinese mutation, prompt-injection and secret-disclosure requests produce a refusal with no tool, claim or source. Full-width English deletion text is normalized and refused. Operational table snapshots stay unchanged.
- An imported item name containing malicious instructions and fabricated profit remains stored text. Legitimate revenue/menu/profit questions still use the read-only engine allowlist, preserve computed amounts and withhold unsupported profit. The test permits displaying a name as source data; it does not treat displaying that text as executing it.
- Other tenants and non-creator viewers cannot read a saved thread or evidence. Foreign branches cannot be queried. Branch managers cannot widen to restaurant scope or another branch. Reassignment removes old-branch access on both history and request replay despite the previously issued token.

This validates the built-in evidence engines, not arbitrary future model behavior. Any newly enabled provider must pass its own grounding/tool-boundary tests. Browser/mobile visual RTL testing and full restaurant journey coverage remain separate #154–#158 tasks; UTF-8 data tests are not visual QA.

## Findings and operating boundaries

QA owner: backend/QA maintainers. During authoring, assertions initially treated the structured `dataRevision` as a number and omitted the period's comparison metadata. They were corrected to verify revision/restaurant identity and the exact previous local-day UTC boundaries. These were test expectation errors, not product failures. No new application defect or authentication change was required. CI failures block merge, and newly discovered template/permission/financial failures block release until verified fixes exist.

Use the existing operations incident-response and rollback runbooks for deployment failures. Backup tooling and controlled restore tests are documented in `docs/operations/database-backup-restore.md`. Production persistent storage, scheduled off-service backups and recovery timing are deferred (#106/#126/#140/#141/#168) and are not completed by this QA gate. No production data, secrets, account suspension, paid resource or provider integration was changed by these tests.
