# Backend section — مطور Backend

Backend owners work mainly in:

- [`../../server`](../../server)
- [`../../server/src`](../../server/src)
- [`../../server/tests`](../../server/tests)
- [`../../server/package.json`](../../server/package.json)

## Responsibilities

- Express API routes.
- Authentication, sessions, JWT handling, and role authorization.
- SQLite/PostgreSQL persistence decisions.
- Restaurant-scoped data isolation.
- Orders, refunds, inventory, menu items, staff shifts, reports, and tool APIs.
- Secure backend-only OpenAI integration wiring when enabled.
- API error handling and safe logging.

## Must protect

- Never expose API keys or JWT secrets to frontend code.
- Never trust `restaurant_id`, `branch_id`, or role values from the client without checking the authenticated session.
- Keep branch and organization isolation enforced server-side.
- Avoid silently falling back to demo data in production failures.

## Validation before handoff

```bash
npm run test -w server
npm run eval -w server
```
