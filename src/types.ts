// ── Level Data ────────────────────────────────────────────────────────────────
//
// Post bundle-strip: the production bundle ships placeholder Levels
// (`{} as Level`) — the real `words`/`bonus`/`defs`/`letters`/`theme` only
// exist server-side in api/_data/levels/.
//
// The fields below remain REQUIRED in the type so that legacy code paths
// compile without an `!` everywhere; the data files use `as Level` to
// satisfy the typechecker. At runtime these fields are `undefined` in the
// stripped bundle, so any legacy path that reads them must either be gated
// behind a non-server-mode branch (`!isServerAuthoritative()`) or defensively
// check for undefined before access (see the bundle-strip guards in
// gameStore.ts submitWord / useHint / _updateCurrentWord).

export interface Level {
  theme:      string
  difficulty: number
  letters:    string[]
  words:      string[]
  bonus:      string[]
  defs:       Record<string, string>
}

// ── Server-authoritative level data (VITE_SERVER_AUTHORITATIVE) ──────────────
//
// When the server-authoritative flag is on, the client receives a
// LevelManifest from POST /api/play/level/start instead of importing a Level
// from src/data. The manifest carries only what the client needs to render
// the empty grid + wheel — slot lengths, shuffled letters, a display title —
// and nothing that would let a cheater learn the answers ahead of time.
//
// Per-slot fill / hint state lives in `SlotState`. The server identifies each
// slot by (len, ordinal) — its length and its 0-based position among slots of
// the same length, sorted alphabetically by the canonical word. The client
// uses the same identifier in submit-word / hint responses so the renderer
// knows which row to update.

export interface LevelManifest {
  levelId:        string
  worldId:        string
  levelIndex:     number
  difficulty:     number
  letters:        string[]   // shuffled per-round
  slotCount:      number
  slotLengths:    number[]   // sorted ascending
  bonusSlotCount: number
  displayTitle:   string     // never reveals the theme word
}

export interface SlotRef {
  len:     number
  ordinal: number
}

export interface HintReveal {
  position: number    // 0-based letter index within the slot
  letter:   string
}

export interface SlotState extends SlotRef {
  /** When the slot is filled, the server-canonical word + def for it.
   *  When unfilled, undefined. */
  filled?: { word: string; def: string }
  /** Server-revealed letters at specific positions. Empty until the
   *  player spends a hint. */
  hinted:  HintReveal[]
}

/** Aggregate of the current round's server state. Populated by initLevel
 *  in server mode; null in legacy mode. */
export interface RoundState {
  roundId:        string
  manifest:       LevelManifest
  slots:          SlotState[]
  /** Bonus words found this round. Bonus slots aren't pre-disclosed (the
   *  manifest only shows a bonusSlotCount), so we track them as a flat list
   *  rather than as positional slots. */
  bonusFound:     Array<{ word: string; def: string }>
}

// ── Game State ────────────────────────────────────────────────────────────────

export type GameMode = 'single' | 'daily'
export type Screen   = 'splash' | 'worldSelect' | 'levelSelect' | 'game' | 'premium' | 'events' | 'store' | 'wardrobe'

export type MessageType = 'great' | 'error' | 'info' | ''

export interface GameState {
  // Navigation
  screen:    Screen
  gameMode:  GameMode

  // Level data
  levels:     Level[]
  allLevels:  Level[]   // master copy, never mutated
  currentLevelIndex: number

  // Server-authoritative round state (only populated when VITE_SERVER_AUTHORITATIVE
  // is on — null otherwise). When non-null, the renderer prefers `round.manifest`
  // / `round.slots` over `levels[currentLevelIndex]` (which won't contain the
  // answer key anyway in this mode).
  round:      RoundState | null

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
