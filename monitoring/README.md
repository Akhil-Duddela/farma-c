# Farm-C AI — monitoring stack

## Backend

| Feature | How |
|--------|-----|
| **Sentry (APM + errors)** | `SENTRY_DSN` in env. `src/instrument.js` runs before the app. Optional: `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`. Fails open if Sentry is down. |
| **Prometheus** | `GET /metrics` (not under `/api`). Optional auth: `METRICS_BEARER=secret` → `Authorization: Bearer <secret>`. Disable: `METRICS_ENABLED=0`. No default name prefix: `http_requests_total` etc.; set `METRICS_PREFIX=fc_` if you need to avoid collisions. |
| **Structured JSON logs** | Production: JSON to stdout with `requestId` (and ALS where applicable). Per-request: `req.log = logger.child({ requestId })`. **Do not** log tokens or `Authorization` headers. |
| **Request correlation** | `X-Request-Id` on responses; `req.id` and `req.log` in handlers. |

## Frontend

| Feature | How |
|--------|-----|
| **Sentry** | Set `sentryDsn` in `src/environments/environment(.prod).ts` (or replace at build). `src/sentry-frontend.init.ts` + `ErrorHandler` via `createErrorHandler` when DSN is non-empty. |

## Health checks (Render, UptimeRobot, Kubernetes)

- **Liveness / public:** `GET /health` → simple `{ ok: true }` (or use `/api/health` for dependency-aware status).
- **Readiness (DB):** `GET /health/ready` → 503 if Mongo is not connected.
- **Full stack:** `GET /api/health` — JSON: `status` is `ok` or `degraded` (Mongo, Redis, queue reachability). Use the **path your platform supports**; Render can point at `https://<api>/api/health`.

## Log aggregation (optional)

- **Grafana Loki:** promtail or Alloy scrapes container stdout (JSON); label with `service="farm-c-ai"`, `env=production`. Search `{service="farm-c-ai"} | json | requestId="<uuid>"`.
- **ELK / OpenSearch:** ship Filebeat/Fluent Bit JSON logs the same way.

## Files

- `prometheus-alerts.yml` — example rules (tune rates for your install).
- `GRAFANA_DASHBOARDS.md` — example PromQL for panels.
