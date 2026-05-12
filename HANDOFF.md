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
