# Release Process

Restrova uses semantic versioning:

- `MAJOR`: breaking API/database behavior
- `MINOR`: backward-compatible features
- `PATCH`: fixes and safe operational improvements

## Environments

- Development: local developer machine
- Test: CI validation
- Staging: production-like deployment with non-customer data
- Production: customer-facing deployment

## Release checklist

1. Merge through pull request only.
2. Confirm CI passed.
3. Confirm `pnpm validate` passed locally or in CI.
4. Review environment variable changes.
5. Review database migration notes.
6. Review AI/eval changes.
7. Tag release when production deployment is verified.

Do not deploy from pull requests.
