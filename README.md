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

Important: the built-in assistant is rules-based. It can analyze connected restaurant data for supported questions, explain missing data, and avoid fake “healthy” conclusions, but it is not an open-ended language model. To enable real OpenAI model responses, set `OPENAI_API_KEY` on the backend service only.

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

Task 1 and Task 2 are implemented. Task 2 provides versioned templates plus safe CSV/XLSX staged import jobs with automatic/manual mapping, typed validation, bounded preview, expiring one-use confirmation tokens, cancellation, audit history, operational metrics, abuse controls, and duplicate-safe sales lines. See the [complete import guide](docs/imports/README.md), [API reference](docs/imports/api.md), and [safe example files](docs/imports/examples/). The next milestone is **Task 3: the deterministic financial calculation engine**.

## API

- `POST /api/auth/login`
- `GET /api/dashboard`
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

Set a strong `JWT_SECRET`, use TLS, move SQLite to a durable volume (or swap to PostgreSQL), and configure `CLIENT_ORIGIN`. In production the app refuses to start without `JWT_SECRET` and `DATABASE_PATH`. Public demo seeding is disabled unless `ENABLE_DEMO_SEED=true` is explicitly set.

## Deploy publicly

The default `render.yaml` is a working free preview deployment: it builds the React frontend, serves it from Express, creates a generated JWT secret, and auto-deploys only after GitHub checks pass. Register a new owner account after the deployment opens.

Render free web services cannot attach persistent disks, so preview accounts and data can disappear after a restart or redeploy. Do not store real restaurant data in the free preview. For durable SQLite, create a Blueprint using `render.persistent.yaml`; it selects a paid Starter service and mounts `/var/data`. A managed database is preferable before production scale.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/Restrova/restrova-platform)

During setup, no AI provider key is needed. `/api/health` reports the non-secret AI status, including `aiConfigured`, `mode`, `model`, and `version: "prefinal"`. `/api/ready` checks runtime readiness without returning secrets.

### Optional OpenAI model mode

OpenAI calls are made only from `02-backend/server/src/ai.js`. Never put an OpenAI key in frontend JavaScript, `VITE_*` variables, GitHub, screenshots, logs, or API responses.

Supported backend environment variables:

| Variable                   | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `OPENAI_API_KEY`           | Enables OpenAI mode when present. Leave empty for deterministic demo mode. |
| `OPENAI_MODEL`             | Model name used by the Responses API. Defaults to `gpt-5.6`.               |
| `OPENAI_REASONING_EFFORT`  | Optional Responses API reasoning effort.                                   |
| `OPENAI_TEXT_VERBOSITY`    | Optional Responses API text verbosity.                                     |
| `OPENAI_MAX_OUTPUT_TOKENS` | Optional response length cap.                                              |

Runtime behavior:

- If `OPENAI_API_KEY` is missing, the app uses deterministic built-in responses.
- If `OPENAI_API_KEY` is present, the backend sends the owner question and tool-backed draft to the OpenAI Responses API.
- If the OpenAI request fails, the server logs a sanitized failure and returns an explicit built-in fallback answer instead of pretending the model succeeded.
- Logs include only mode, selected model, success/failure, HTTP status, and sanitized error type.

### Railway alternative

The included `05-devops-qa/Dockerfile` and root `railway.json` also support deployment on Railway:

1. Create a Railway project and choose **Deploy from GitHub repo**.
2. Select `Restrova/restrova-platform`.
3. Add `JWT_SECRET` and `DATABASE_PATH`.
4. Generate a public domain from the service networking settings.

For durable SQLite data, mount a Railway volume at `/data` and set `DATABASE_PATH=/data/restaurant.db`. Without a volume, production startup should be treated as unsafe for real restaurant data.
