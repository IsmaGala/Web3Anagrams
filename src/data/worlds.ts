import type { Level } from '../types'

export type WorldId = 'townstar' | 'mirandus' | 'galaswap' | 'eternalnight' | 'area51' | 'asimov' | 'nature' | 'coming_soon'

export interface World {
  id:          WorldId
  name:        string
  subtitle:    string
  icon:        string
  description: string
  color:       string          // primary accent (CSS color)
  gradient:    string          // CSS gradient for card bg
  levelCount:  number
  unlockAfter: number          // for non-premium: complete this many levels in prev world to unlock
  comingSoon?: boolean
  premium?:    boolean         // sold for GALA in the Premium section instead of being progression-gated
  cost?:       number          // GALA price (only set when premium === true)
  levels:      Level[]
}
