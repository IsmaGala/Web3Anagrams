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
export type Screen   = 'splash' | 'worldSelect' | 'levelSelect' | 'game' | 'premium'

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

  // Economy
  galaBalance: number
  hints:       number

  // Daily
  dailySecondsLeft: number
  dailyComplete:    boolean
  dailyFailed:      boolean
  showQuitConfirm:  boolean   // confirm dialog when user tries to leave mid-daily

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
