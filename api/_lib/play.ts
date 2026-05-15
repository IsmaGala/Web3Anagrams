// Server-side gameplay helpers — mirrors the parts of src/utils/gameUtils.ts
// the server needs to be authoritative over: word validation against the
// letter pool, level normalization (cap word count, drop invalid words), the
// daily word-mix curator, the score breakdown formula, and seeded shuffles.
//
// The client still has its own copy of these for the legacy (pre-flag) code
// path and for any optimistic UI it wants to render. The server's results
// are always authoritative.

import type { Level } from '../_data/types.js'

// ── Validation constants (kept in lockstep with src/utils/gameUtils.ts) ──────

export const MIN_WORDS_PER_LEVEL = 3
export const MAX_WORDS_PER_LEVEL = 20

// ── Word validation ──────────────────────────────────────────────────────────

export function canMakeWord(word: string, pool: string[]): boolean {
  const remaining = [...pool]
  for (const ch of word) {
    const idx = remaining.indexOf(ch)
    if (idx === -1) return false
    remaining.splice(idx, 1)
  }
  return true
}

function topScoringWords(words: string[], n: number, protect?: string): string[] {
  const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const top    = sorted.slice(0, n)
  if (protect && words.includes(protect) && !top.includes(protect)) {
    top[top.length - 1] = protect
  }
  return top
}

/** Validate + cap a level. Returns a normalized copy with `words` / `bonus`
 *  guaranteed to be makeable from `letters` and `words` capped at
 *  MAX_WORDS_PER_LEVEL (theme word always preserved). The server runs this
 *  ONCE per request rather than caching, since it's cheap (< 1ms) and lets
 *  us hot-reload level edits without restart. */
export function validateLevel(level: Level): Level {
  let words   = level.words.filter(w => canMakeWord(w, level.letters))
  const bonus = level.bonus.filter(w => canMakeWord(w, level.letters))
  if (words.length > MAX_WORDS_PER_LEVEL) {
    words = topScoringWords(words, MAX_WORDS_PER_LEVEL, level.theme)
  }
  return { ...level, words, bonus }
}

// ── Score helpers ────────────────────────────────────────────────────────────

export function wordScore(word: string, isBonus = false): number {
  return word.length * (isBonus ? 15 : 10)
}

export const MISS_PENALTY        = 5
export const HINT_PENALTY        = 25
export const TARGET_TIME_SECONDS = 120
export const TIME_BONUS_PER_SEC  = 2

export interface ScoreBreakdown {
  base:          number
  misses:        number
  missesPenalty: number
  hintsUsed:     number
  hintsPenalty:  number
  elapsedSec:    number
  timeBonus:     number
  final:         number
}

export function computeScoreBreakdown(
  base:           number,
  misses:         number,
  hintsUsed:      number,
  levelStartTime: number,
  now:            number = Date.now(),
): ScoreBreakdown {
  const elapsedSec    = Math.max(0, Math.round((now - levelStartTime) / 1000))
  const missesPenalty = misses    * MISS_PENALTY
  const hintsPenalty  = hintsUsed * HINT_PENALTY
  const timeBonus     = Math.max(0, Math.round((TARGET_TIME_SECONDS - elapsedSec) * TIME_BONUS_PER_SEC))
  const final         = Math.max(0, base - missesPenalty - hintsPenalty + timeBonus)
  return { base, misses, missesPenalty, hintsUsed, hintsPenalty, elapsedSec, timeBonus, final }
}

// ── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
// Used to deterministically shuffle wheel letters per-round so two players
// rolling the same level see the same scramble (matters for support tickets:
// "level 4 letters were L T A V U" reproduces server-side).

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Public manifest builder ──────────────────────────────────────────────────
// Distills a Level into the shape we ship to the client. Strips `words`,
// `bonus`, `defs`, and the literal theme word; exposes only what's needed
// to render the empty grid + wheel.

export interface LevelManifest {
  levelId:        string
  worldId:        string
  levelIndex:     number
  difficulty:     number
  letters:        string[]   // shuffled per-round
  slotCount:      number
  slotLengths:    number[]
  bonusSlotCount: number
  displayTitle:   string     // never the theme word; safe to render as-is
}

export function buildManifest(
  worldId:    string,
  levelIndex: number,
  level:      Level,
  roundSeed:  number,
): LevelManifest {
  const v = validateLevel(level)
  const slotLengths = v.words.map(w => w.length).sort((a, b) => a - b)
  return {
    levelId:        `${worldId}-${levelIndex}`,
    worldId,
    levelIndex,
    difficulty:     level.difficulty,
    letters:        seededShuffle(level.letters, roundSeed),
    slotCount:      v.words.length,
    slotLengths,
    bonusSlotCount: v.bonus.length,
    // Intentionally no theme: level.theme often IS the longest answer. Client
    // renders the world-level name + a 1-indexed level number instead.
    displayTitle:   `Level ${levelIndex + 1}`,
  }
}

// ── Slot resolution ──────────────────────────────────────────────────────────
// A slot is identified to the client by (len, ordinal) — its length and its
// position among slots of the same length, with ordinal assigned by the order
// the slots first appear in `slotLengths`. The server keeps the same mapping
// so it can tell the client which slot a submitted word filled, without
// revealing what's in the other slots.

export interface SlotRef { len: number; ordinal: number }

/** Given the validated words list and a target word, return which (len, ordinal)
 *  slot that word occupies. The slotLengths array on the manifest is sorted
 *  ascending, and ordinals are stable per-length. */
export function slotForWord(words: string[], word: string): SlotRef | null {
  if (!words.includes(word)) return null
  const sameLen = words.filter(w => w.length === word.length)
  // Within same-length slots, ordinal is index in INSERTION order. We can't
  // rely on the words array order being meaningful, so sort alphabetically
  // to get a stable mapping that doesn't depend on how the level was written.
  sameLen.sort((a, b) => a.localeCompare(b))
  const ordinal = sameLen.indexOf(word)
  return ordinal === -1 ? null : { len: word.length, ordinal }
}
