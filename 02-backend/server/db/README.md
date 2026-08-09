# Database Structure

Runtime schema creation currently lives in `02-backend/server/src/db.js` for MVP compatibility.

This folder defines the future production database organization:

- `schema/`: canonical schema documentation
- `migrations/`: future ordered migration files
- `seeds/development/`: local demo/development seed guidance
- `seeds/test/`: deterministic test fixture guidance
- `tests/`: database migration and integrity test guidance

Do not create a separate database repository. Database code and migration history stay inside the Restrova monorepo.

## PostgreSQL migration path

SQLite remains useful for MVP and local development. Before real customers, Restrova should:

1. Add explicit migration version tracking.
2. Convert money fields from floating-point values to integer minor units or decimal types.
3. Introduce PostgreSQL in staging.
4. Run dual-read/dry-run migration checks from SQLite exports.
5. Move production to PostgreSQL with backup, restore, and migration rollback procedures.
6. Keep SQLite only for local/demo mode.
