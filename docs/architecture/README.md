# Architecture documentation

This project remains a single monorepo. It is not split into microservices.

## Current shape

- Backend API: `02-backend/server`
- Frontend app: `03-frontend/web`
- Data/AI evaluation assets: `04-data-ai`
- DevOps/QA assets: `05-devops-qa`

## Runtime model

The Express backend owns:

- Authentication and authorization.
- Database access.
- Restaurant operations tools.
- AI provider calls and deterministic fallback mode.
- Serving the production frontend bundle.

The React frontend owns:

- Application shell and navigation.
- Login/register user experience.
- Current workspace UI.
- Locale and restaurant/branch selection state.

## Architecture decision records

New durable architecture decisions should be recorded in `docs/adr/`.
