# Evidence copilot and daily reports

The `/app/assistant` and `/app/reports` routes use the confirmed import store and existing financial, branch, menu, alert, forecast and recommendation services. The workspace links to both. No external model, API key or new infrastructure is required.

## Delivered issues

| Issue | Behavior                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| #68   | Permission-filtered restaurant knowledge context and six available analysis engines.                             |
| #69   | Natural-language revenue/profit changes, yesterday and last seven completed local days.                          |
| #70   | Branch losses, food-cost movements and pricing candidates with evidence.                                         |
| #71   | Server-side read-only tool allowlist; client text cannot supply SQL or tool scopes.                              |
| #72   | Claim source IDs, immutable source snapshots, formula versions and SHA-256 digests.                              |
| #73   | Current tenant/restaurant/branch authorization, mutation refusal and unavailable values for incomplete evidence. |
| #74   | Private persisted conversations, follow-up intent/period, optimistic versions and idempotent request keys.       |
| #75   | Saudi Arabic, English and Chinese questions and explanations.                                                    |
| #76   | Yesterday's revenue, operating profit, margin, orders, AOV, item rankings, branch ranking and alerts.            |
| #77   | Evidence-linked executive explanation reconciling revenue and total-cost changes with operating-profit change.   |

## Data and calculation contract

The report defaults to yesterday in the restaurant timezone. Explicit `fromDate`/`toDate` select 1–31 completed local dates; comparison is the preceding equal-length period. “This week” currently means the last seven completed local days, with exact dates always displayed. Other arbitrary date phrases require the date controls. Forecast questions use the current forecast engine's upcoming seven days and show those dates separately.

All monetary calculations use integer minor units, safe BigInt sums and the existing engines. Currency formatting respects currency decimal digits. Profit is operating profit, excluding tax, interest and depreciation. Every ledger cost category must be explicitly present before reporting profit or margin. Revenue uses a complete sales/discount/refund ledger when available, otherwise recorded sales lines. Orders deduplicate branch plus external order ID. AOV is withheld if ledger revenue disagrees with sales-line revenue. Missing records do not establish zero trading; comparisons describe recorded evidence, not a certification that an import covers every trading day.

Best branch means best among branches with complete cost evidence; excluded counts are visible. Worst item means lowest contribution among recorded items and is withheld if item costs or the bounded menu listing are incomplete. Missing alert evidence is not interpreted as healthy performance. Recommendations and forecasts retain the source engines' evidence and uncertainty; no financial improvement is promised. The executive summary explains an accounting reconciliation and never attributes changes to waste or demand without additional evidence.

## API and access

- `GET /api/copilot/context`: authorized context and available tools.
- `POST /api/copilot/ask`: message, language, scope, optional branch/date controls, UUID requestKey, optional threadId and expected version.
- `GET /api/copilot/threads`: latest 50 conversations owned by the current user.
- `GET /api/copilot/threads/:id`: up to 100 turns; source metadata is included and full source data is fetched on demand.
- `GET /api/copilot/threads/:id/turns/:turnId/evidence/:sourceId`: immutable saved evidence, reauthorized against current permissions.
- `GET /api/reports/daily`: live report using the same scope/date/language fields.

All responses are no-store. Organizations, restaurants, creator and current branch role are checked before reads; viewers can analyze their authorized data and save their own conversations. Saved conversation access can be revoked by role changes. No copilot tool mutates business records. Input intent routing is deterministic and bounded, not a general-purpose LLM; unsupported questions ask for clarification. Stored item names are treated as text, never instructions. React escapes source text.

Migration `0010_copilot_evidence.sql` adds private threads and source-bearing turns. It is additive and runs through the existing migration runner on deployment. Request retries are deduplicated per creator/restaurant, including a lost first response; a reused key with different content is rejected. Version conflicts return 409. Conversations are limited to 100 turns, answers to 2 MB, transaction reads to 50,000 lines, menu results to 500 items and cross-branch recommendations to 20 branches. Narrow the scope or start a new conversation when a limit is reached.

Confirmed imports invalidate live report/query caches and increment the import revision. Historical answers stay immutable and show staleness when that revision changes; follow-ups recalculate from fresh records. The import revision is not a universal change counter for manual ledger edits. Source digests and saved timestamps support audit, while existing request logs record endpoint failures without adding question/source contents to logs.

## Verification

Backend tests cover actual CSV preview/confirmation, source lineage and refresh, all six tool routes, monetary reconciliation, missing evidence, duplicate order lines, three languages, replay/conflict behavior, private evidence and current role revocation. UI tests cover report languages/RTL, source loading, executive explanation, conversation submission/reload, scope reset, manager restrictions, import refresh and recoverable errors. Existing full-project validation and CI remain required before merge.
