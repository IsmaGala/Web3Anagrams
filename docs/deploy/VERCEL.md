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

---

# V2 — Backend hookup (Neon Postgres + auth + leaderboard)

This section walks through wiring the real backend after the v1 SPA-only
deploy is already live. All paths assume you've already done the steps above
and `/api/health` returns 200.

## 1. Install new server deps locally

`package.json` already has `ethers`, `jose`, and `@neondatabase/serverless`
declared. Install them on your machine so the next push includes the
lockfile entries:

```powershell
cd C:\Users\Isuma\Repositories\WordChain\nft-wordchain
npm install
```

Vercel will install the same deps automatically on every deploy.

## 2. Provision Neon Postgres (free tier)

1. Go to **https://console.neon.tech/signup** and create an account (use
   the same email as your Vercel account for cleanliness).
2. Click **Create project**. Settings:
   - Project name: `wordchain` (or anything).
   - Postgres version: latest stable.
   - Region: same continent as your Vercel deployment for low latency.
3. After creation, the dashboard shows a connection string under the
   **Connection Details** panel. It looks like:
   ```
   postgresql://wordchain_owner:************@ep-xxx-yyy.us-east-1.aws.neon.tech/wordchain?sslmode=require
   ```
4. Copy that string. This is your `DATABASE_URL`.

## 3. Run the migration

In the Neon dashboard, click **SQL Editor** (left sidebar). Paste the
contents of `migrations/0001_init.sql` from this repo and click **Run**.
The editor returns "Query executed successfully" for each `CREATE TABLE`.

Verify with:
```sql
SELECT count(*) FROM nonces;
SELECT count(*) FROM scores;
SELECT count(*) FROM profiles;
```
All three should return 0.

## 4. Set Vercel environment variables

In Vercel → Project → **Settings → Environment Variables**, add three
entries (mark them all sensitive):

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the Neon connection string from step 2 | All environments |
| `JWT_SECRET` | generate with `openssl rand -base64 48` | All environments |
| `JWT_TTL_SECONDS` | `86400` | All environments (optional; defaults to 86400) |

Click **Save** for each. Vercel rebuilds aren't needed for env-var changes
— the next request to a function will pick them up — but a **redeploy**
the next time you push will guarantee a clean state.

> **No openssl on your machine?** Generate the secret with PowerShell:
> ```powershell
> -join ((1..64) | %{ [char][int]((48..57) + (97..122) + (65..90) | Get-Random) })
> ```

## 5. Push and verify all endpoints

```powershell
git add .
git commit -m "V2: backend hookup — auth endpoints + leaderboard + JWT login"
git push
```

Wait ~90 seconds for the deploy. Then test each endpoint from PowerShell:

```powershell
$base = "https://<your-deploy-url>"

# Smoke test (no auth, no DB) — should still work
curl "$base/api/health"

# Issue a nonce — server should respond with a UUID-tagged string
curl -X POST -H "Content-Type: application/json" `
  -d '{"address":"0x0000000000000000000000000000000000000000"}' `
  "$base/api/auth/nonce"

# Empty leaderboard — should return { event, week, top: [], you: null }
curl "$base/api/leaderboard/oceanevent"
```

If all three respond cleanly, the backend pipeline is live.

## 6. Real login from the browser

1. Open the deployed splash, click **CONNECT WALLET**, pick MetaMask.
2. The extension prompts you twice:
   - First prompt: "share account with site" → approve.
   - Second prompt: "sign message" → approve. The message is the server
     nonce (`wordchain-login: <uuid>`).
3. The pill on the splash should now show your address.
4. Go into the Deep Sea event (unlock for 5 GALA if needed), open the
   leaderboard. You should see the empty top-N message and a "you're
   signed in" state instead of the connect-wallet nudge.
5. Complete a level. The auto-submit fires `POST /api/leaderboard/score`
   in the background. Reopen the leaderboard — your row should now be
   there as rank #1.

If anything misbehaves, check the function logs in Vercel → Project →
**Logs** (filtered to the relevant endpoint).

## Common gotchas

- **CORS errors locally** — `vercel dev` and Vite together: set
  `ALLOWED_ORIGINS` env var to `http://localhost:5173,http://localhost:3000`
  in `.env`. Production doesn't need it (same origin).
- **`DATABASE_URL is not set` 500** — env var not added to the right
  environment in Vercel (Preview vs Production). Add it to all three.
- **`Nonce expired`** — the 5-minute TTL elapsed. Reconnect the wallet
  to trigger a fresh nonce.
- **`Signature does not match…`** — usually a wallet that returned
  `eth|...` and we forgot to strip the prefix. The client's
  `signMessage()` handles this — if you see it, file a bug.
