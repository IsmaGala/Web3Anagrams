# NFT WORDCHAIN — Handoff Checkpoint

**Reference date:** 2026-05-12
**Owner:** isaavedra@gala.games

This file marks the agreed handoff moment for the WordChain project. The state
of `main` at this date is the baseline for the next round of changes; if
something drifted later and needs to be traced back, this commit/checkpoint is
the anchor.

## What's in place at handoff

- Five worlds defined in `src/data/worlds.ts` with per-world level files
  (`townstarLevels.ts`, `mirandusLevels.ts`, `galaswapLevels.ts`, etc.).
- Visual pass landed across all UI components (Fredoka One + Nunito typography,
  purple/violet palette for standard mode, amber/orange for daily mode,
  `btn-3d` styling, glow rings, slide-up/bounce overlay animations).
- Daily challenge selects today's hardest level by date seed, awards a flat GALA
  reward on win, and uses a 5-minute in-game timer.
- Hints are the only "spend GALA" sink, sold via `ShopModal`.
- Progress is persisted per-world in `progressStore` (zustand + localStorage).

## Active follow-ups picked up after handoff

1. Remove GALA reward from daily — daily wins now grant 5 hints instead.
2. Daily-quit confirmation popup. Forfeit unlocks retry for the same daily
   until the day's 24h window naturally rolls over.
3. Cap level word lists to `3 ≤ words ≤ 20`. Trim by keeping the highest-scoring
   20 (length-based, alphabetical tiebreaker).

## Why this matters

GALA has exactly one sink in this game — hints. Giving GALA away as a daily
reward leaks supply with no matching demand. From this point forward, daily
rewards stay inside the hint economy.

## Reference docs

- [`docs/wallet/WALLET_AUTH.md`](docs/wallet/WALLET_AUTH.md) — MetaMask + Gala
  Wallet auth, address formats, nonce-sign flow, EIP-191 vs EIP-712, 12 caveats.
  Source of truth for `src/utils/wallet.ts`.
- [`docs/wallet/gala-dex.md`](docs/wallet/gala-dex.md) — Gala DEX (swap.gala.com)
  integration. Pinned for the future economy phase (on-chain purchases,
  GALA/GUSDC swap). Not used in current code.
- [`docs/deploy/VERCEL.md`](docs/deploy/VERCEL.md) — Vercel hookup steps,
  smoke-test verification, what to add for v2 backend (Neon Postgres,
  auth endpoints, leaderboard queries).
