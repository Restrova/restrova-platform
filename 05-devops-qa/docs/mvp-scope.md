# MVP scope — Yemeni restaurant decision layer

This document freezes the first production MVP scope so implementation does not expand into a full POS system.

## Target customer

The first version is for:

> A Yemeni restaurant in China with one or more branches, able to export sales data from its cashier/POS system into CSV or Excel.

Default settings:

- Currency: `CNY`
- Timezone: `Asia/Shanghai`
- Primary language: Arabic
- Later secondary language: Chinese
- First data source: CSV/XLSX files
- No direct POS integration in MVP

## Product positioning

Use this positioning:

> ChatGPT-style decision layer for restaurant owners that helps them make daily profit decisions in seconds.

Avoid this positioning for MVP:

> AI fully runs the restaurant automatically.

The system recommends. The owner approves operational changes.

## Definition of “profit” in MVP

Do not call the main dish-level number “net profit”.

Use:

> Estimated contribution margin

Formula:

```text
Net dish sales
- direct food cost
- packaging cost
- delivery commission when applicable
= estimated contribution margin
```

Reason:

The MVP does not know rent, utilities, taxes, depreciation, financing, and all operating expenses.

## MVP task sequence

### Task 1 — Account, restaurant, branches, and users

Goal:

Allow a real owner to create an account, create an organization, create a restaurant, create branches, and invite users with simple roles.

Roles:

| Role | Permissions |
| --- | --- |
| owner | All restaurants, branches, users, imports, reports, recommendations |
| branch_manager | Assigned branch data only |
| viewer | Read-only reports and dashboards |

Required API:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

POST /api/organizations
GET  /api/organizations/current

POST /api/restaurants
GET  /api/restaurants/current

POST /api/branches
GET  /api/branches
PATCH /api/branches/:id

POST /api/users/invite
GET  /api/users
PATCH /api/users/:id/role
```

Required UI:

- Register page.
- Login page.
- Restaurant onboarding page.
- Branch management page.
- User management page.
- Branch selector.

### Task 2 — Data templates and safe staged import

Files:

- branches
- menu
- costs
- sales

Rules:

- Support CSV and XLSX.
- Show first 20 rows before import.
- Validate fields and row types.
- Show row errors.
- Do not write final tables until owner confirms.
- Save an import job with statistics.
- Prevent duplicate sales when the same file is uploaded twice.
- Support UTF-8 Arabic and Chinese.
- Support dates with `+08:00`.

### Task 3 — Financial calculation engine

Calculate deterministically, without AI:

- gross sales
- discounts
- refunds
- net sales
- direct food cost
- packaging cost
- delivery commission
- estimated contribution margin
- contribution margin percentage
- order count
- average order value
- missing cost coverage

Use decimal-safe arithmetic for money.

### Task 4 — Menu Profitability page

Show:

- item
- quantity
- net sales
- direct food cost
- packaging
- delivery commission
- estimated contribution margin
- margin percentage
- cost status
- filters by period, branch, channel, category
- comparison between dine-in, takeaway, and delivery

### Task 5 — Discount and refund anomaly detection

Use fixed rules, not machine learning:

- `HIGH_DISCOUNT_RATE`
- `HIGH_REFUND_RATE`

Every alert must include:

- type
- branch
- period
- current value
- baseline
- difference
- financial impact
- confidence
- evidence
- recommended action template

### Task 6 — Sales comparison

Compare:

- today vs yesterday
- today vs same weekday last week
- today vs average same weekday over last four weeks
- branch vs branch for the same period

### Task 7 — Daily report

Saved report per branch and operating date with:

- KPIs
- comparisons
- highest alert
- top action
- estimated financial impact
- data quality
- last data update

### Task 8 — Arabic tool-grounded chat

Required tools:

- `get_sales_summary`
- `get_menu_profitability`
- `get_item_profitability`
- `get_discount_anomalies`
- `get_refund_anomalies`
- `compare_branches`
- `get_top_recommendation`
- `get_data_quality`

Rules:

- Every number comes from a tool result.
- The model never writes SQL.
- The model never receives or invents organization IDs.
- Organization and branch identity come from the session.
- Default answer language is Arabic.
- Mention branch, period, and last data update.
- Explain missing data clearly.

### Task 9 — Recommendations and action tracking

Recommendation states:

- proposed
- accepted
- rejected
- in_progress
- completed
- cancelled

The AI never executes operational changes automatically.

### Task 10 — Outcome measurement

Measure completed recommendations after 7 and 14 days.

Do not claim causality. Show confidence and limitations.

### Task 11 — Full journey demo

Demo restaurant:

- Yemeni restaurant in China
- Branches:
  - Guangzhou
  - Yiwu

Menu examples:

- مندي دجاج
- مندي لحم
- حنيذ
- سلتة
- فحسة

Seed 45 days of data including:

- normal sales
- one high-discount day
- one high-refund branch event
- high-sales / low-margin dish
- missing-cost dishes
- recommendation with measurable outcome

## Out of scope for MVP

- Direct POS integration.
- Full recipe/ingredient costing.
- Payroll system.
- Tax accounting.
- Net-profit accounting.
- Automated execution without approval.
- Complex role matrix beyond owner, branch manager, viewer.

