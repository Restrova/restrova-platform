# Authentication sessions

Bearer authentication uses signed JWTs backed by durable SQLite `auth_sessions`
records. A valid signature alone is insufficient: the session must be present,
unrevoked, unexpired, and match the current membership, organization, restaurant
and user. Current roles and branch restrictions are loaded on every request.

## Upgrade and operator actions

- Migration `0015_auth_sessions.sql` creates the session store automatically at
  startup. Existing JWTs have no persisted session and users must sign in again
  after this upgrade. Plan this interruption in the release notice.
- Keep `JWT_SECRET` in the hosting secret store, with at least 32 random
  characters. Never put it in the repository, logs or support messages.
- `JWT_EXPIRES_IN` defaults to `12h`. Use a positive whole duration ending in
  `s`, `m`, `h` or `d`, at most `24h`; unqualified numbers are rejected rather
  than interpreted as milliseconds.
- Authenticated `POST /api/auth/logout` revokes that session. Other sessions for
  the same account remain active. A repeated request using the revoked token
  receives `401`.
- To revoke every active session during an incident, stop writes and use the
  approved database administration procedure to delete `auth_sessions` records.
  For one account, delete records with its `owner_id`. Record the action without
  copying token or secret values. Rotate the signing secret if compromised.
- Removing an `organization_users` membership cascades to its sessions. Existing
  tokens cannot regain access when the account is invited again. Organization
  memberships are never recreated at restart for restaurants already assigned
  to an organization. Legacy restaurants with no organization receive their
  initial membership once during the legacy bootstrap.

Expired session records are removed through an indexed expiry query whenever a
new session is issued. Revoked sessions expire on the same schedule. Monitor
database size and login/error rates; follow the backup retention policy because
older backups can contain previously active session records. A restore must
delete all restored `auth_sessions` rows before enabling traffic, forcing fresh
authentication rather than resurrecting sessions revoked after the snapshot.

The SPA stores its bearer token and identity cache in tab-scoped `sessionStorage`;
legacy persistent `localStorage` auth entries are removed without migration.
Reloading a tab retains its session. Closing the tab removes its browser storage,
but does not itself revoke the server session. Logout sends the authenticated
revocation request before clearing local state. If that request cannot reach the
server, local logout still succeeds while a copied token remains valid until its
expiry or operator revocation.

Bearer tokens remain accessible to application JavaScript for this SPA's API
architecture. Enforce HTTPS and the content-security policy, review XSS risks,
and do not add third-party scripts without review. This change does not add MFA,
password recovery, or an expiring invitation-acceptance workflow.
