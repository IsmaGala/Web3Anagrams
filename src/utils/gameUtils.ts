import type { Level, ScoreBreakdown } from '../types'

// ── Word Count Bounds ─────────────────────────────────────────────────────────

/** Hard caps on how many primary words a level can ask the player to find.
 *  Below MIN_WORDS the level is too thin; above MAX_WORDS the WordGrid grows
 *  taller than the wheel can comfortably sit alongside, forcing the player to
 *  scroll between the wheel and the word list. */
export const MIN_WORDS_PER_LEVEL = 3
export const MAX_WORDS_PER_LEVEL = 20

// ── Word Validation ───────────────────────────────────────────────────────────

/** Returns true if `word` can be spelled using the letters in `pool` (respects duplicates) */
export function canMakeWord(word: string, pool: string[]): boolean {
  const remaining = [...pool]
  for (const ch of word) {
    const idx = remaining.indexOf(ch)
    if (idx === -1) return false
    remaining.splice(idx, 1)
  }
  return true
}

/** Pick the top N words by length (desc), with alphabetical tiebreaker.
 *  Stable across reloads — same input always produces the same output.
 *  If `protect` is supplied and is a member of `words`, it is force-included
 *  in the result (typically used to keep the level's theme word). */
export function topScoringWords(words: string[], n: number, protect?: string): string[] {
  const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const top    = sorted.slice(0, n)
  if (protect && words.includes(protect) && !top.includes(protect)) {
    top[top.length - 1] = protect
  }
  return top
}

/** Filter and validate all words in a level against its letter pool, then
 *  enforce the MAX_WORDS_PER_LEVEL cap (keeping highest-scoring words, with
 *  the theme word always preserved). Levels under MIN_WORDS_PER_LEVEL are
 *  logged so designers can spot and fix them. */
export function validateLevel(level: Level): Level {
  let words   = level.words.filter(w => canMakeWord(w, level.letters))
  const bonus = level.bonus.filter(w => canMakeWord(w, level.letters))
  const invalid = [...level.words, ...level.bonus].filter(w => !canMakeWord(w, level.letters))
  if (invalid.length) console.warn(`[${level.theme}] invalid words removed:`, invalid)

  if (words.length > MAX_WORDS_PER_LEVEL) {
    const before = words.length
    words = topScoringWords(words, MAX_WORDS_PER_LEVEL, level.theme)
    console.info(`[${level.theme}] capped from ${before} → ${MAX_WORDS_PER_LEVEL} words (kept highest-scoring, theme preserved)`)
  }

  if (words.length < MIN_WORDS_PER_LEVEL) {
    console.warn(`[${level.theme}] only ${words.length} valid words — below MIN_WORDS_PER_LEVEL (${MIN_WORDS_PER_LEVEL}). Designer should expand the word list.`)
  }

  return { ...level, words, bonus }
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

/** Mulberry32 — fast, seedable PRNG, no external deps */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates shuffle with a seeded RNG */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Sort levels by difficulty then shuffle within three tiers:
 *   Easy   difficulty < 6
 *   Medium difficulty 6–9
 *   Hard   difficulty > 9
 * This preserves a ramp while randomising within each tier.
 */
export function arrangeLevels(levels: Level[], seed: number): Level[] {
  const sorted = [...levels].sort((a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0))
  const easy   = sorted.filter(l => (l.difficulty ?? 0) < 6)
  const medium = sorted.filter(l => (l.difficulty ?? 0) >= 6 && (l.difficulty ?? 0) < 9)
  const hard   = sorted.filter(l => (l.difficulty ?? 0) >= 9)
  return [
    ...seededShuffle(easy,   seed),
    ...seededShuffle(medium, seed + 1),
    ...seededShuffle(hard,   seed + 2),
  ]
}

// ── Seed Helpers ──────────────────────────────────────────────────────────────

/** Read ?seed= from URL or generate a random session seed */
export function getSessionSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed')
  if (param) return parseInt(param, 10)
  return Math.floor(Math.random() * 0xFFFFFF)
}

/** Derive a deterministic daily seed from today's date (same for all players) */
export function getDailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** Pick the hardest level for today's daily challenge */
export function pickDailyLevel(levels: Level[]): Level {
  const seed     = getDailySeed()
  const hardPool = [...levels]
    .sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0))
    .slice(0, 5)
  return hardPool[seed % hardPool.length]
}

// ── Wheel Geometry ────────────────────────────────────────────────────────────

export const WHEEL_CX = 120
export const WHEEL_CY = 120
export const WHEEL_R  = 85

export function letterPosition(index: number, total: number): { x: number; y: number } {
  const angle = (2 * Math.PI * index / total) - Math.PI / 2
  return {
    x: WHEEL_CX + WHEEL_R * Math.cos(angle),
    y: WHEEL_CY + WHEEL_R * Math.sin(angle),
  }
}

// ── Score helpers ─────────────────────────────────────────────────────────────

export function wordScore(word: string, isBonus = false): number {
  return word.length * (isBonus ? 15 : 10)
}

export function wordFeedback(word: string): string {
  if (word.length >= 5) return '🔥 DEGEN MOVE!'
  if (word.length >= 4) return '⬡ VERIFIED!'
  return '✓ MINTED!'
}

// ── Score breakdown (granularity for leaderboard) ─────────────────────────────
//
// The final score for a run isn't just sum-of-word-scores anymore. We mix in
// three additional signals so two players with the same word list can still
// be ranked apart on the leaderboard:
//   • misses          — failed submissions cost a flat fee per attempt
//   • hints used      — letter reveals cost a heavier fee (they leak info)
//   • completion time — a positive bonus for finishing under target time;
//                        slow runs simply get no bonus (no time penalty)
//
// Tune these four constants to shift difficulty / leaderboard sensitivity.

export const MISS_PENALTY          = 5    // points lost per invalid submission
export const HINT_PENALTY          = 25   // points lost per hint deployed
export const TARGET_TIME_SECONDS   = 120  // "fast" reference time (2 minutes)
export const TIME_BONUS_PER_SEC    = 2    // points per second under target

export function computeScoreBreakdown(
  base: number,
  misses: number,
  hintsUsed: number,
  levelStartTime: number,
  now: number = Date.now(),
): ScoreBreakdown {
  const elapsedSec    = Math.max(0, Math.round((now - levelStartTime) / 1000))
  const missesPenalty = misses    * MISS_PENALTY
  const hintsPenalty  = hintsUsed * HINT_PENALTY
  const timeBonus     = Math.max(0, Math.round((TARGET_TIME_SECONDS - elapsedSec) * TIME_BONUS_PER_SEC))
  const final         = Math.max(0, base - missesPenalty - hintsPenalty + timeBonus)
  return { base, misses, missesPenalty, hintsUsed, hintsPenalty, elapsedSec, timeBonus, final }
}

// ── Streak helpers ────────────────────────────────────────────────────────────

const STREAK_KEY    = 'wc_streak'
const LAST_KEY      = 'wc_last_daily'

export function updateStreak(): number {
  const today     = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const last      = localStorage.getItem(LAST_KEY)
  let streak      = parseInt(localStorage.getItem(STREAK_KEY) ?? '0')

  if (last === yesterday) streak++
  else if (last !== today) streak = 1

  localStorage.setItem(STREAK_KEY, String(streak))
  localStorage.setItem(LAST_KEY, today)
  return streak
}

export function getStreak(): number {
  return parseInt(localStorage.getItem(STREAK_KEY) ?? '0')
}

// ── Daily timer ───────────────────────────────────────────────────────────────

export const DAILY_DURATION     = 5 * 60   // seconds (5 minutes)
export const DAILY_WORDS_TARGET = 8        // total words to find in a daily run
/** Hints granted on a daily win. Exported (not just stored in gameStore)
 *  so the DailyWinOverlay reward badge reads the same number, keeping the
 *  on-screen value and the actual credit guaranteed in sync. */
export const DAILY_HINT_REWARD  = 10

// Curate the daily word list so the player gets a mix of long / mid / short
// rather than a single tier. We stratify the validated word pool into three
// buckets and pick a fixed number from each, always preserving the theme
// word (typically the longest). When the pool has fewer than `target`
// words we just return the whole thing.
//
// Distribution math is the SAME ratio formula at any target:
//   long  = ceil(target * 0.30)
//   short = ceil(target * 0.30)
//   mid   = target - long - short
//
// Concrete distributions:
//   target=13 → 4 long · 5 mid · 4 short
//   target=8  → 3 long · 2 mid · 3 short
//
// "Long" / "short" mean positional buckets after sorting by length desc and
// alphabetical tiebreaker — not absolute character counts — so this works
// across levels with very different theme lengths.

export function pickDailyWordMix(words: string[], theme: string, target: number = DAILY_WORDS_TARGET): string[] {
  if (words.length <= target) return [...words]

  const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b))

  const longCount  = Math.ceil(target * 0.30)
  const shortCount = Math.ceil(target * 0.30)
  const midCount   = target - longCount - shortCount

  const long      = sorted.slice(0, longCount)
  const shortPool = sorted.slice(-shortCount)
  const midPool   = sorted.slice(longCount, sorted.length - shortCount)

  // Spread the mid picks evenly across the middle bucket so we capture a
  // range of lengths rather than clumping at one end.
  const mid: string[] = []
  if (midPool.length > 0) {
    const step = midPool.length / midCount
    for (let i = 0; i < midCount; i++) mid.push(midPool[Math.min(Math.floor(i * step), midPool.length - 1)])
  }

  const result = [...long, ...mid, ...shortPool]
  // Theme word should always be findable in the daily — swap into the
  // shortest slot if for some reason it didn't land in the long bucket.
  if (words.includes(theme) && !result.includes(theme)) {
    result[result.length - 1] = theme
  }
  return result
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function timerClass(seconds: number): string {
  if (seconds <= 30)  return 'critical'
  if (seconds <= 90)  return 'warning'
  return ''
}

export const LOSE_FLAVORS = [
  'The mempool has no mercy. Your transaction timed out.',
  "Not all blocks get confirmed. This one didn't.",
  'Even Satoshi had bad days. Come back tomorrow.',
  'The chain moved on without you. Try again at the next block.',
  'Gas fees are the least of your problems right now.',
  'Your seed phrase remains a mystery... for now.',
  'Rugged by the clock. It happens to the best degens.',
]

export function randomFlavor(): string {
  return LOSE_FLAVORS[Math.floor(Math.random() * LOSE_FLAVORS.length)]
}

// ── Date keys ─────────────────────────────────────────────────────────────────
// "YYYY-MM-DD" in the player's local timezone — used to stamp daily attempts
// so we can detect when a stored attempt is from a previous day.

export function todaysDateKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Countdown to midnight ─────────────────────────────────────────────────────

export function timeToMidnight(): string {
  const now      = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const diff = midnight.getTime() - now.getTime()
  const h    = String(Math.floor(diff / 3600000)).padStart(2, '0')
  const m    = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')
  const s    = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ── Weekly event helpers ──────────────────────────────────────────────────
// Week IDs anchor to "Monday 16:00 PST" — the moment a new event begins.
// Every Mon 16:00 PST the id increments by 1, regardless of where the player
// is in the world. The leaderboard's week_id column therefore aligns exactly
// with one event's competition window (Mon 16:00 → Sun 00:00 = ACTIVE,
// followed by ~40h of SETTLED claim time before the next id flip).
//
// Implementation: we read the PST wall-clock components, repack them as a
// UTC timestamp, and divide by 7 days from a fixed anchor. The anchor is
// Mon Jan 5, 1970 16:00 PST treated as UTC, which makes the math trivial.
// Intl.DateTimeFormat handles DST automatically — we never hand-roll an
// 8h/7h offset, which is the canonical source of week-id bugs.
//
// DST note: across a spring-forward or fall-back transition, the duration
// between successive Mon 16:00 PST moments is 168h ± 1h. The week-id
// remains a clean integer at every boundary because the PST-as-UTC math
// is symmetric on both sides of the transition. The countdown helper
// `timeToNextWeek` may drift by up to an hour for ~24h around the
// transition; that's cosmetic and acceptable.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Mon Jan 5, 1970 16:00 (treating PST wall-clock as UTC). The first
// Monday at-or-after the Unix epoch (which was a Thursday). Anchoring
// here means weekId == 0 is the first event week.
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
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

export function currentWeekId(now: Date | number = new Date()): number {
  const d = typeof now === 'number' ? new Date(now) : now
  return Math.floor((pstAsUtcMs(d) - EVENT_WEEK_ANCHOR_PST_MS) / WEEK_MS)
}

/** Compute the event weekId for a Monday "YYYY-MM-DD" date. The event for
 *  that week is the one that activates at Mon 16:00 PST of the supplied
 *  date. Passing a non-Monday date still works — it'll just return the
 *  weekId of the week containing that date (most recent Mon 16:00 PST
 *  on-or-before). Returns NaN if the date string is malformed. */
export function startWeekIdFromDate(dateISO: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)
  if (!m) return NaN
  const [, y, mo, d] = m
  // Treat <date> 18:00 as PST wall-clock (treated-as-UTC for our anchor
  // math). 18:00 is comfortably past the 16:00 boundary, so the floor()
  // lands in the correct week regardless of any minute-level drift.
  const fake = Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), 18, 0, 0)
  return Math.floor((fake - EVENT_WEEK_ANCHOR_PST_MS) / WEEK_MS)
}

/** ms until the next week boundary (next Mon 16:00 PST). DEPRECATED for
 *  the events page countdown — use `timeToNextPhaseChange` instead. Kept
 *  for any caller that genuinely wants "next week id flip" timing. */
export function timeToNextWeek(now: Date | number = new Date()): number {
  const d = typeof now === 'number' ? new Date(now) : now
  const t = pstAsUtcMs(d)
  const nextBoundary = (currentWeekId(d) + 1) * WEEK_MS + EVENT_WEEK_ANCHOR_PST_MS
  return nextBoundary - t
}

/** Format ms as "Xd HH:MM:SS" — used on the events screen. */
export function formatWeekCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

/** Compact countdown for small UI surfaces (splash captions). Shows only
 *  the two largest units, e.g. "2d 7h", "8h 30m", "45m", or "10s". Keeps
 *  the string short enough to live inside a button subtitle. */
export function formatCountdownShort(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${s}s`
}

// ── Weekly event PHASE ────────────────────────────────────────────────────
// The week ID partitions leaderboard data into 7-day chunks that align with
// Mon 16:00 PST event boundaries (see EVENT_WEEK_ANCHOR_PST_MS above). The
// *phase* is the human-readable lifecycle state of the current event:
//
//   ACTIVE   — players can play levels and submit scores.
//              Mon 16:00 PST → Sun 00:00 PST  (≈ 5d 8h)
//   SETTLED  — event window has closed. Players who entered can claim their
//              rank-based reward, but new scores cannot be earned.
//              Sun 00:00 PST → next Mon 16:00 PST  (≈ 40h)
//
// Both client and server (api/_lib/week.ts) compute phase the same way so
// the score-submission gate matches the play-button gate. Server uses 423
// Locked for rejections during settled.

export type EventPhase = 'active' | 'settled'

/** Decompose a Date into PST weekday + hour + minute + second. Sunday = 0.
 *  Re-derives every component via Intl.DateTimeFormat so DST is handled
 *  correctly without any manual offsetting. */
function pstParts(d: Date): { day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10)
  // Intl with hour12:false can occasionally emit '24' for midnight — normalize.
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    day:    dayMap[weekday] ?? 0,
    hour:   get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

/** Current event phase based on America/Los_Angeles wall-clock. */
export function eventPhase(now: Date = new Date()): EventPhase {
  const { day, hour } = pstParts(now)
  // Settled windows:
  //   • Sunday — any time
  //   • Monday before 16:00 — still recovering from the previous event
  if (day === 0) return 'settled'
  if (day === 1 && hour < 16) return 'settled'
  return 'active'
}

/** Human-readable label for when the current phase will flip. */
export function eventPhaseEndsAt(now: Date = new Date()): string {
  return eventPhase(now) === 'active' ? 'Sun 00:00 PST' : 'Mon 16:00 PST'
}

/** Milliseconds until the current event phase boundary.
 *
 *    ACTIVE  → returns ms until next Sun 00:00 PST (event end)
 *    SETTLED → returns ms until next Mon 16:00 PST (next event start)
 *
 *  Both client UI (the events page countdown) and any client-side eligibility
 *  decisions should prefer this over `timeToNextWeek`, since the week-id flip
 *  and the event-end moment are 8 hours apart. */
export function timeToNextPhaseChange(now: Date = new Date()): number {
  const p = pstParts(now)
  const daysSinceMon = (p.day - 1 + 7) % 7
  // Seconds since "this week's Mon 00:00 PST".
  const sec = daysSinceMon * 86400 + p.hour * 3600 + p.minute * 60 + p.second
  const ACTIVE_START_SEC = 16 * 3600    // Mon 16:00 PST
  const ACTIVE_END_SEC   = 6  * 86400   // Sun 00:00 PST
  const WEEK_SEC         = 7  * 86400
  let targetSec: number
  if      (sec < ACTIVE_START_SEC) targetSec = ACTIVE_START_SEC                    // settled → active
  else if (sec < ACTIVE_END_SEC)   targetSec = ACTIVE_END_SEC                      // active → settled
  else                              targetSec = WEEK_SEC + ACTIVE_START_SEC         // settled → active
  return (targetSec - sec) * 1000
}
