// Server-side mirror of src/utils/gameUtils.ts. Both client and server need
// to agree on currentWeekId — score submissions go through the server and
// land in a row keyed by (address, event_id, week_id). If the two halves
// disagreed by even a minute around the boundary, the same competition would
// be split across two leaderboard partitions.
//
// Week IDs anchor to Mon 16:00 PST (event start). See gameUtils.ts for the
// detailed comment.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Mon Jan 5, 1970 16:00 (treating PST wall-clock as UTC). Matches client.
const EVENT_WEEK_ANCHOR_PST_MS = Date.UTC(1970, 0, 5, 16, 0, 0)

function pstAsUtcMs(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value, 10)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

export function currentWeekId(now: Date | number = new Date()): number {
  const d = typeof now === 'number' ? new Date(now) : now
  return Math.floor((pstAsUtcMs(d) - EVENT_WEEK_ANCHOR_PST_MS) / WEEK_MS)
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
