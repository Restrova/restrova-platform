# Repository audit — AI Restaurant Manager

Date: 2026-07-20

This audit records the current state before expanding the MVP. It follows the requested rule: inspect the repository and document scope before changing database structure or UI flows.

## Current architecture

- Monorepo with npm workspaces:
  - `02-backend/server`: Express API, SQLite via `better-sqlite3`, JWT auth, OpenAI Responses API integration.
  - `03-frontend/web`: React + Vite single-page app.
- Production serving:
  - Express serves `03-frontend/web/dist` when `NODE_ENV=production`.
  - Railway deployment uses `05-devops-qa/Dockerfile` and `railway.json`.
- Data store:
  - SQLite file selected by `DATABASE_PATH`.
  - Current Railway setup uses `./data/restaurant.db`.

## Current backend capabilities

Implemented:

- `POST /api/auth/login`
- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/data/status`
- `POST /api/data/import`
- `GET /api/knowledge/status`
- `POST /api/knowledge/import`
- `GET /api/knowledge/search`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id/messages`
- `POST /api/chat`
- `POST /api/feedback`
- `GET /api/training/export`

Current tables:

- `owners`
- `restaurants`
- `menu_items`
- `inventory`
- `orders`
- `chat_sessions`
- `chat_messages`
- `reports`
- `refunds`
- `staff_shifts`
- `answer_feedback`
- `knowledge_documents`
- `knowledge_chunks`

Current AI tools:

- `get_daily_sales`
- `get_profit_summary`
- `get_top_dishes`
- `get_low_performance_items`
- `get_inventory_status`
- `get_refund_summary`
- `search_knowledge_base`
- `create_report`
- `suggest_staffing`
- `flag_menu_item`

## Current frontend capabilities

Implemented:

- Login screen with demo credentials.
- Chat-style decision center.
- Sidebar decision brief.
- CSV upload modal for:
  - orders
  - refunds
  - menu items
  - inventory
  - staff shifts
- Answer feedback collection.
- Error boundary to avoid blank screens.

Not implemented yet:

- Registration/onboarding.
- Organization setup.
- Branch management.
- User invitation and role management.
- Branch selector.
- Data-import preview and confirmation.
- XLSX upload.
- Menu profitability page.
- Sales comparison page.
- Alert/recommendation tracking pages.
- Daily report history page.

## Main gaps against the requested MVP scope

### Account, organization, branches, roles

Missing:

- `organizations` table.
- `branches` table.
- multi-user membership/role table.
- owner / branch_manager / viewer permissions.
- register endpoint.
- `GET /api/auth/me`.
- branch-scoped access control.

Current limitation:

- JWT contains `ownerId` and `restaurantId` only.
- A user currently maps to one restaurant.

### Yemeni restaurant in China assumptions

Missing:

- default currency `CNY`.
- default timezone `Asia/Shanghai`.
- Arabic default language.
- branch operating day start/end, including after-midnight closing.
- Yemeni demo dataset with Guangzhou/Yiwu branches and Yemeni menu items.

Current limitation:

- Demo restaurant is `Harbor & Hearth`, with USD-style English menu examples.

### Safe staged imports

Missing:

- Import jobs.
- Preview first 20 rows.
- Confirm import before committing to final tables.
- Rejected-row storage.
- Duplicate prevention by organization/branch/order/item key.
- Downloadable templates.
- XLSX support.
- saved original imported file metadata.

Current limitation:

- `POST /api/data/import` directly writes validated CSV rows into final tables.

### Financial calculation engine

Missing:

- Separate deterministic domain engine for contribution margin.
- Decimal-safe money arithmetic.
- contribution margin naming.
- channel-aware packaging/delivery commission calculations.
- missing cost coverage.

Current limitation:

- Current tools use `total_price - cost` and call the result `profit`.
- This should be renamed for MVP business accuracy: estimated contribution margin, not net profit.

### Alerts, recommendations, reports

Missing:

- fixed rule engine for high discount/refund anomalies.
- sales comparison baselines.
- saved daily report per branch/operating date.
- recommendation lifecycle.
- outcome measurement after recommendation completion.

Current limitation:

- Reports are basic tool-generated JSON saved in `reports`.

### AI chat

Implemented:

- OpenAI-backed mode when `OPENAI_API_KEY` is configured.
- Demo fallback mode.
- Chat history saved.
- Tool calling.
- Arabic handling in prompt/demo mode.

Missing:

- New tool names from target scope:
  - `get_sales_summary`
  - `get_menu_profitability`
  - `get_item_profitability`
  - `get_discount_anomalies`
  - `get_refund_anomalies`
  - `compare_branches`
  - `get_top_recommendation`
  - `get_data_quality`
- Structured output for Arabic decision responses.
- branch/period context in every answer.

## Testing status

Existing tests cover:

- AI prompt/demo behavior.
- CSV parsing/import basics.
- answer feedback.
- knowledge base.
- tools.
- evaluation dataset.

Current test command:

```bash
npm run test -w server
```

Existing frontend build command:

```bash
npm run build -w web
```

## Recommended next implementation task

Implement Task 1 only:

Account, organization, restaurant, branches, and users.

Do not begin import staging, calculations, alerts, reports, or recommendation tracking until Task 1 passes its acceptance tests.

