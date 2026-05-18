# DASHBOARD.md

How the React dashboard UI is organized, and how to extend it for your own game.

## Single-file architecture

The entire dashboard is one file: `src/App.tsx` (~66 KB). One component, multiple sections.

This sounds wrong but it's deliberate:
- Dashboards are mostly *layout + fetches + charts*. There's little reusable behavior.
- Splitting into files adds prop-drilling without buying you anything.
- One file is easy to grep through and Cmd+F.

When the file approaches ~3000 lines, *then* split by game (one file per tab/game).

## Layout structure

```
App
| Header (title, refresh button, last-updated timestamp)
| Tab bar (WaW3 | ProfitPlay | Siege City | Monitoring)
| Tab content (switched by useState<'waw3' | 'profitplay' | ...>)
   | KPI cards row (4-6 metric tiles)
   | Time-series chart (AreaChart, full width)
   | Two-column row (BarChart + PieChart)
   | Tables (top countries, top spenders, recent activity)
```

## Data fetching pattern

```ts
const [data, setData] = useState<Data | null>(null);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  fetch('/api/waw3/players/overview', { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
    .catch(e => setError(String(e)))
    .finally(() => clearTimeout(timeout));

  return () => { clearTimeout(timeout); controller.abort(); };
}, []);
```

Key points:
- **8-second timeout** via `AbortController` — Cloud Run cold starts can take a second, but anything longer is a sign the upstream is down. Show an error instead of a hung spinner.
- **Cleanup** on unmount so abandoned fetches don't update unmounted state.
- All fetches go to `/api/<game>/*` — relative path, never absolute. The Express proxy handles the upstream URL.

## KPI card component

The one reusable component is a metric tile:

```tsx
function KPICard({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta != null && (
        <div className={`kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '^' : 'v'} {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
```

Drop 4-6 of these in a flex row at the top of each tab. They're the first thing someone sees.

## Recharts patterns

Always wrap charts in `<ResponsiveContainer>` so they fill the available width:

```tsx
<ResponsiveContainer width="100%" height={320}>
  <AreaChart data={series}>
    <XAxis dataKey="date" />
    <YAxis />
    <CartesianGrid strokeDasharray="3 3" />
    <Tooltip />
    <Area dataKey="players" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
  </AreaChart>
</ResponsiveContainer>
```

Common charts used:
- **AreaChart** — daily players / games / revenue over the last 30 days
- **BarChart** — discrete bucketed counts (games per day, purchases per country)
- **PieChart** — share/distribution (country win share, item type breakdown)

Use a fixed 6-color palette so charts feel coherent across tabs.

## Rendering tokens and NFTs

Two things to get right when the dashboard surfaces a user's token/NFT inventory:

1. **Fan out across all GalaChain channels before rendering.** The `asset` channel only holds `$GALA` and global items — game items, land, and game-currency balances live in per-game channels (`mirandus`, `spider-tanks`, `town-star`, `championsarena`, `dragonstrike`, `film`, `music`, etc.). If a user reports "my NFTs are missing", the backend is almost certainly only querying `asset`. See DATA-PIPELINE.md "Multi-channel balance fan-out" for the `Promise.all` pattern and the channel list.

2. **Always render *something* for unknown tokens.** Maintain a hardcoded image map for the well-known collections, and fall back to a deterministic gradient (e.g. two colors derived from `keccak256(collection + category + type)`) for everything else. A broken-image icon makes the dashboard look broken; a colored tile with the token name on it looks intentional.

## Refresh behavior

The dashboard fetches on mount only. Refresh is **manual** (a button that re-fetches).

**Why not auto-refresh?** Polling looks "live" but burns bandwidth and confuses users when numbers move while they're reading. If you want auto-refresh, gate it behind a toggle.

## TypeScript discipline

Strict mode is **on**. Every fetch result is typed:

```ts
type WaW3Overview = {
  dau: number;
  totalPlayers: number;
  totalGames: number;
  totalRevenue: number;
  winRate: number;
};

const data: WaW3Overview = await (await fetch('/api/waw3/players/overview')).json();
```

Don't trust the upstream API shape — types are documentation. Update the types when the API changes; the compiler will tell you what UI broke.
