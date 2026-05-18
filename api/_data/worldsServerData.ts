// Server-only world index. Maps worldId → its level list.
//
// Mirrors src/data/worldData.ts but carries ONLY the data fields the server
// needs (id + levels). Presentation fields (name, icon, color, gradient) stay
// on the client because they don't need to be hidden from cheaters and they're
// already in the public bundle.
//
// Keep this in sync with src/data/worlds.ts when adding new worlds. The
// `WorldId` union here is duplicated rather than imported so this module has
// zero client-tree dependencies (Vercel functions shouldn't reach into src/).

import { LEVELS as VALUTCHAIN_LEVELS } from './levels/levels.js'
import { TOWNSTAR_LEVELS }             from './levels/townstarLevels.js'
import { MIRANDUS_LEVELS }             from './levels/mirandusLevels.js'
import { GALASWAP_LEVELS }             from './levels/galaswapLevels.js'
import { ETERNALNIGHT_LEVELS }         from './levels/eternalnightLevels.js'
import { AREA51_LEVELS }               from './levels/area51Levels.js'
import { AREA515_LEVELS }              from './levels/area515Levels.js'
import { FLAGS_LEVELS }                from './levels/flagsLevels.js'
import { ASIMOV_LEVELS }               from './levels/asimovLevels.js'
import { NATURE_LEVELS }               from './levels/natureLevels.js'
import { OCEAN_EVENT_LEVELS }          from './levels/oceanEventLevels.js'
import { BLOOD_DONOR_LEVELS }          from './levels/bloodDonorLevels.js'
import type { Level } from './types.js'

export type WorldId =
  | 'townstar' | 'mirandus' | 'galaswap' | 'eternalnight'
  | 'area51'   | 'asimov'   | 'nature'
  | 'oceanevent' | 'blooddonor' | 'area515' | 'flags'

export const WORLD_LEVELS: Record<WorldId, Level[]> = {
  townstar:     TOWNSTAR_LEVELS,
  mirandus:     MIRANDUS_LEVELS,
  galaswap:     GALASWAP_LEVELS,
  eternalnight: ETERNALNIGHT_LEVELS,
  area51:       AREA51_LEVELS,
  asimov:       ASIMOV_LEVELS,
  nature:       NATURE_LEVELS,
  oceanevent:   OCEAN_EVENT_LEVELS,
  blooddonor:   BLOOD_DONOR_LEVELS,
  area515:      AREA515_LEVELS,
  flags:        FLAGS_LEVELS,
}

// One-time gem bounty granted when the player completes every level in the
// world for the first time. Keep in sync with `completionReward` in
// src/data/worldData.ts on the client (server is authoritative for the
// actual grant, but the client uses its copy to display the reward amount
// on the WorldRewardOverlay).
//
// Premium and event worlds don't have a completion bounty (the player
// already paid Gems to enter), so they're omitted here.
export const WORLD_COMPLETION_REWARDS: Partial<Record<WorldId, number>> = {
  townstar:     150,
  mirandus:     200,
  galaswap:     200,
  eternalnight: 200,
}

// Daily-win reward — hints granted when the player clears the daily mode.
// Mirrors `DAILY_HINT_REWARD` in src/utils/gameUtils.ts.
export const DAILY_WIN_HINT_REWARD = 10

// First-wallet welcome bundle — one-time bonus when a wallet connects for
// the first time. Mirrors the client-side hard-coded values in App.tsx.
export const FIRST_WALLET_BONUS = { gems: 15, hints: 5 }

// Reserved for the legacy fallback set (the original non-world-scoped
// levels.ts that fed the daily before worlds existed). Not currently routed
// through a worldId but kept exported so future endpoints (e.g. a "classic
// daily" mode) can pull from it without recopying the data.
export const LEGACY_LEVELS: Level[] = VALUTCHAIN_LEVELS

export function getWorldLevels(worldId: string): Level[] | null {
  if (!(worldId in WORLD_LEVELS)) return null
  return WORLD_LEVELS[worldId as WorldId]
}

export function getLevel(worldId: string, levelIndex: number): Level | null {
  const levels = getWorldLevels(worldId)
  if (!levels) return null
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= levels.length) return null
  return levels[levelIndex]
}
