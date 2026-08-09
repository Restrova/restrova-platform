# AI Safety Model

Restrova treats AI as an assistant, not an authority.

## Rules

- Business calculations must use deterministic server-side tools.
- Tenant identity must come from authenticated backend context.
- AI must not generate or execute unrestricted SQL.
- Tool arguments must be validated.
- Tool execution must enforce server-side authorization.
- AI must not invent unavailable business figures.
- Sensitive mutations require explicit user confirmation.
- Failed tools must not become fabricated answers.

## Current implementation

- `chatService` resolves the authenticated user, branch, and session before calling AI.
- `tools.js` performs restaurant calculations with scoped context.
- `ai.js` can use OpenAI only from the backend and falls back explicitly when OpenAI fails.
- AI behavior must be covered by regression and safety evaluations alongside the AI implementation whenever AI features are introduced.

## Remaining production work

- Add tenant-level AI provider consent/settings.
- Add auditable tool traces to assistant responses.
- Add redaction controls before sending data to external AI providers.
- Restrict training export to owner or AI/data-admin role.
