# Security documentation

Security process and threat-model notes belong here.

## Baseline rules

- Never commit secrets or private restaurant data.
- AI provider keys must stay on the backend.
- Logs must not include authorization headers, API keys, full model responses, or full sensitive restaurant datasets.
- Any exposed secret must be rotated immediately.

## Related files

- `SECURITY.md`
- `.env.example`
- `.github/pull_request_template.md`
- Security and production-readiness guidance is maintained under `docs/security/` and `docs/operations/`.
