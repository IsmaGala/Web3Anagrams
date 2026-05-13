import type { Level } from '../types'

export type WorldId =
  | 'townstar' | 'mirandus' | 'galaswap' | 'eternalnight'
  | 'area51' | 'asimov' | 'nature'
  | 'oceanevent'
  | 'coming_soon'

export interface World {
  id:          WorldId
  name:        string
  subtitle:    string
  icon:        string
  description: string
  color:       string          // primary accent (CSS color)
  gradient:    string          // CSS gradient for card bg
  levelCount:  number
  unlockAfter: number          // for non-premium / non-event: complete this many levels in prev world to unlock
  comingSoon?: boolean
  premium?:    boolean         // sold for GALA in the Premium section
  event?:      boolean         // sold for GALA in the Weekly Events section (resets weekly)
  cost?:       number          // GALA price (used by both premium and event)
  levels:      Level[]
}
