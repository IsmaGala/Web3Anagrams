// ── Level Data ────────────────────────────────────────────────────────────────

export interface Level {
  theme: string
  difficulty: number
  letters: string[]
  words: string[]
  bonus: string[]
  defs: Record<string, string>
}

// ── Game State ────────────────────────────────────────────────────────────────

export type GameMode = 'single' | 'daily'
export type Screen   = 'splash' | 'worldSelect' | 'levelSelect' | 'game' | 'premium' | 'events' | 'store'

export type MessageType = 'great' | 'error' | 'info' | ''

export interface GameState {
  // Navigation
  screen:    Screen
  gameMode:  GameMode

  // Level data
  levels:     Level[]
  allLevels:  Level[]   // master copy, never mutated
  currentLevelIndex: number

  // Round state
  foundWords:  Set<string>
  hintedSlots: Record<string, number[]>  // word -> revealed letter indices
  score:       number
  selected:    number[]
  dragging:    boolean

  // Economy — `gemsBalance` is the in-game currency the player spends on
  // hints, premium worlds, and event entries. Renamed from the original
  // `galaBalance` in v4 when the store launched: gems are purchased with
  // real GALA / GUSDC tokens or earned through gameplay.
  gemsBalance: number
  hints:       number

  // Daily
  dailySecondsLeft: number
  dailyComplete:    boolean
  dailyFailed:      boolean
  showQuitConfirm:  boolean   // confirm dialog when user tries to leave mid-daily

  // Per-round score breakdown trackers (reset every initLevel)
  levelMisses:     number    // invalid submissions ("Not in the chain") since level start
  levelHintsUsed:  number    // hints spent on this level only (global hints state is separate)
  levelStartTime:  number    // epoch ms — used to compute time bonus on complete
  lastBreakdown?:  ScoreBreakdown   // set when a level finishes, read by the win overlay

  // UI feedback
  message:     string
  messageType: MessageType
  currentWord: string
  wordDef:     string
  showShop:    boolean
  toast:       string

  // SFX
  sfxMuted:    boolean
}

// ── Shop Pack ─────────────────────────────────────────────────────────────────

export interface HintPack {
  id:       string
  label:    string
  icon:     string
  hints:    number
  cost:     number
  popular?: boolean
  desc:     string
}

// ── Daily Attempt ─────────────────────────────────────────────────────────────
// Stamped each time the player wins, fails, or quits today's daily. The
// daily is locked until the next midnight unless the player pays 1 GEM to
// clear a 'lost' attempt and try again.

export interface DailyAttempt {
  dateKey: string                  // 'YYYY-MM-DD' in local time
  status:  'won' | 'lost'
}

// ── Score Breakdown ───────────────────────────────────────────────────────────
// Computed at the moment a level is cleared. The final field is what gets
// written to progressStore (and therefore what feeds the leaderboard).

export interface ScoreBreakdown {
  base:           number   // sum of wordScore() for every found word
  misses:         number   // # of invalid submissions during the run
  missesPenalty:  number   // points subtracted because of misses
  hintsUsed:      number   // # of hints spent during the run
  hintsPenalty:   number   // points subtracted because of hints
  elapsedSec:     number   // wall-clock seconds from initLevel to completion
  timeBonus:      number   // points added for finishing fast (capped at 0 from below)
  final:          number   // base − missesPenalty − hintsPenalty + timeBonus, clamped to ≥ 0
}
