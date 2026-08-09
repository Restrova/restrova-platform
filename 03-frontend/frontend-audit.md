# Frontend Audit

Date: 2026-08-09

## Current strengths

- React + Vite frontend is organized under `03-frontend/web`.
- App shell, routes, navigation, localization foundation, reusable UI primitives, and tests exist.
- React Query is configured through the app provider layer.
- Auth boundary protects private routes.
- RTL/LTR direction support exists through locale context.
- Frontend tests cover shell, auth boundary, navigation, locale, restaurant context, formatters, and UI primitives.

## Gaps before production customers

| Priority | Area                           | Finding                                                                                                  | Recommendation                                                   |
| -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| P1       | Session security               | JWT is stored client-side; logout depends on client cleanup.                                             | Pair backend session revocation with safer token transport.      |
| P1       | Authorization-aware navigation | Viewer/manager restrictions need full route-by-route coverage as new pages replace the legacy workspace. | Add role-based route tests for every new page.                   |
| P1       | Branch context                 | Selected branch state exists, but backend API calls do not yet consistently send selected branchId.      | Make branchId part of every branch-scoped query key and request. |
| P2       | Legacy workspace               | Core workspace remains in a large legacy component.                                                      | Extract feature modules incrementally.                           |
| P2       | Empty/loading/error states     | Foundation exists, but product pages need consistent loading/empty/error UI as they are built.           | Use shared UI states and test them.                              |
| P2       | Accessibility                  | Basic tests exist; full keyboard/focus/a11y review is still required.                                    | Add axe-style checks or manual QA checklist.                     |
| P2       | Localization                   | Some older Arabic/Chinese strings need UTF-8 cleanup.                                                    | Normalize source files and add text rendering snapshots.         |

## Required frontend validation

```bash
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```
