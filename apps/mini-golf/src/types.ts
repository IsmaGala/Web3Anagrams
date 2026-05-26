import type { MetaScreen, GameMode } from '@gala-games/metagame'

export type { GameMode }
export type Screen = MetaScreen   // all meta screens map 1:1 for this game

// ── Course / Hole data ────────────────────────────────────────────────────────

export interface Vec2 { x: number; y: number }

export type TerrainType = 'fairway' | 'sand' | 'water'
export type ObstacleType = 'box' | 'bumper' | 'windmill'

export interface Wall {
  x: number; y: number   // top-left
  w: number; h: number
  angle?: number         // radians, default 0
}

export interface Obstacle {
  type: ObstacleType
  x: number; y: number
  /** For windmill: rotation speed in rad/s */
  speed?: number
}

export interface TerrainZone {
  type: TerrainType
  x: number; y: number
  w: number; h: number
}

export interface ForceEmitter {
  x: number
  y: number
  /** Direction in radians. 0 = right, -π/2 = up, π/2 = down, π = left */
  angle: number
  /** Force magnitude applied per frame while ball is inside radius */
  strength: number
  /** Trigger radius in pixels */
  radius: number
}

export interface Hole {
  id: string
  par: number
  /** Canvas size in logical pixels */
  width: number
  height: number
  ball: Vec2              // starting ball position
  hole: Vec2              // hole (cup) position
  walls: Wall[]
  obstacles: Obstacle[]
  terrain: TerrainZone[]
  forceEmitters?: ForceEmitter[]
}

export interface Course {
  id: string
  name: string
  description: string
  theme: string           // e.g. 'forest', 'beach', 'space'
  thumbnail: string       // emoji or image path
  isPremium: boolean
  holes: Hole[]
}

// ── Cosmetics ─────────────────────────────────────────────────────────────────

export type BallSkinId  = 'default' | 'gold' | 'neon' | 'gala'
export type ClubSkinId  = 'default' | 'chrome' | 'bamboo' | 'laser'
export type CosmeticItemType = 'ball' | 'club'

export interface CosmeticItem {
  id: string
  type: CosmeticItemType
  label: string
  description: string
  price?: number          // gem cost; undefined = earn-only or always-owned
  color: string           // primary render color
  trailColor?: string     // for balls: trail/glow color
}

// ── Game state ────────────────────────────────────────────────────────────────

export interface HoleResult {
  holeId: string
  par:    number
  shots:  number         // strokes taken (Infinity = skipped/drowned)
}

export type MessageType = 'great' | 'error' | 'info' | ''

export interface GameState {
  screen:        Screen
  gameMode:      GameMode

  // Navigation
  selectedCourseId: string | null
  selectedHoleIndex: number

  // Round
  currentShots:  number   // shots taken on current hole
  holeResults:   HoleResult[]
  ballPosition:  Vec2 | null
  isHoleComplete: boolean
  ballInWater:   boolean

  // Economy
  gemsBalance:   number

  // Daily
  dailySecondsLeft: number
  dailyComplete:    boolean

  // UI
  sfxMuted:      boolean
  toast:         string
  message:       string
  messageType:   MessageType
}

// ── Score ─────────────────────────────────────────────────────────────────────

export interface RoundSummary {
  courseId: string
  totalShots: number
  totalPar:   number
  score:      number    // shots - par (negative is good, "under par")
  results:    HoleResult[]
}
