# Team ownership map

This document organizes the repository by team responsibility. It is intentionally non-breaking: source folders remain where the app, tests, Dockerfile, Railway, Render, and package scripts already expect them.

## Role sections

| Team role | Arabic label | Primary folders | Scope |
| --- | --- | --- | --- |
| Backend developer | مطور Backend | `server/` | APIs, auth, database, tools, secure server runtime |
| Frontend developer | مطور Frontend | `web/` | React UI, routes, shell, localization, accessibility |
| Data/AI engineer | مهندس AI وData | `server/src/ai.js`, `server/src/tools.js`, `server/evals/`, `data/`, `.tmp-knowledge/` | Assistant behavior, restaurant reasoning, evals, knowledge retrieval |
| DevOps/QA engineer | مهندس QA وDevOps | `Dockerfile`, `railway.json`, `render.yaml`, root package/workspace files, tests, docs | Deployment, environment safety, validation, release quality |

## Repository map

```text
AI-restaurant-manager/
├── server/                 # Backend developer
│   ├── src/                 # API, auth, database, AI/tools integration
│   ├── evals/               # Data/AI evaluation dataset and runner
│   └── test/                # Backend tests
├── web/                    # Frontend developer
│   └── src/                 # React app, routes, components, contexts, styles, tests
├── data/                   # Data/AI engineer
├── docs/                   # Shared planning, architecture, QA notes
├── team/                   # Team responsibility guides
├── Dockerfile              # DevOps/QA
├── railway.json            # DevOps/QA
├── render.yaml             # DevOps/QA
├── package.json            # Shared scripts/workspace commands
└── pnpm-workspace.yaml      # Workspace package map
```

## Working rules

1. Backend changes should include backend tests or a clear reason tests were not needed.
2. Frontend changes should keep Arabic RTL, English LTR, and Simplified Chinese LTR behavior intact.
3. Data/AI changes should update evals when assistant behavior changes.
4. DevOps/QA changes should document required environment variables and deployment verification.
5. No role should commit secrets, private restaurant data, or copyrighted book content.

## Handoff checklist

Before handing work to another teammate, include:

- Files changed.
- Reason for the change.
- Commands run.
- Known limitations.
- Screenshots or logs when UI/deployment behavior changed.

## Suggested GitHub ownership template

Fill real GitHub usernames in `.github/CODEOWNERS.example`, then copy it to `.github/CODEOWNERS` when the team is ready for enforced reviews.
