import type { Level } from '../types'

// Bundle-strip milestone — answer keys moved to api/_data/levels/area51Levels.ts.
// See src/data/levels.ts for the full rationale comment. This file also
// previously contained ~9.5 KB of NUL-byte padding from an earlier accident;
// the rewrite incidentally cleans that up.

const PLACEHOLDER: Level = {} as Level
export const AREA51_LEVELS: Level[] = Array.from({ length: 10 }, () => PLACEHOLDER)
