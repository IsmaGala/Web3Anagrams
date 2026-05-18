# STACK.md

The tech stack behind the games analytics dashboard.

## Overview

A **single-container Node app** that serves both:
- A static React SPA (the dashboard UI)
- A small Express server that proxies API calls to your game's backend(s) so the browser doesn't hit CORS or expose secrets

Deployed as a Docker image to Google Cloud Run. One service, one URL, one billing line.

## Frontend

| Library | Version | Purpose |
|---|---|---|
| **React** | 19.2 | UI |
| **TypeScript** | 6.0 | Type safety |
| **Vite** | 8.0 | Dev server + production bundler |
| **Recharts** | 3.8 | Charts (Area, Bar, Pie, etc. — declarative, composable, React-native) |
| **@vitejs/plugin-react** | 6.0 | React fast-refresh during dev |
| **eslint** + react-hooks plugin | 9.39 | Lint |

No Redux, no React Router, no UI framework. The dashboard is a single `App.tsx` with `useState` + `useEffect`. Charts ship straight from Recharts — no wrappers.

**Why this minimal:** dashboards are read-heavy and short-lived per session. The complexity budget should go into data wrangling and chart configuration, not state management.

## Backend (the proxy)

| Library | Version | Purpose |
|---|---|---|
| **Node** | 22-slim | Runtime |
| **Express** | 4.21 | HTTP server |
| **http-proxy-middleware** | 3.0 | Forward `/api/*` requests to upstream game APIs |

The server is ~80 lines of code (`server.mjs`). It does three things:

1. Serves the built React app at `/dashboard/`
2. Proxies `/api/<game>/*` to each upstream game's real API
3. Exposes a `/health` endpoint for Cloud Run liveness checks

## Build & deploy

| Tool | Use |
|---|---|
| **Docker** | Multi-stage build (Node 22-slim). Final image only contains `dist/` + `server.mjs` + `node_modules`. |
| **Google Cloud Run** | Hosting. Free tier covers most personal-project traffic. Auto-scales to zero. |
| **Cloud Build** *(or `gcloud run deploy --source .`)* | Deploys from source — no manual image push needed. |

## What's deliberately NOT in the stack

- **No database.** All data is fetched live from the game's own API on every dashboard load. If you need historical aggregates beyond what your game stores, add a periodic ETL job and a SQL store later.
- **No auth.** The dashboard is public-readable. If you need gated views, wrap the Cloud Run service with Identity-Aware Proxy or add a simple auth middleware in `server.mjs`.
- **No SSR/Next.js.** This is a static SPA. Vite gives us instant local dev and fast prod builds.
- **No design system.** Plain CSS in `App.css`.
- **No tests.** Dashboards iterate fast; tests calcify the UI. We rely on visual review and TypeScript instead.

## When to consider a different stack

- **You have a multi-page dashboard with auth roles** -> Next.js + NextAuth, or a SaaS like Vercel + Supabase.
- **You need real-time streaming charts** -> Replace polling with Server-Sent Events or WebSockets.
- **You need to embed in another app** -> Iframe the Cloud Run URL, or ship the dashboard as a npm package.
- **You're an enterprise team** -> Look at Grafana, Looker, or Metabase.
