# Incident Response

## Severity

- SEV-1: customer data exposure, data loss, auth bypass, production outage
- SEV-2: major feature unavailable or degraded for many users
- SEV-3: isolated customer-impacting bug
- SEV-4: internal-only issue

## First 15 minutes

1. Assign an incident commander.
2. Stop risky deployments.
3. Capture current symptoms and affected users.
4. Check `/api/health`, `/api/ready`, platform logs, and latest deployment.
5. If data exposure or secret leakage is suspected, rotate affected secrets.

## Communication

- Keep a timeline.
- Share facts, not guesses.
- Do not paste secrets, JWTs, API keys, or customer data in issue comments.

## After resolution

- Write a post-incident review.
- Add or update tests.
- Create follow-up issues for root causes.
- Review whether monitoring would have detected the issue earlier.
