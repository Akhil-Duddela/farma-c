# Farm-C AI — deployment guide

## Architecture

- **API** (`backend`, Express + MongoDB + JWT)
- **Worker** (Bull consumer for Instagram publishes; run separately from API in production)
- **Scheduler** (cron: stale publish reset + missed scheduled recovery)
- **Web** (Angular static build behind nginx; proxies `/api` to API)
- **Redis** (Bull queues), **MongoDB** (data)

## Local development

### Prerequisites

- Node.js 18+
- MongoDB, Redis
- OpenAI API key; AWS S3 bucket with public HTTPS base URL for media
- Meta app with Instagram Graph API (Business/Creator account)

### Backend

```bash
cd backend
# Create ../.env in the project root (not in git). Set MONGODB_URI, REDIS_URL, JWT_SECRET,
# ENCRYPTION_KEY (64 hex: openssl rand -hex 32), OPENAI_API_KEY, AWS_*, INSTAGRAM_*, YOUTUBE_* as needed.
npm install
npm run dev
```

Health check: `GET http://localhost:4000/health`

### Workers (recommended separate terminals)

```bash
cd backend
npm run worker
npm run scheduler
```

### Frontend

```bash
cd frontend
npm install
npm start
# open http://localhost:4200 — API base URL is http://localhost:4000/api (see `src/environments/environment.ts`)
```

### Instagram & S3 notes

1. Instagram Graph API requires a **public HTTPS URL** for `image_url`. Point `AWS_S3_PUBLIC_BASE_URL` at your bucket (or CloudFront) so generated image URLs are reachable by Meta’s servers.
2. Long-lived user tokens must be refreshed before expiry; `tokenService.refreshIfNeeded` exchanges tokens when close to expiry.
3. Account must be **Instagram Business or Creator** and linked to a Facebook Page per Meta rules.

## Multi-platform workers (Instagram + YouTube)

Run **two** Bull workers (separate processes or containers) so each platform is isolated:

- `npm run worker:ig` — `instagram-publish` queue (Graph API images/videos)
- `npm run worker:yt` — `youtube-publish` queue (Data API v3 resumable upload, Shorts under 60s)

Docker Compose service names: `worker-ig`, `worker-yt`. Set `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` for OAuth. Link YouTube: `GET /api/youtube/auth-url` and `POST /api/youtube/exchange` with the authorization `code`, or `POST /api/youtube/link` with tokens (encrypted at rest).

When **both** platforms are enabled, the API enqueues **two** jobs in parallel. Failures on one platform do not roll back the other; aggregate `status` is `partial` or `failed` as appropriate.

## Docker (full stack)

From the project root (Compose loads project `.env` for variable substitution; Mongo/Redis use in-network hostnames `mongo` and `redis`, not `localhost`):

```bash
docker compose up -d --build
```

- **UI (nginx + Angular):** `http://localhost:8080` — browser calls `/api/...` on the same origin; nginx proxies to the `api` service.
- **API (direct, health, OAuth redirects):** `http://localhost:4001` — map host **4001** → container 4000 to avoid clashing with a local dev server on 4000.
- **OAuth:** In Meta and Google apps, set redirect URLs to `http://localhost:4001/api/instagram/callback` and `http://localhost:4001/api/youtube/callback` (these are fixed in `docker-compose.yml` for the stack). They must match **character-for-character** (scheme, host, port, path). If Google shows **Error 400: `redirect_uri_mismatch`**, open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → your **OAuth 2.0 Client ID** → under **Authorized redirect URIs** add that exact `.../api/youtube/callback` string. The dashboard’s “Connected accounts” card also shows the active `redirectUri` from the API. For **Authorized JavaScript origins**, add e.g. `http://localhost:8080` and `http://localhost:4001` if Google asks.
- **Mongo/Redis** are not published to the host by default (avoids port conflicts with local databases). Data stays in the `mongo_data` volume.
- `CORS_ORIGIN` in Compose includes `http://localhost:8080` and `http://localhost:4200` for the Angular dev server when not using Docker.

Scale Instagram workers: `docker compose up -d --scale worker-ig=2` (YouTube: `worker-yt`).

## Cloud deployment (outline)

1. **MongoDB Atlas** or managed Mongo; set `MONGODB_URI`.
2. **Redis** (ElastiCache, Redis Cloud): set `REDIS_URL`.
3. **S3 + CloudFront**: set `AWS_*` and `AWS_S3_PUBLIC_BASE_URL` to the CloudFront domain.
4. Run **API**, **worker**, and **scheduler** as separate services/containers (ECS, Kubernetes, Fly.io, etc.).
5. Serve **Angular** from CDN or nginx; reverse-proxy `/api` to the API load balancer.
6. Store secrets in a **secrets manager** (not plain env files in production).
7. Enable **TLS** everywhere; restrict security groups; rotate Meta and OpenAI keys.

### YouTube OAuth + split front end / API (e.g. Render)

If the UI and API are on different hosts (e.g. `https://farma-c-ui.onrender.com` and `https://farma-c.onrender.com`), the **API** must know the public SPA URL. After Google redirects to your API, the user is sent to `/youtube/oauth-result` on **that** URL.

- Set on the **API** service: **`FRONTEND_URL=`**`https://your-ui-host` (no trailing slash). example: `https://farma-c-ui.onrender.com`.
- Set **`CORS_ORIGIN=`**`https://your-ui-host` (or include it, comma-separated, if you list multiple origins).
- In **Google Cloud** → OAuth client → **Authorized redirect URIs**, the callback must be your **API** URL, e.g. `https://farma-c.onrender.com/api/youtube/callback` (not the UI host).

If `FRONTEND_URL` is missing and `CORS_ORIGIN` lists `http://localhost:4200` first, browser OAuth can incorrectly redirect to localhost.

## Operations

- **Dead-letter jobs**: stored in MongoDB `deadletterjobs` after max Bull attempts.
- **Stale publishing**: posts stuck in `publishing` > 30 minutes are reset to `failed` by recovery logic.
- **Missed schedules**: `recoverMissedScheduledJobs` runs on API startup and every 5 minutes in the scheduler worker.

## Health & monitoring

- Use `/health` for load balancers.
- Forward structured logs from containers to your log stack (CloudWatch, Datadog, etc.).
- Alert on worker crash loops and Redis connectivity.
