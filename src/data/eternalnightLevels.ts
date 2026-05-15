import type { Level } from '../types'

// Bundle-strip milestone — answer keys moved to api/_data/levels/eternalnightLevels.ts.
// See src/data/levels.ts for the full rationale comment.

const PLACEHOLDER: Level = {} as Level
export const ETERNALNIGHT_LEVELS: Level[] = Array.from({ length: 20 }, () => PLACEHOLDER)
