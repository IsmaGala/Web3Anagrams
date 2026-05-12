import type { Level } from '../types'

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

export const DAILY_DURATION = 5 * 60 // seconds

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
