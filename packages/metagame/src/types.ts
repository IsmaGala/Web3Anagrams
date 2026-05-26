// ─────────────────────────────────────────────────────────────────────────────
// Shared metagame navigation types.
// Each game app extends MetaScreen with its own game-specific screens.
// ─────────────────────────────────────────────────────────────────────────────

/** Core screens present in every game built on the metagame shell. */
export type MetaScreen =
  | 'splash'
  | 'worldSelect'
  | 'levelSelect'
  | 'game'
  | 'premium'
  | 'events'
  | 'store'
  | 'wardrobe'

export type GameMode = 'single' | 'daily'
