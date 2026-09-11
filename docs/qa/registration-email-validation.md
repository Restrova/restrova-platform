# Early registration email validation — #204

The account step checks the email when the user selects **Continue**, before organization, restaurant or branch details are requested. Invalid email syntax is blocked by the form and validated again by the API. Duplicate emails keep the user on the account step with an Arabic, English or Chinese message.

`POST /api/auth/email-availability` accepts `{ "email": "owner@example.test" }` and returns only `{ "available": true }` or `{ "available": false }`. It uses the existing authentication rate limiter and `Cache-Control: no-store`. It returns no account ID, profile, tenant information or authentication token. Like the existing registration conflict response, this endpoint reveals whether a supplied email is registered; rate limiting bounds probing.

Registration/login email inputs are trimmed and normalized to lowercase. Legacy mixed-case addresses remain usable through a case-insensitive lookup. The final registration request still rechecks availability; a conflict returns the user to the account step while preserving the rest of the entered profile.

During verification, account inputs and the continue button are locked and duplicate submissions are guarded. A network/server failure leaves the user on the same step and allows retry. A successful check does not reserve the address and never substitutes for final server validation.

Verification includes the email-availability API test, onboarding component tests for duplicates/network errors/invalid syntax/duplicate clicks, and the existing full-stack registration/login journeys. No browser screenshots were captured: the supervised preview could not start the repository's pnpm-based development process in its restricted runtime. The full-stack component tests use an isolated real backend and database; they are not browser visual QA.
