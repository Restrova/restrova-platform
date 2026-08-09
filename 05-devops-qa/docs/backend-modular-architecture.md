# Backend Modular Architecture

The Express backend is intentionally still a single deployable service. The refactor separates responsibilities inside the monorepo without introducing microservices or changing API behavior.

## Request flow

```text
HTTP request
  -> app.js
  -> middleware/security.js
  -> routes/apiRoutes.js
  -> controllers/apiController.js
  -> services/*
  -> repositories/*
  -> db.js / domain modules
  -> middleware/errorHandler.js on failure
```

## Layers

### `config/`

Centralizes environment configuration and startup validation.

- `config/appConfig.js`
- Validates production `JWT_SECRET`
- Defines JWT issuer/audience/expiration
- Defines body size, CORS origins, bcrypt cost, and rate limits

### `middleware/`

Contains Express-specific request handling.

- `security.js`: Helmet, CORS, JSON body limit, API/auth rate limiting
- `auth.js`: JWT authentication and role guards
- `errorHandler.js`: centralized Express error responses

Middleware does not contain business calculations or direct SQL queries.

### `errors/`

Defines the central application error model.

Stable error codes:

- `AUTH_REQUIRED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Clients still receive a human-readable `error` field, with an added machine-readable `code`.

### `routes/`

Maps URLs to middleware and controllers.

- `routes/apiRoutes.js`

Routes should not contain business logic or database queries.

### `controllers/`

Converts HTTP requests into service calls and writes HTTP responses.

- `controllers/apiController.js`

Controllers should stay thin. They should not perform business calculations or SQL queries.

### `services/`

Contains application use cases and authorization-aware orchestration.

- `authService.js`
- `branchService.js`
- `chatService.js`
- `dashboardService.js`
- `dataService.js`
- `knowledgeService.js`
- `organizationService.js`
- `userService.js`

Services enforce tenant, restaurant, branch, and role boundaries before calling domain logic or AI.

### `repositories/`

Contains database queries.

- `authRepository.js`
- `branchRepository.js`
- `chatRepository.js`
- `organizationRepository.js`
- `userRepository.js`

New SQL should be added to repositories rather than route handlers or controllers.

### Domain/business modules

Existing domain-heavy modules remain outside HTTP controllers:

- `tools.js`: restaurant calculations and tool execution
- `dataImport.js`: CSV import parsing and validation
- `knowledge.js`: knowledge ingestion/search
- `ai.js`: AI prompt/runtime behavior

AI calls are reached through `chatService.js`, which first resolves the authenticated user, branch, session, and tool scope.

## Error handling rules

- Throw `AppError` for expected application failures.
- Let unexpected exceptions bubble to `errorHandler`.
- Never expose stack traces or internal exception details.
- Preserve the existing `error` response field for frontend compatibility.
- Include `code` for machine-readable handling.

## Authorization rules

- Authentication is performed by `middleware/auth.js`.
- Role checks happen in routes via `requireRole`/`requireOwner`.
- Tenant and branch checks happen in services before repositories or AI/tool calls.
- Branch managers are scoped to one branch through `branchService.defaultBranchId` and `branchService.assertBranchAccess`.

## Adding a new endpoint

1. Add validation schema in `validation/schemas.js`.
2. Add SQL in an existing or new repository.
3. Add use-case logic in a service.
4. Add a thin controller function.
5. Wire the route in `routes/apiRoutes.js`.
6. Add tests for auth, role, tenant/branch access, validation, and success behavior.

Avoid putting calculations or SQL in controllers.
