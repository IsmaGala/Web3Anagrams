// Server-side mirror of src/utils/gameUtils.ts. Both client and server need
// to agree on currentWeekId — score submissions go through the server and
// land in a row keyed by (address, event_id, week_id). If the two halves
// disagreed by even a minute around the boundary, the same competition would
// be split across two leaderboard partitions.
//
// Week IDs anchor to Monday 16:00 America/Los_Angeles. The anchor is
// implemented by repacking the PST wall-clock into a UTC timestamp and
// flooring against a fixed epoch (the first Monday-at-or-after Jan 1, 1970,
// treated as PST). DST is handled by re-deriving every component via
// Intl.DateTimeFormat — no manual offset math.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Mon Jan 5, 1970 16:00 (PST wall-clock treated as UTC). weekId 0 == the
// first event week of the Unix epoch.
const EVENT_WEEK_ANCHOR_PST_MS = Date.UTC(1970, 0, 5, 16, 0, 0)

/** Repacks `d`'s PST wall-clock components into a UTC timestamp. The result
 *  is NOT a real UTC moment — it's "this same wall-clock, as if PST were
 *  UTC" — and is useful only for week-id arithmetic. */
function pstAsUtcMs(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value, 10)
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
}

/** Integer week id for the supplied instant (defaults to "now"). Matches
 *  the client's currentWeekId in src/utils/gameUtils.ts. */
export function currentWeekId(now: Date | number = new Date()): number {
  const d = typeof now === 'number' ? new Date(now) : now
  return Math.floor((pstAsUtcMs(d) - EVENT_WEEK_ANCHOR_PST_MS) / WEEK_MS)
}

// ── Weekly event PHASE ─────────────────────────────────────────────────────
//   ACTIVE   — Mon 16:00 PST → Sun 00:00 PST  (≈ 5d 8h of play)
//   SETTLED  — Sun 00:00 PST → next Mon 16:00 PST  (≈ 40h to claim)

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
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return { day: dayMap[weekday] ?? 0, hour }
}

/** Current event phase based on America/Los_Angeles wall-clock. */
export function eventPhase(now: Date = new Date()): EventPhase {
  const { day, hour } = pstDayHour(now)
  if (day === 0) return 'settled'              // Sunday — claim window open
  if (day === 1 && hour < 16) return 'settled' // Mon before 4pm — still claim window
  return 'active'
}
