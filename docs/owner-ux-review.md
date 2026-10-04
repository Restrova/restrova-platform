# Owner interface review — 4 October 2026

Related issues: #96 (mobile), #97 (Arabic RTL), #98 (Chinese localization).

## Findings and fixes

| Finding                                                          | Severity | Fix                                                                                        | Regression evidence                                    |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Tablet bottom navigation used five columns for four destinations | Medium   | Four equal columns at every mobile breakpoint                                              | CSS review; existing four-destination shell regression |
| Drawer focus reset on language changes                           | Medium   | Stable close callback preserves the focus trap lifecycle                                   | Language-switch focus regression                       |
| Background remained interactive behind the mobile dialog         | Medium   | Inert background with previous values restored on cleanup                                  | Shell inert and focus-restoration regressions          |
| Desktop resize could retain a hidden drawer and scroll lock      | Medium   | Close drawer at desktop media-query transition                                             | Resize cleanup regression                              |
| Arabic forward arrows pointed right                              | Low      | Mirror only decorative directional arrows                                                  | Direction-scoped CSS review                            |
| Settings tabs lacked keyboard navigation                         | Medium   | Roving tab focus, direction-aware arrows, Home/End                                         | Tests in Arabic, English and Chinese                   |
| Data timestamps were raw ISO strings                             | Low      | Locale-aware formatting in the restaurant timezone                                         | Three-locale timezone regression                       |
| Account role exposed English internal codes                      | Low      | Localized role labels; isolate email direction                                             | Three-locale account regression                        |
| Long amounts and short viewport dialogs could overflow           | Medium   | Wrap narrow KPI/attention cards and dialog buttons; bound dialog height and scroll locally | CSS review; rendered verification outstanding          |

Implementation owner: frontend maintenance. Backend permissions, API queries, imported data and authentication flows are unchanged.

## Completed verification

`pnpm validate` passed: lint, repository formatting, frontend tests (154), backend tests (227), AI evaluations (106), and production build. The repository's typecheck script invokes workspace checks only where configured; it is not a claim of full TypeScript coverage.

Translation parity and nonempty values were checked for the shared dictionary and nine page/legacy copy groups in Arabic and Chinese. This checks completeness, not native-speaker linguistic approval.

## Outstanding verification

A real-browser check was attempted with Playwright at widths 320, 390, 768, 1024 and 1440 in Arabic, English and Chinese. No browser executable is installed in this execution environment; its browser download returned an invalid HTML payload instead of an archive. The rendered matrix did **not** run. Complete that matrix on Home, Data, Settings, login, import, AI and report pages before closing the full-review issues. Include long names/amounts, 200% zoom, narrow landscape, keyboard-only drawer/tabs and safe-area devices. Record actual viewport and browser results; do not infer them from DOM tests.

The three issues remain open until this outstanding review is completed. This batch does not claim overall browser/mobile release certification (#155–#158).
