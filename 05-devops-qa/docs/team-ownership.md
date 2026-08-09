# Restrova team ownership map

This document organizes the repository by team responsibility. Root-level package and deployment files remain at the root because package managers and hosting services expect them there.

## Role sections

| Team                    | Arabic label     | Primary folders                                                                      | Scope                                                                |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Restrova Backend Team   | مطور Backend     | `02-backend/server/`                                                                 | APIs, auth, database, tools, secure server runtime                   |
| Restrova Frontend Team  | مطور Frontend    | `03-frontend/web/`                                                                   | React UI, routes, shell, localization, accessibility                 |
| Restrova AI/Data Team   | مهندس AI وData   | `04-data-ai/evals/`, `02-backend/server/src/ai.js`, `02-backend/server/src/tools.js` | Assistant behavior, restaurant reasoning, evals, knowledge retrieval |
| Restrova DevOps/QA Team | مهندس QA وDevOps | `05-devops-qa/`, `.github/`, root package/workspace/deployment files                 | Deployment, environment safety, validation, release quality          |

## Repository map

```text
restrova-platform/
├── 02-backend/             # Backend Team
│   └── server/
│       ├── src/             # API, auth, database, AI/tools integration
│       ├── test/            # Backend tests
│       └── db/              # Migration-ready database structure
├── 03-frontend/            # Frontend Team
│   └── web/
│       └── src/             # React app, routes, components, contexts, styles, tests
├── 04-data-ai/             # AI/Data Team
│   └── evals/               # Evaluation dataset and runner
├── 05-devops-qa/           # DevOps/QA Team
│   ├── Dockerfile
│   └── docs/
├── .github/                # DevOps/QA Team
├── docs/                   # Shared architecture/development/operations/security docs
├── railway.json            # DevOps/QA
├── render.yaml             # DevOps/QA
├── package.json            # Shared scripts/workspace commands
└── pnpm-workspace.yaml      # Workspace package map
```

## Working rules

1. Backend changes should include backend tests or a clear reason tests were not needed.
2. Frontend changes should preserve Arabic RTL, English LTR, and Simplified Chinese LTR behavior.
3. AI/Data changes should update evals when assistant behavior changes.
4. DevOps/QA changes should document required environment variables and deployment verification.
5. No team should commit secrets, private restaurant data, local database files, or copyrighted book content.

## Restrova GitHub organization teams

The committed `.github/CODEOWNERS` expects these teams:

- `@Restrova/backend`
- `@Restrova/frontend`
- `@Restrova/ai-data`
- `@Restrova/devops-qa`

Create those teams in the Restrova GitHub organization and give them repository access before enabling required CODEOWNERS reviews.
