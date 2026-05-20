import type { Level } from '../types'

// Bundle-strip milestone — answer keys live server-side at
// api/_data/levels/dailyLevels.ts. See src/data/levels.ts for the full
// rationale comment.
//
// Daily challenges run in server-authoritative mode (the only path the
// production bundle takes), so the client never needs the real word
// lists — only the COUNT of levels in the pool, used by the client picker
// (see getDailyLevelIndex in src/utils/gameUtils.ts) to map today's date
// to a stable index within the pool.

const PLACEHOLDER: Level = {} as Level

/** Size of the daily-challenge pool. MUST match DAILY_LEVELS.length in
 *  api/_data/levels/dailyLevels.ts — the server resolves
 *  (worldId='daily', levelIndex) against that same array. */
export const DAILY_POOL_SIZE = 30

export const DAILY_LEVELS: Level[] = Array.from({ length: DAILY_POOL_SIZE }, () => PLACEHOLDER)
