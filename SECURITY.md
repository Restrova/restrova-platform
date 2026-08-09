# Security policy

## Supported branch

Security fixes are accepted on `main`.

## Reporting a vulnerability

Do not open a public GitHub issue for a real vulnerability or leaked secret.

Send a private report to the repository owner with:

- A short description of the issue.
- Affected file/path or endpoint.
- Steps to reproduce.
- Impact assessment.
- Any safe proof of concept.

## Secret handling

Never commit or paste:

- `OPENAI_API_KEY`
- JWT secrets
- database files
- production `.env` files
- private restaurant exports
- copyrighted book text imported for a customer

If a secret is exposed, rotate it immediately and document the rotation in the relevant operations log.

## Production security baseline

Before real customer data is used, the deployment must have:

- Durable database storage and backups.
- Strong `JWT_SECRET`.
- HTTPS-only public access.
- Backend-only AI provider keys.
- Restricted production environment variable access.
- A tested restore process.
