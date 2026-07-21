# Restaurant Decision AI — Built-in Prefinal Edition

The AI decision layer for restaurant owners. Ask for a daily summary, find menu profit leaks, and catch inventory risks in seconds. The assistant uses restaurant-scoped tools, never invents business figures, and requires owner approval before operational changes.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`, choose **Create restaurant**, and create your own owner account, organization, restaurant, and first branch.

The app uses its built-in prefinal restaurant assistant mode by default. It answers supported restaurant operations questions with deterministic business logic, restaurant-scoped tools, and data-readiness checks. No OpenAI API key or external model is required.

Important: the built-in assistant is rules-based. It can analyze connected restaurant data for supported questions, explain missing data, and avoid fake “healthy” conclusions, but it is not an open-ended language model. To enable real OpenAI model responses, set `OPENAI_API_KEY` on the backend service only.

## Architecture

- `web/`: React + Vite chat workspace and live operations sidebar
- `server/`: Express REST API, JWT authentication, SQLite persistence, built-in assistant logic
- Tool implementations are pure restaurant-scoped functions in `server/src/tools.js`
- Every operational query is constrained by the authenticated organization, restaurant, role, and branch scope.

## MVP planning docs

Before adding the next database or UI feature, start with these docs:

- [`docs/repository-audit.md`](docs/repository-audit.md): current implementation audit and gaps.
- [`docs/mvp-scope.md`](docs/mvp-scope.md): frozen MVP scope for a Yemeni restaurant in China.
- [`docs/acceptance-tests.md`](docs/acceptance-tests.md): task-by-task acceptance tests and readiness format.

The next implementation task is Task 1 only: account registration, organization, restaurant, branches, roles, and user management.

## API

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id/messages`
- `POST /api/chat`
- `GET /api/data/status`
- `POST /api/data/import/preview`
- `POST /api/data/import`
- `POST /api/actions/:hash/confirm`
- `GET /api/health`

## Real restaurant data imports

Use **Connect real data** inside the app to upload CSV exports. Column names:

| Data type | Required columns | Optional columns |
| --- | --- | --- |
| Orders | `created_at,total_price,cost` | `items` (JSON), or `item_name,quantity`, `discount`, `commission`, `other_cost`, `source_key` |
| Refunds | `amount,created_at` | `order_id,reason,source_key` |
| Menu | `name,price,cost` | `active` |
| Inventory | `item_name,quantity,threshold` | — |
| Staff shifts | `employee_name,role,start_at,end_at,hourly_rate` | — |

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

`server/evals/dataset.js` contains 88 reviewed Arabic and English scenarios covering busy/quiet days, menu profitability, low inventory, missing data, refund anomalies, staffing decisions, broad manager questions, real-data setup questions, general manager advice, knowledge-grounded answers, language capability questions, and actions requiring confirmation.

Run it after every prompt, model, or tool change:

```bash
npm run eval -w server
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
4. Add the best corrected situations to `server/evals/dataset.js`.
5. Run `npm run eval -w server` after every prompt, tool, or model change.

This trains behavior safely through retrieval, expert feedback, and regression tests. Do not commit copyrighted book text to GitHub; keep extracted files private and import them only into the deployed database you control.

## Production notes

Set a strong `JWT_SECRET`, use TLS, move SQLite to a durable volume (or swap to PostgreSQL), and configure `CLIENT_ORIGIN`. In production the app refuses to start without `JWT_SECRET` and `DATABASE_PATH`. Public demo seeding is disabled unless `ENABLE_DEMO_SEED=true` is explicitly set.

## Deploy publicly

The repository includes a Render Blueprint that builds the React frontend, serves it from Express, creates a generated JWT secret, and mounts SQLite on `/var/data`. Keep that disk enabled or switch to PostgreSQL before storing real restaurant data.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/sami124-coder/AI-restaurant-)

During setup, no AI provider key is needed. `/api/health` reports the non-secret AI status, including `aiConfigured`, `mode`, `model`, and `version: "prefinal"`.

### Optional OpenAI model mode

OpenAI calls are made only from `server/src/ai.js`. Never put an OpenAI key in frontend JavaScript, `VITE_*` variables, GitHub, screenshots, logs, or API responses.

Supported backend environment variables:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables OpenAI mode when present. Leave empty for deterministic demo mode. |
| `OPENAI_MODEL` | Model name used by the Responses API. Defaults to `gpt-5.6`. |
| `OPENAI_REASONING_EFFORT` | Optional Responses API reasoning effort. |
| `OPENAI_TEXT_VERBOSITY` | Optional Responses API text verbosity. |
| `OPENAI_MAX_OUTPUT_TOKENS` | Optional response length cap. |

Runtime behavior:

- If `OPENAI_API_KEY` is missing, the app uses deterministic built-in responses.
- If `OPENAI_API_KEY` is present, the backend sends the owner question and tool-backed draft to the OpenAI Responses API.
- If the OpenAI request fails, the server logs a sanitized failure and returns an explicit built-in fallback answer instead of pretending the model succeeded.
- Logs include only mode, selected model, success/failure, HTTP status, and sanitized error type.

### Railway alternative

The included `Dockerfile` and `railway.json` also support deployment on Railway:

1. Create a Railway project and choose **Deploy from GitHub repo**.
2. Select `sami124-coder/AI-restaurant-`.
3. Add `JWT_SECRET` and `DATABASE_PATH`.
4. Generate a public domain from the service networking settings.

For durable SQLite data, mount a Railway volume at `/data` and set `DATABASE_PATH=/data/restaurant.db`. Without a volume, production startup should be treated as unsafe for real restaurant data.
