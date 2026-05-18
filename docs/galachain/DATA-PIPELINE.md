# DATA-PIPELINE.md

How data flows from your game's backend into the dashboard.

## The shape of the pipeline

```
Browser
  | fetch('/api/waw3/players/overview')         (same-origin, no CORS)
  v
Express server (server.mjs, running in Cloud Run container)
  | http-proxy-middleware forwards to upstream
  v
https://worldatwar3.com/api/players/overview     (your game's real API)
```

All three of these run in the same Cloud Run service:
- Static React assets at `/dashboard/`
- The proxy at `/api/<game>/*`
- The health endpoint at `/health`

## Why proxy at all?

Two big reasons:

1. **CORS goes away.** The browser only talks to `same-origin /api/...`. It never sees `worldatwar3.com` directly, so no preflights and no CORS headers to configure.
2. **Secrets stay server-side.** If your game's API needs an `Authorization: Bearer ...` header, you add it in `server.mjs`. The browser never sees the token.

Bonus: rate-limiting, caching, and retries all become easy if you ever need them — they sit on the Express layer.

## Adding a new game

In `server.mjs`:

```js
import { createProxyMiddleware } from 'http-proxy-middleware';

app.use('/api/mygame', createProxyMiddleware({
  target: 'https://api.mygame.com',
  changeOrigin: true,
  pathRewrite: { '^/api/mygame': '/api' },  // or whatever your upstream expects
}));
```

In the React app:

```ts
fetch('/api/mygame/stats/daily').then(r => r.json())
```

That's it. Redeploy.

## Recommended starter API surface for a new game

| Endpoint | Returns |
|---|---|
| `/players/overview` | One JSON blob with all the headline KPIs the dashboard shows in tiles |
| `/stats/daily?days=30` | An array of `{date, ...metrics}` for time-series charts |
| `/leaderboards/<dimension>` | An array of `{name, value}` for tables |
| `/activity/<event>` | A reverse-chrono array of recent events |

Pre-aggregating into one "overview" endpoint per tab is the single biggest perf win. A dashboard that does ten fetches per tab is slow; one that does one is instant.

## Multi-channel balance fan-out (NFTs and game tokens)

GalaChain stores tokens in **per-game channel ledgers**, not in a single global ledger. Querying only the `asset` channel will return `$GALA` and the global item collection — but every game item, NFT, and game-currency balance the user owns will be invisible. This is the second-most-common "everything looks empty" bug after the address-format issue.

A unified balance/NFT view requires fanning out across every channel in parallel and flattening the results.

### Known channels

| Channel | Holds |
|---|---|
| `asset` | `$GALA`, global items, cross-game collectibles |
| `gala` | Native GALA payment ledger |
| `mirandus` | Mirandus land, items, currency |
| `spider-tanks` | Spider Tanks tanks, parts, currency |
| `town-star` | Town Star crops, buildings, currency |
| `championsarena` | Champions Arena heroes, gear |
| `dragonstrike` | Dragonstrike units, gear |
| `film` | Gala Film NFTs |
| `music` | Gala Music NFTs |

New games and channels are added over time — keep this list in a config constant, not hardcoded across the codebase, so you can add one in a single place.

### Fan-out pattern

```ts
const CHANNELS = [
  'asset', 'gala', 'mirandus', 'spider-tanks', 'town-star',
  'championsarena', 'dragonstrike', 'film', 'music',
] as const;

async function fetchAllBalances(galaAddress: string) {
  const results = await Promise.all(
    CHANNELS.map(async (ch) => {
      try {
        const r = await fetch(
          `${GALACHAIN_GATEWAY}/api/${ch}/token-contract/FetchBalances`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner: galaAddress }),
          },
        );
        if (!r.ok) return { channel: ch, balances: [] as Balance[] };
        const json = await r.json();
        return { channel: ch, balances: (json.Data ?? []) as Balance[] };
      } catch {
        return { channel: ch, balances: [] as Balance[] };
      }
    }),
  );

  // Flatten into a single list, tagging each balance with its source channel.
  return results.flatMap(({ channel, balances }) =>
    balances.map((b) => ({ ...b, channel })),
  );
}
```

Rules that matter:

- **Always `Promise.all`.** Sequential per-channel fetches make the dashboard feel broken — 9 channels x 200ms each is two seconds of staring at a spinner. Parallel runs in ~250ms.
- **Per-channel try/catch.** A single channel returning 5xx (e.g. a game backend in maintenance) must not zero out the whole portfolio. Treat per-channel failures as "no balances on that channel" and surface a soft warning if you want to be precise.
- **Tag every balance with its source `channel`.** You will need this for routing transfers (a Mirandus item can only be transferred via the `mirandus/token-contract`), and for the UI to group items by game.
- **Cache the union, not the parts.** Cache key is the address; value is the flattened list. A 30-60s in-memory TTL on the proxy is usually plenty and shields the gateway from refresh-spam.

### Token image fallback

Most game tokens have no canonical image URL on chain. The dashboard should ship with a hardcoded image map for the well-known collections, then fall back to a deterministic gradient generated from `keccak256(collection + category + type)` so unknown tokens still render as distinct tiles instead of broken-image icons.

## Failure modes

| Symptom | Probable cause | Fix |
|---|---|---|
| 502 from `/api/...` | Upstream is down or slow | Check upstream service directly. Add a try/catch with a friendly message in the proxy. |
| CORS error in browser | You bypassed the proxy and hit upstream directly | Re-route through `/api/<game>/...` |
| Numbers stale on dashboard | Browser cached the response | Add `Cache-Control: no-store` on the proxy responses, or query-bust with `?_=${Date.now()}` |
| Hang on first load | Cloud Run cold start | Set `min-instances=1` (costs ~$3-5/mo) or accept the 1-2s cold start |
