# Team workspace

This folder separates the project by team responsibility without moving the production source folders.

The running application still uses:

- `server/` for backend code
- `web/` for frontend code
- `data/`, `.tmp-knowledge/`, and `server/evals/` for data, AI behavior, and evaluation assets
- root deployment/config files for DevOps and QA

Use these sections as the working map for the team:

| # | Section | Owner role | Main responsibility |
| --- | --- | --- | --- |
| 2 | [`backend/`](backend/README.md) | مطور Backend | APIs, auth, database, restaurant tools, server runtime |
| 3 | [`frontend/`](frontend/README.md) | مطور Frontend | React app, UI, routing, shell, localization, accessibility |
| 4 | [`data-ai/`](data-ai/README.md) | مهندس AI وData | assistant behavior, prompts, tool reasoning, evaluations, knowledge base |
| 5 | [`devops-qa/`](devops-qa/README.md) | مهندس QA وDevOps | deployments, environments, CI checks, release validation, production safety |

For a complete ownership map, see [`../docs/team-ownership.md`](../docs/team-ownership.md).
