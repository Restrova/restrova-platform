# 03 — Frontend / مطور Frontend

This section is owned by the frontend developer.

## Main code

- [`web/`](web/) — React + Vite application, routes, design system, application shell, localization, styles, and frontend tests.

## Responsibilities

- User interface and page routes.
- Chat/workspace frontend behavior.
- Arabic RTL, English LTR, and Simplified Chinese LTR localization.
- Accessibility and responsive layout.
- Frontend API integration through shared helpers.

## Run frontend validation

From the repository root:

```bash
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```
