import type { Level } from '../types'

// Bundle-strip milestone — answer keys moved to api/_data/levels/flagsLevels.ts.
// See src/data/levels.ts for the full rationale comment.

const PLACEHOLDER: Level = {} as Level
export const FLAGS_LEVELS: Level[] = Array.from({ length: 10 }, () => PLACEHOLDER)
