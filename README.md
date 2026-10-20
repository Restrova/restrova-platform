# Restrova Platform — Restaurant Decision AI

Restrova Platform is the AI decision layer for restaurant owners. Ask for a daily summary, find menu profit leaks, and catch inventory risks in seconds. The assistant uses restaurant-scoped tools, never invents business figures, and requires owner approval before operational changes.

## Quick start

```bash
cp .env.example .env
corepack enable
pnpm install
pnpm dev
```

Open the `Local` URL printed by Vite (normally `http://localhost:5173`), choose **Create restaurant**, and create your own owner account, organization, restaurant, and first branch. If that port is busy, Vite selects another local port automatically and the development API accepts it.

The app uses its built-in prefinal restaurant assistant mode by default. It answers supported restaurant operations questions with deterministic business logic, restaurant-scoped tools, and data-readiness checks. No OpenAI API key or external model is required.

Important: the built-in assistant is rules-based. It can analyze connected restaurant data for supported questions, explain missing data, and avoid fake “healthy” conclusions, but it is not an open-ended language model. Imported-data answers use professional Saudi Arabic and deterministic, branch-scoped figures. For optional general conversation, connect your own Ollama model on the backend; no OpenAI account or key is required.

## Architecture

- `02-backend/server/`: Express REST API, JWT authentication, SQLite persistence, built-in assistant logic
- `03-frontend/web/`: React + Vite chat workspace, routes, shell, localization, and UI
- `04-data-ai/evals/`: assistant behavior evaluation dataset and runner
- `05-devops-qa/`: Dockerfile, docs, GitHub templates, and QA/deployment ownership notes
- Tool implementations are pure restaurant-scoped functions in `02-backend/server/src/tools.js`
- Every operational query is constrained by the authenticated organization, restaurant, role, and branch scope.

## Team sections

The repository is physically organized for a multi-person team:

| Section       | Owner role       | Start here                                         |
| ------------- | ---------------- | -------------------------------------------------- |
| Backend       | مطور Backend     | [`02-backend/README.md`](02-backend/README.md)     |
| Frontend      | مطور Frontend    | [`03-frontend/README.md`](03-frontend/README.md)   |
| Data and AI   | مهندس AI وData   | [`04-data-ai/README.md`](04-data-ai/README.md)     |
| DevOps and QA | مهندس QA وDevOps | [`05-devops-qa/README.md`](05-devops-qa/README.md) |

See [`05-devops-qa/docs/team-ownership.md`](05-devops-qa/docs/team-ownership.md) for the full ownership map and handoff checklist.

## MVP planning docs

Before adding the next database or UI feature, start with these docs:

- [`05-devops-qa/docs/repository-audit.md`](05-devops-qa/docs/repository-audit.md): current implementation audit and gaps.
- [`05-devops-qa/docs/mvp-scope.md`](05-devops-qa/docs/mvp-scope.md): frozen MVP scope for a Yemeni restaurant in China.
- [`05-devops-qa/docs/acceptance-tests.md`](05-devops-qa/docs/acceptance-tests.md): task-by-task acceptance tests and readiness format.

Tasks 1, 2, and 3 are implemented, and Task 4 has started with the deterministic menu cost engine. Task 2 provides versioned templates plus safe CSV/XLSX staged imports. Task 3 provides an organization-, restaurant-, and branch-scoped financial ledger, deterministic calculations, timezone-aware periods, reconciled hierarchy, dashboard API/UI, and golden accuracy coverage. See the [complete import guide](docs/imports/README.md), the [canonical financial engine documentation](docs/financial/README.md), and the [menu intelligence documentation](docs/menu/README.md).

## API

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET /api/financial/model`
- `GET|POST /api/financial/entries`
- `GET /api/financial/calculate`
- `GET /api/financial/period`
- `GET /api/financial/dashboard`
- `GET /api/financial/report`
- `GET /api/branches/performance`
- `GET /api/branches/rankings`
- `GET /api/menu/costs`
- `GET /api/menu/margins`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id/messages`
- `POST /api/chat`
- `GET /api/data/status`
- `GET /api/data/templates`
- `GET /api/data/templates/:key`
- `GET /api/data/templates/:key/download`
- `POST /api/data/import/preview`
- `POST /api/data/import`
- `POST /api/data/import-jobs/preview?templateKey=<key>&filename=<file>`
- `GET /api/data/import-jobs`
- `GET /api/data/import-jobs/metrics`
- `GET /api/data/import-jobs/:id`
- `PUT /api/data/import-jobs/:id/mapping`
- `POST /api/data/import-jobs/:id/confirm`
- `POST /api/data/import-jobs/:id/cancel`
- `POST /api/actions/:hash/confirm`
- `GET /api/health`
- `GET /api/ready`

## Safe staged restaurant data import

New integrations should use the Task 2 contracts for `branches`, `menu`, `costs`, and `sales`. Upload the raw CSV or XLSX file body to `POST /api/data/import-jobs/preview`, passing `templateKey` and `filename` as query parameters. The response stores a server-side import job and returns the first 20 rows, row errors, statistics, and a one-time confirmation token. No final business tables are written during preview. Confirm the exact staged job with `POST /api/data/import-jobs/:id/confirm` and `{ "confirmationToken": "..." }`, or cancel it before confirmation.

The staged importer preserves UTF-8 Arabic/Chinese text, requires ISO-compatible timestamps with explicit timezones such as `+08:00`, stores safe file name/type/size/SHA-256 metadata, validates references, and prevents duplicate sales lines by branch + external order + external line identifiers. Financial money fields are normalized to integer minor units for Task 3. Backend-configured file/row/column/cell limits, strict type checks, formula protection, import-specific rate limits, scoped history, and request-correlated audit events are documented in the [import operations guide](docs/imports/README.md).

## Legacy restaurant data import

The existing **Connect real data** flow remains available for the older CSV contracts below. It is retained for compatibility; new integrations should use the staged Task 2 import jobs.

Legacy column names:

| Data type    | Required columns                                 | Optional columns                                                                              |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Orders       | `created_at,total_price,cost`                    | `items` (JSON), or `item_name,quantity`, `discount`, `commission`, `other_cost`, `source_key` |
| Refunds      | `amount,created_at`                              | `order_id,reason,source_key`                                                                  |
| Menu         | `name,price,cost`                                | `active`                                                                                      |
| Inventory    | `item_name,quantity,threshold`                   | —                                                                                             |
| Staff shifts | `employee_name,role,start_at,end_at,hourly_rate` | —                                                                                             |

Dates should be ISO-compatible, for example `2026-07-04T19:00:00Z`. Imports must be previewed before confirmation. Orders and refunds skip duplicates by `source_key` or row fingerprint. Inventory is branch-scoped. Orders with `quantity > 1` store item unit price/cost correctly so dish revenue is not doubled.

## Expert answer collection

After each assistant response, the owner can approve it or provide a corrected manager answer. The system stores the original question, tool trace, original response, and approved correction per restaurant.

`GET /api/training/export` returns training-ready JSON:

```json
{
  "question": "هل أحتاج موظفين إضافيين الليلة؟",
  "correct_tools": ["get_daily_sales", "suggest_staffing"],
  "approved_answer": "الطلبات المتوقعة أعلى من المعتاد...",
  "source": "owner_corrected"
}
```

## Evaluation dataset

`04-data-ai/evals/dataset.js` contains reviewed Arabic and English scenarios covering busy/quiet days, menu profitability, low inventory, missing data, refund anomalies, staffing decisions, broad manager questions, real-data setup questions, general manager advice, knowledge-grounded answers, language capability questions, and actions requiring confirmation.

Run it after every prompt, model, or tool change:

```bash
pnpm --filter server eval
```

The normal server test command also runs the evaluation suite.

## Book and SOP knowledge base

Use `POST /api/knowledge/import` to add extracted text from restaurant books, SOPs, recipes, or training manuals:

```json
{
  "title": "Service Training Manual",
  "source": "Owner upload",
  "content": "Full extracted book text..."
}
```

The AI can then call `search_knowledge_base(query)` before answering questions about book content. This is retrieval-based grounding, not blind memorization; it keeps answers tied to the uploaded material.

### Training with books and expert conversation examples

The recommended production workflow is:

1. Import private restaurant books, SOPs, recipes, and training manuals into the knowledge base.
2. Import permitted open-source guidance, such as MIT-licensed conversational AI examples, as separate knowledge documents.
3. Ask the owner/manager to approve or correct real assistant answers in the feedback panel.
4. Add the best corrected situations to `04-data-ai/evals/dataset.js`.
5. Run `pnpm --filter server eval` after every prompt, tool, or model change.

This trains behavior safely through retrieval, expert feedback, and regression tests. Do not commit copyrighted book text to GitHub; keep extracted files private and import them only into the deployed database you control.

## Production notes

Set a strong `JWT_SECRET`, use TLS, mount durable storage, and configure `CLIENT_ORIGIN`. In production startup requires an absolute `DATABASE_PATH` inside a separately mounted, writable `DATABASE_VOLUME_PATH`. Root/temporary filesystems and nested mounts shadowing that volume are rejected. Operators must still verify that the host/provider retains the volume across replacement and redeployment. Public demo seeding is disabled unless `ENABLE_DEMO_SEED=true` is explicitly set. See the [production operator handoff](docs/operations/production-operator-handoff.md), [session upgrade](docs/operations/authentication-sessions.md), and [encrypted off-service backup procedure](docs/operations/database-backup-restore.md).

## Deploy publicly

The default `render.yaml` describes a paid Starter deployment for the existing service with a persistent disk, a privately supplied JWT secret and checks-pass deployment gating. `render.persistent.yaml` is an alternative service definition with the same persistence and readiness requirements; do not import both and accidentally create duplicate production services.

Render free web services cannot attach persistent disks. This production configuration intentionally refuses to start on ephemeral storage. The checked-in definitions prepare configuration only; they do not establish that any live service has a disk or working off-service backups. Keep SQLite to one writer instance and verify persistence during a controlled restart before accepting customer data.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/Restrova/restrova-platform)

During setup, no AI provider key is needed. `/api/health` reports the non-secret AI status, including `aiConfigured`, `mode`, `model`, and `version: "prefinal"`. `/api/ready` checks runtime readiness without returning secrets.

### Saudi Arabic assistant and optional local model

The built-in assistant reads confirmed imports from the same financial ledger as the dashboards. Ask «حلل البيانات اللي استوردتها» for the available sales period, «وش أكثر الأصناف مبيعًا؟» for item rankings, or supply explicit dates. It explains the source, branch, dates, missing costs and a recommended next action. Short follow-up questions can retain the previous explicit dates within that branch's conversation.

Financial answers are deterministic: a language model cannot rewrite the figures or turn missing costs into zero. They are computed when each question is asked, so new confirmed imports are included without training a model on private data. Recommendations are suggestions only; existing action confirmation and branch permissions still apply.

Optional general conversation uses the [native Ollama chat API](https://docs.ollama.com/api/chat), configured only on the backend:

| Variable          | Purpose                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`     | `builtin` by default. Set to `ollama` to enable your own model.                                |
| `OLLAMA_BASE_URL` | Reachable address of your Ollama service, such as `http://127.0.0.1:11434` on the same host.   |
| `OLLAMA_MODEL`    | Exact name of a model already installed on that service. No model is downloaded automatically. |
| `OLLAMA_API_KEY`  | Optional authentication token for a protected service.                                         |
| `AI_TIMEOUT_MS`   | Request timeout, default 20000 ms, capped at 60000 ms.                                         |

Use a model with Arabic support; response quality depends on the selected model. Saudi tone instructions are prompting, not fine-tuning. The application does not contact OpenAI, even if an old `OPENAI_API_KEY` remains in its environment. `/api/health` exposes only configuration status and model name, not endpoint credentials or a claim that the model is reachable. A failed optional model request returns an explicit localized fallback. Imported-data analysis continues independently.

The workspace shares the application's design tokens and self-hosted Noto Sans Arabic fonts (license in `03-frontend/web/public/fonts/OFL.txt`), with Arabic, English and Chinese interface labels. Import confirmation remains explicit; previews alone do not enter analytics.

### Railway alternative

The included `05-devops-qa/Dockerfile` and root `railway.json` also support deployment on Railway:

1. Create a Railway project and choose **Deploy from GitHub repo**.
2. Select `Restrova/restrova-platform`.
3. Add `JWT_SECRET`, `DATABASE_PATH=/data/restaurant.db` and `DATABASE_VOLUME_PATH=/data`. Configure `CLIENT_ORIGIN`; set `TRUST_PROXY_HOPS=1` only after verifying the platform's single ingress proxy overwrites forwarded client headers.
4. Generate a public domain from the service networking settings.

Mount a Railway volume at `/data` before startup. `railway.json` does not provision that volume, configure branch protection or prove the deployment is gated on successful security checks. Without the mount, production startup fails. Keep one instance and follow the operator handoff before enabling traffic.
