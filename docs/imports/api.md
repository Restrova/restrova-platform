# Import API

All endpoints use the `/api` prefix and require `Authorization: Bearer <JWT>`. Import jobs require the `owner` role. JSON errors use `{ "error": "...", "code": "..." }`; responses never include stack traces, database details, internal paths, or secrets.

## Templates

### `GET /data/templates`

Returns the four template summaries. `GET /data/templates/:key` returns one complete schema. Unknown keys return `404`.

### `GET /data/templates/:key/download`

Returns a UTF-8 BOM-prefixed CSV header as an attachment. It contains no production or customer data.

## Jobs

### `POST /data/import-jobs/preview?templateKey=branches&filename=branches.csv`

Send the raw file body with `Content-Type: text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

Successful response: `201` with job/file metadata, mapping suggestions, validation statistics, up to 20 preview rows by default, row-level errors/warnings, audit events, and a `confirmationToken` only when the job is ready. No operational rows are written.

Common errors: `400` invalid template, mapping, encoding, file type, parser input, or resource limit; `401` unauthenticated; `403` insufficient role; `413` oversized body; `429` rate limit.

### `PUT /data/import-jobs/:id/mapping`

Request:

```json
{
  "mappings": [
    { "sourceColumn": "Sale Price", "targetField": "selling_price" },
    { "sourceColumn": "Menu Item", "targetField": "name" }
  ]
}
```

The source columns and target fields must exist and each target may be mapped once. The server revalidates all staged rows and rotates the confirmation token. Returns `200`; malformed mappings return `400`, inaccessible jobs return `404`, and finalized jobs return `409`.

### `GET /data/import-jobs`

Returns up to 100 newest scoped jobs. Optional filters:

- `status`: `preview_ready`, `needs_mapping`, `validation_failed`, `ready`, `failed`, `confirmed`, `completed`, or `cancelled`
- `template`: `branches`, `menu`, `costs`, or `sales`
- `branch`: numeric branch ID referenced by a staged row
- `from` / `to`: ISO-compatible timestamps

### `GET /data/import-jobs/metrics`

Returns scoped counts for imports started/completed, validation failures, duplicate rows, rows imported, and average successful duration in milliseconds.

### `GET /data/import-jobs/:id`

Returns one scoped job, its preview/errors, statistics, and audit timeline. Another organization's ID returns `404` instead of revealing that it exists.

### `POST /data/import-jobs/:id/confirm`

Request:

```json
{ "confirmationToken": "token returned by the latest ready preview or mapping response" }
```

Returns `200` after writing accepted rows transactionally. Invalid/expired tokens return `403`; validation failures, reuse, replay, cancelled jobs, and already completed jobs return `409`. Tokens are never accepted twice.

### `POST /data/import-jobs/:id/cancel`

Cancels a preview-ready job and consumes its token. Returns `200`. Completed/cancelled jobs return `409`.

## Request correlation and audit

Clients may send `X-Request-Id`; otherwise Restrova generates one. The response echoes it. Job audit events store the request ID with safe event details so one operation can be traced across API logs and job history.
