# Owner interface review — 4 October 2026

Related issues: #96 (mobile), #97 (Arabic RTL), #98 (Chinese localization).

## Findings and fixes

| Finding                                                          | Severity | Fix                                                                                  | Regression evidence                                    |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Tablet bottom navigation used five columns for four destinations | Medium   | Four equal columns at every mobile breakpoint                                        | CSS review; existing four-destination shell regression |
| Drawer focus reset on language changes                           | Medium   | Stable close callback preserves the focus trap lifecycle                             | Language-switch focus regression                       |
| Background remained interactive behind the mobile dialog         | Medium   | Inert background with previous values restored on cleanup                            | Shell inert and focus-restoration regressions          |
| Desktop resize could retain a hidden drawer and scroll lock      | Medium   | Close drawer at desktop media-query transition                                       | Resize cleanup regression                              |
| Arabic forward arrows pointed right                              | Low      | Mirror only decorative directional arrows                                            | Direction-scoped CSS review                            |
| Settings tabs lacked keyboard navigation                         | Medium   | Roving tab focus, direction-aware arrows, Home/End                                   | Tests in Arabic, English and Chinese                   |
| Data timestamps were raw ISO strings                             | Low      | Locale-aware formatting in the restaurant timezone                                   | Three-locale timezone regression                       |
| Account role exposed English internal codes                      | Low      | Localized role labels; isolate email direction                                       | Three-locale account regression                        |
| Long amounts and short viewport dialogs could overflow           | Medium   | Size KPI values to cards, wrap attention/dialog controls, and scroll bounded dialogs | Real-browser width/value checks and screenshot review  |

Implementation owner: frontend maintenance. Backend permissions, API queries, imported data and authentication flows are unchanged.

## Completed verification

`pnpm validate` passed: lint, repository formatting, frontend tests (156), backend tests (227), AI evaluations (106), and production build. The repository's typecheck script invokes workspace checks only where configured; it is not a claim of full TypeScript coverage.

Translation parity and nonempty values were checked for the shared dictionary and nine page/legacy copy groups in Arabic and Chinese. This checks completeness, not native-speaker linguistic approval.

## Real-browser review

[GitHub run 37210460426](https://github.com/Restrova/restrova-platform/actions/runs/37210460426) passed on code commit `bafc0b4fb83f45440f532d0a30312a351bbcbe47`: 84 checks passed, six desktop-only drawer cases were intentionally skipped. All quality and security workflows passed on that commit. The runner successfully installed browsers; the earlier local download problem was bypassed through the GitHub runner.

| Engine                                        | Locales                             | Viewports                        | Checks                                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium                                      | Arabic, English, Simplified Chinese | 320, 390, 768, 1024, 1440 CSS px | All 17 owner routes, direction/language, horizontal document/main overflow, keyboard tabs/drawer, login and landscape, large real API-backed amounts, unavailable API and retry |
| WebKit with touch and mobile viewport enabled | Same three locales                  | 390 × 844 CSS px                 | Same owner route and interaction checks                                                                                                                                         |

The fixture creates isolated restaurants through the real registration API and uses a temporary database. Large values are written through the real daily-summary API. The failure check substitutes a controlled 503 response and proves retry returns to the populated page. No production data or credentials are used. Fonts cover Arabic and Chinese. `pnpm test:browser` reproduces the matrix after `pnpm exec playwright install --with-deps chromium webkit`.

Additional findings from actual traces/screenshots:

| Finding                                                                             | Severity | Fix                                                                                                                 | Verification                                                                  |
| ----------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Vite development startup crashed on React lazy initialization                       | High     | Import React lazy before route declarations                                                                         | Every owner route renders without page errors                                 |
| Import, branch and team pages nested main landmarks and duplicated the skip-link ID | Medium   | Use sections inside the shell's single main landmark                                                                | Matrix locates one main target and verifies its width                         |
| Sales comparison and Forecasts clipped their grids on narrow screens                | High     | Bound grid tracks and card minimum sizes; stack narrow comparison metrics                                           | All three locales pass main/document width checks                             |
| Large Arabic KPI amounts split decimal digits across lines                          | High     | Size values against their card width, prevent wrapping, and isolate bidi text                                       | Real 9,999,999,999.99 CNY fixture fits without clipping                       |
| Sidebar role and route-state screens exposed English labels                         | Medium   | Shared role translations and localized session/404/permission states                                                | Translation parity, unit checks and locale matrix                             |
| WebKit resize hid the drawer before desktop cleanup completed                       | Medium   | Layout-phase cleanup plus a resize listener; test actual DOM unmount                                                | Touch WebKit returns focus, clears inert and releases scrolling               |
| Import wizard exposed English labels after locale selection                         | Medium   | Translate upload, mapping, validation, confirmation and completion labels, including standard template descriptions | Arabic/Chinese confirmation regressions and real CSV browser flow             |
| Long branch names collapsed into a one-character column on phones                   | High     | Wrap name/code within the available width and move the edit control to a separate row                               | Browser check enforces usable name width across the matrix                    |
| Confirmable CSV previews widened the import page                                    | High     | Bound import page/section grid tracks and keep preview scrolling inside its card                                    | Real CSV confirmation checks main width in all locales and viewports          |
| Narrow operations tables squeezed names/dates into vertical text                    | High     | Readable table and cell minimum widths inside keyboard-focusable, named scroll regions                              | Browser table-width checks and below-viewport screenshots                     |
| Team status badges and Chinese workspace suggestions were unreadable/untranslated   | Medium   | Wrap card-header status into usable rows and translate all Chinese suggestion buttons                               | Badge-height and localized suggestion browser checks                          |
| Settings showed empty currency and timezone despite configured values               | Medium   | Read organization currency/timezone from the actual session API contract                                            | Real registration verifies CNY and Asia/Shanghai in Settings                  |
| Safe-area CSS lacked viewport-fit activation and lateral padding                    | Medium   | Activate viewport-fit and respect top/side/bottom insets                                                            | Configuration/CSS review; hardware inset verification remains a release check |

## Limits and release follow-up

This is owner-interface readiness evidence. It does not certify every branded browser or physical device (#155–#158). The 720 × 450 reflow check represents a narrower CSS viewport; it is not a claim of native browser 200% zoom testing. Positive hardware safe-area insets, native browser zoom, OS assistive technology and native-speaker linguistic approval remain release/pilot checks. Existing automated permission and financial regressions remain part of `pnpm validate`; this browser matrix does not replace those audits.

The workflow retains screenshots, its HTML report and failure traces for 14 days. Preserve required release evidence before artifact expiry. Additional scroll captures cover owner page sections below the first viewport. Screenshot review and final CI evidence are recorded in the associated PR.
