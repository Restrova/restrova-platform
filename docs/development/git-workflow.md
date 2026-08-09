# Restrova Git Workflow

`main` is the protected production branch. Developers must not push directly to `main`.

## Branch naming

- `feature/<short-description>`
- `fix/<short-description>`
- `refactor/<short-description>`
- `docs/<short-description>`
- `test/<short-description>`
- `chore/<short-description>`

## Normal flow

1. Create a branch from latest `main`.
2. Commit small, reviewable changes.
3. Push the branch.
4. Open a pull request.
5. Wait for CI.
6. Request review from the relevant Restrova team.
7. Merge only after required checks and approvals pass.

## Conventional commits

Use:

- `feat:` for user-visible features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for internal code movement with no behavior change
- `test:` for tests
- `chore:` for maintenance
- `ci:` for workflow changes

## Required before merge

```bash
pnpm validate
```

For AI behavior changes, also update `04-data-ai/evals/dataset.js` and confirm:

```bash
pnpm --filter server eval
```

For security or tenant-isolation changes, include backend tests proving the expected behavior.
