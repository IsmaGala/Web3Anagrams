import type { Level } from '../types'

// Bundle-strip milestone — answer keys moved to api/_data/levels/townstarLevels.ts.
// See src/data/levels.ts for the full rationale comment. This file ships
// only the level count so worldData.ts can compute `levelCount`.

const PLACEHOLDER: Level = {} as Level
export const TOWNSTAR_LEVELS: Level[] = Array.from({ length: 14 }, () => PLACEHOLDER)
