import type { Level } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// BUNDLE-STRIP MILESTONE — answer keys moved server-side.
//
// Pre-strip, this file held the full word lists, bonus words, and definitions
// for every level. That data is now in api/_data/levels/levels.ts and is
// only ever returned by the /api/play/level/* endpoints — so the production
// JS bundle no longer contains any answers.
//
// What the client still needs from this file:
//   • The LENGTH of the array — used by LevelSelect to render N tiles and
//     by worldData.ts to compute `levelCount`.
//   • The Level type shape — so legacy code paths still compile (they don't
//     execute in production because VITE_SERVER_AUTHORITATIVE=true).
//
// Each entry is intentionally empty. The legacy `submitWord` / `useHint` /
// `validateLevel` paths that used to read `words`/`bonus`/`defs`/`letters`
// will produce undefined-access errors if the flag is ever flipped off —
// that's by design, to avoid silently degrading to the cheatable code path.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER: Level = {} as Level
export const LEVELS: Level[] = Array.from({ length: 20 }, () => PLACEHOLDER)
