# Grafana dashboard recipes (Prometheus data source)

Connect Prometheus to Grafana (**Connections → Data sources → Prometheus**). Scrape the backend: `https://<host>/metrics` (use private network, VPN, or `METRICS_BEARER` with Prometheus `authorization` header).

## 1. API (RED-style)

- **RPS (overall):** `sum(rate(http_requests_total[1m]))`
- **RPS by route (top 10):** `topk(10, sum by (route) (rate(http_requests_total[1m])))`
- **Error rate (5xx):** `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
- **Latency p95:** `histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))`
- **Latency p99:** `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))`
- **Panel:** time series for `process_resident_memory_bytes` (if default metrics enabled)

## 2. Queues (Bull)

- **Active jobs (approx, all queues):** `sum(queue_jobs_total)` is a counter; use `sum by (queue) (increase(queue_jobs_total{status="completed"}[5m]))` and same for `failed`
- **Failed per queue:** `sum by (queue) (rate(queue_jobs_total{status="failed"}[5m]))`
- **Job duration p95:** `histogram_quantile(0.95, sum by (le, queue) (rate(queue_job_duration_seconds_bucket[5m])))`
- Cross-check with `GET /api/health/deep` (`queueCounts`, `pendingJobApprox`) in Uptime Robot notes if needed

## 3. Business

- **Posts created:** `increase(posts_created_total[1d])` (reset-aware daily bar) or `rate` for real-time
- **Publish success vs fail (instagram):** `sum(rate(publish_success_total{platform="instagram"}[1h]))` vs `sum(rate(publish_fail_total{platform="instagram"}[1h]))`
- **Publish success % (approx):** `100 * sum(rate(publish_success_total[1h])) / (sum(rate(publish_success_total[1h])) + sum(rate(publish_fail_total[1h]) + 1e-6))`
- **AI by source:** `sum by (source) (rate(ai_requests_total[5m]))`
- **Fallback %:** `sum(rate(ai_fallback_total[5m])) / sum(rate(ai_requests_total[5m])) * 100`

## 4. Health

- **Gauge:** `health_status_ok` is `1` when Mongo + Redis + queues are healthy; alert when `== 0` (see `prometheus-alerts.yml`).

> If you set `METRICS_PREFIX=fc_`, all custom metric names in queries must use the `fc_` prefix. Default in code is an empty prefix (`http_requests_total`, etc.).
