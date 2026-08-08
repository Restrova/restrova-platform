# Team ownership map

This document organizes the repository by team responsibility. The main source folders are now physically grouped by role, while a few root-level files remain at the root because package managers and deployment services expect them there.

## Role sections

| Team role | Arabic label | Primary folders | Scope |
| --- | --- | --- | --- |
| Backend developer | مطور Backend | `02-backend/server/` | APIs, auth, database, tools, secure server runtime |
| Frontend developer | مطور Frontend | `03-frontend/web/` | React UI, routes, shell, localization, accessibility |
| Data/AI engineer | مهندس AI وData | `04-data-ai/evals/`, `02-backend/server/src/ai.js`, `02-backend/server/src/tools.js` | Assistant behavior, restaurant reasoning, evals, knowledge retrieval |
| DevOps/QA engineer | مهندس QA وDevOps | `05-devops-qa/`, root package/workspace/deployment files | Deployment, environment safety, validation, release quality |

## Repository map

```text
AI-restaurant-manager/
├── 02-backend/             # Backend developer
│   └── server/
│   ├── src/                 # API, auth, database, AI/tools integration
│   └── test/                # Backend tests
├── 03-frontend/            # Frontend developer
│   └── web/
│   └── src/                 # React app, routes, components, contexts, styles, tests
├── 04-data-ai/             # Data/AI engineer
│   └── evals/               # Evaluation dataset and runner
├── 05-devops-qa/           # DevOps/QA engineer
│   ├── Dockerfile
│   ├── docs/
│   └── github-templates/
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

Fill real GitHub usernames in `05-devops-qa/github-templates/CODEOWNERS.example`, then copy it to `.github/CODEOWNERS` when the team is ready for enforced reviews.
