// Server-side mirror of src/utils/gameUtils.ts::currentWeekId(). Both the
// client and the server stamp scores with the same epoch-anchored week-id
// so the leaderboard week boundary is identical for everyone, timezone-free.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function currentWeekId(now: number = Date.now()): number {
  return Math.floor(now / WEEK_MS)
}
