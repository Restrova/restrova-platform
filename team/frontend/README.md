# Frontend section — مطور Frontend

Frontend owners work mainly in:

- [`../../web`](../../web)
- [`../../web/src/app`](../../web/src/app)
- [`../../web/src/components`](../../web/src/components)
- [`../../web/src/contexts`](../../web/src/contexts)
- [`../../web/src/hooks`](../../web/src/hooks)
- [`../../web/src/pages`](../../web/src/pages)
- [`../../web/src/styles`](../../web/src/styles)
- [`../../web/src/tests`](../../web/src/tests)

## Responsibilities

- React routes and protected application shell.
- Chat/workspace UI and future dashboard pages.
- Design system, reusable UI components, and CSS tokens.
- Arabic, English, and Simplified Chinese localization.
- RTL/LTR behavior.
- Accessibility and responsive behavior.
- Client-side API integration through shared helpers.

## Must protect

- Do not place secrets in frontend code, `VITE_*` variables, screenshots, or logs.
- Do not duplicate authentication state outside the approved auth provider/helpers.
- Do not invent frontend-only business numbers.
- Keep `/app/workspace` working until the legacy workspace is fully replaced.

## Validation before handoff

```bash
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```
