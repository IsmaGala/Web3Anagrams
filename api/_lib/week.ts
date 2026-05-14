// Server-side mirror of src/utils/gameUtils.ts::currentWeekId(). Both the
// client and the server stamp scores with the same epoch-anchored week-id
// so the leaderboard week boundary is identical for everyone, timezone-free.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function currentWeekId(now: number = Date.now()): number {
  return Math.floor(now / WEEK_MS)
}

// ── Event phase (matches client gameUtils.ts::eventPhase) ───────────────────
// Defines whether the *current* weekly event is mid-competition (ACTIVE) or
// in the post-competition claim window (SETTLED). The window edges are PST
// wall-clock so the player's "Mon 4pm" intuition holds regardless of when
// the server happens to run.
//
//   ACTIVE   Mon 16:00 PST → Sun 00:00 PST   (≈ 5d 8h of play)
//   SETTLED  Sun 00:00 PST → next Mon 16:00 PST  (≈ 40h to claim)
//
// We use Intl.DateTimeFormat with America/Los_Angeles so PST↔PDT transitions
// are handled automatically — re-implementing DST manually is a perennial
// source of bugs and there's no good reason to.

export type EventPhase = 'active' | 'settled'

function pstDayHour(d: Date): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const hour    = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { day: dayMap[weekday] ?? 0, hour }
}

export function eventPhase(now: Date = new Date()): EventPhase {
  const { day, hour } = pstDayHour(now)
  if (day === 0) return 'settled'              // Sunday — claim window open
  if (day === 1 && hour < 16) return 'settled' // Mon before 4pm — still claim window
  return 'active'
}
