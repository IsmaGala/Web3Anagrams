# Vercel Deployment

This project is set up to deploy on Vercel as a Vite SPA with serverless
functions under `api/`. Frontend and backend ship on the same domain so
there are no CORS concerns in production.

---

## What's already in the repo

| File | Purpose |
|---|---|
| `vercel.json`        | Framework + build/output hints (Vite, `dist/`). |
| `api/health.ts`      | Smoke-test function. Reachable at `/api/health`. |
| `.env.example`       | Template for env vars; copy to `.env` for local dev. |
| `.gitignore`         | Excludes `.vercel/`, `.env`, `.env.*` (keeps `.env.example`). |
| `package.json`       | Adds `@vercel/node` as a devDep for serverless type hints. |

Before the first deploy, run `npm install` once locally so `@vercel/node`
lands in `node_modules`. (Vercel will also install it on its own builders.)

---

## One-time hookup (Vercel dashboard)

1. Go to **https://vercel.com/new**.
2. Click **Import Git Repository** → pick `IsmaGala/Web3Anagrams`. If the
   repo doesn't show, click **Adjust GitHub App Permissions** and grant
   Vercel access to it.
3. **Configure Project** page:
   - Framework Preset → **Vite** (auto-detected from `vercel.json`).
   - Root Directory → leave default (`.`).
   - Build Command → leave the auto-filled `npm run build` (already in
     `vercel.json`).
   - Output Directory → `dist` (already in `vercel.json`).
4. **Environment Variables** — leave empty for the v1 deploy. We'll add
   `DATABASE_URL` and `JWT_SECRET` when v2 lands.
5. Click **Deploy**. First build takes ~60–90 seconds.

Once it's done you get two URLs:
- A production URL: `https://web3anagrams.vercel.app` (or similar).
- A unique deployment URL: `https://web3anagrams-abc123.vercel.app`.

---

## Verifying the deploy

### Frontend
Open the production URL in a browser. You should see the splash screen
with all four menu buttons, SFX, daily lockout, premium worlds, weekly
events — full functionality.

### Backend smoke test
Open `https://<your-deploy-url>/api/health` in a browser or run:
```bash
curl -s https://<your-deploy-url>/api/health | jq
```
Expected response:
```json
{
  "ok": true,
  "time": "2026-05-13T19:42:31.812Z",
  "env": "production"
}
```
If this works, the serverless side is wired and v2 can start landing
real endpoints in `api/auth/` and `api/leaderboard/`.

---

## Automatic deploys

Once the GitHub integration is in place:
- **Every push to `main`** → triggers a production deploy.
- **Every push to any other branch** → triggers a unique preview deploy
  on its own URL. Perfect for sharing WIP without touching production.
- **Every pull request** → Vercel auto-comments the preview URL.

No CI configuration on your side — Vercel handles all of it.

---

## Local development with serverless

When v2 lands and we have real `api/` routes, you'll want to run both
halves locally instead of pushing to a preview branch every time.

```bash
# One-time:
npm install -g vercel

# In the project root:
vercel dev   # spins up Vite + the api/ functions on http://localhost:3000
```

`vercel dev` reads `.env` (which you'd copy from `.env.example`) so you
can run with a real local Postgres URL.

---

## Cost ceiling (Pro plan, $20/mo)

- **Bandwidth:** 1 TB/month included. Anything past that is $0.40/GB.
- **Function invocations:** 1M/month included. $0.60 per 1M after.
- **Function execution time:** 1,000 GB-hours/month included.
- **Build minutes:** 6,000 minutes/month — Vite builds take ~1 min each,
  so this lasts thousands of pushes.

For a launch-stage word game, all of these are effectively unlimited.

---

## Next steps after the hookup is verified

When you're ready for v2:

1. **Provision Neon Postgres** at [neon.tech](https://neon.tech). Free tier
   gives 0.5 GB storage + 1 compute hour/day. Copy the connection string.
2. **Vercel → Project Settings → Environment Variables** — add:
   - `DATABASE_URL` (from Neon, sensitive)
   - `JWT_SECRET` (generate with `openssl rand -base64 48`, sensitive)
3. Build `api/auth/nonce.ts` and `api/auth/verify.ts` per
   `docs/wallet/WALLET_AUTH.md` §5.
4. Build `api/leaderboard/[event].ts` for ranked queries.
5. Replace the placeholder branch in `WeeklyEvents.tsx::LeaderboardPanel`
   with real fetches.

See `docs/wallet/WALLET_AUTH.md` for the auth-side spec.
