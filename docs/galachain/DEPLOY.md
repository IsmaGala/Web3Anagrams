# DEPLOY.md

How to ship the dashboard to Google Cloud Run. Total time, end-to-end: about 5 minutes.

## What you need

- A Google Cloud account with billing enabled (the free tier covers tiny dashboards)
- `gcloud` CLI installed and logged in (`gcloud auth login`)
- Docker installed locally (only needed if you want to test the container before deploy)

## The Dockerfile

`/Dockerfile` is a multi-stage build:

```Dockerfile
# Stage 1: build the React app
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime — only ships the server + built static assets
FROM node:22-slim
WORKDIR /app
COPY server-package.json package.json
RUN npm install --omit=dev
COPY server.mjs .
COPY --from=build /app/dist ./dist
ENV PORT=8080
CMD ["node", "server.mjs"]
```

Key choices:
- **Multi-stage** keeps the final image small (~150 MB instead of ~600 MB) by excluding `node_modules` from the build stage.
- **`server-package.json`** is a separate file listing only the runtime deps (Express + http-proxy-middleware). The full `package.json` has React, Vite, TypeScript etc., which aren't needed at runtime.
- **`PORT=8080`** matches Cloud Run's default.

## One-command deploy

```sh
gcloud run deploy games-dashboard \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080
```

What happens:
1. `gcloud` uploads the source to Cloud Build.
2. Cloud Build runs the Dockerfile, producing a container image stored in Artifact Registry.
3. Cloud Run deploys that image as a service.

First deploy is slow (~3-5 min). Subsequent deploys are faster (~90 s) because layer caching kicks in.

## Configuration knobs

| Flag | Effect |
|---|---|
| `--min-instances 0` *(default)* | Scale to zero between requests. Free, but adds a ~1-2s cold start. |
| `--min-instances 1` | Always-warm. Costs roughly $3-5/month for a small instance. |
| `--memory 256Mi` *(default 512Mi)* | Smaller instance, cheaper. The dashboard server is tiny. |
| `--max-instances 10` | Cap horizontal scale. |
| `--set-env-vars KEY=VAL,KEY2=VAL2` | Inject env vars (e.g., an upstream auth token). |
| `--allow-unauthenticated` | Public. Drop this flag to make Cloud Run require IAM auth. |

## Environment variables

The server reads only `PORT`. Cloud Run sets this automatically.

If you add upstream API tokens or feature flags later, set them via `--set-env-vars` (visible in Cloud Run console) or, for secrets, `--update-secrets` with Secret Manager.

## Logs and monitoring

```sh
gcloud run services logs read games-dashboard --region us-east1 --limit 50
```

Or open the **Cloud Run -> Logs** tab in the console for live tail.

## Rolling back

Cloud Run keeps every revision:

```sh
gcloud run revisions list --service games-dashboard --region us-east1
gcloud run services update-traffic games-dashboard --region us-east1 --to-revisions=games-dashboard-00042-abc=100
```

Useful when a deploy ships a regression — flip back in seconds.

## Costs

For a personal/side-project dashboard with <1000 hits/month:
- **Cloud Run**: free tier covers it (2 million requests/month, 360k GB-seconds free).
- **Cloud Build**: 120 free build-minutes/day.
- **Artifact Registry**: ~$0.10/month for the image storage.

Realistic monthly bill: **$0 - $1**. The first time you'll see a meaningful bill is when you set `--min-instances 1` (~$3-5/mo) or get production traffic.
