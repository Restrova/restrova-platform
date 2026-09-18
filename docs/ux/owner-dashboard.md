# Owner dashboard UX

## Routes and data

The default landing page is `/app/dashboard` (executive home). It reuses the authorized daily executive report: yesterday's local calendar day, recorded status, changes, evidence-backed explanations and prioritized next actions. No unrecorded causal explanation is invented. The displayed date and import revision identify the snapshot; refresh requests a new one. Organization-wide financial analysis remains available at `/app/profit` for owners.

`/app/today` uses the financial dashboard with `throughNow=true`. This option requires `period=today`. The server resolves the current organization timezone, ends the current interval at its anchor (server now unless supplied for reproducible API analysis), and ends the comparison at the corresponding local clock time. Midnight, previous-day, same-weekday and year comparisons retain the existing inclusive range conventions. DST gaps/overlaps use the existing local-time resolver and are clamped inside the comparison day; these are local-clock comparisons, not equal elapsed durations. The visible cutoff and timezone make the comparison explicit. Foreground polling runs every 60 seconds; it reads confirmed imports and ledger records, not a live POS feed.

The profit view includes a revenue/discount/refund/eight-cost waterfall, running balances, a loss-capable scale and an accessible table. Incomplete inputs do not produce a reported profit, margin, ranking or connected profit trend line. Cost completeness is still ledger-category coverage for the selected scope; it is not proof that all business transactions were supplied. Profit excludes tax, interest and depreciation. Period comparisons remain available through the existing controls.

Authorized branch names in profit rankings and branch scorecards select the shared branch context and switch the existing view to branch scope without losing the period. Rows from other restaurants in an organization report remain readable but are not selectable through a restaurant's branch picker. Menu analysis links to the shared recommendations workflow; its evidence drawer resets on restaurant, branch or account changes. Arabic and Chinese menu classifications have human-readable labels.

Alert ordering defaults to severity (CRITICAL, WARNING, INFO), then newest id within a severity. `GET /alerts?order=priority` applies ordering before the limit and uses a scope-checked id cursor to recover the severity key. The existing recent ordering remains available. A concurrent severity change can move an incident between pages; refresh restarts pagination. A foreign cursor returns no rows and exposes no incident metadata.

Copilot keeps private conversations and immutable source evidence. Date fields now require a complete chronological pair; invalid dates disable report refresh and submission. Mixed-script questions use automatic text direction and sending progress is announced to assistive technology. Related-analysis links open the current analysis view; the answer's expanded evidence is the authoritative historical snapshot, not that page's current filters.

## Import and permission boundaries

Every query includes user/organization and relevant restaurant/branch identity. Existing ImportDataBridge invalidates active queries after confirmed imports, including named-source imports. These views do not create a separate datastore or bypass server authorization. Branch managers cannot widen scope, viewers retain read-only access, and owners alone can request organization reports. No schema migration, secret, external connection or paid Render setting is needed.

## Validation and remaining review

Automated coverage exercises the three locales, scoped queries, missing data, failures, date validation, financial reconciliation, branch drilldown, same-clock cutoffs including DST, tenant denial and priority pagination. Existing import-refresh, menu, alert, conversation and permissions suites remain part of `pnpm validate`. Financial UI code is lazy-loaded to keep the initial bundle below Vite's default size advisory.

Responsive changes use logical CSS properties, wrapping mixed-script text, focusable table scroll regions, 44px action targets, one-column phone layouts and a mobile navigation containing Home, Today, Alerts and Copilot.

Browser visual QA could not be completed in this environment: the cloud browser cannot access the local preview and its URL security policy rejects self-contained data URLs. No network-policy workaround was used. Phone/tablet, full RTL and Chinese visual sign-off (#96–#98) remain open; the code improvements and locale tests are delivered, but do not substitute for an authenticated viewport review of all owner surfaces. The remaining review should cover 360px, 768px and desktop widths, keyboard navigation, long imported names, tables, dialogs and evidence in Arabic, Chinese and English.

#89–#95 cover the functional owner views delivered here. The live provider dependencies #83–#88 are still open; the executive UI consumes confirmed records and explicitly states that external POS connections are not live.
