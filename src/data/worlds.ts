import type { Level } from '../types'

export type WorldId =
  | 'townstar' | 'mirandus' | 'galaswap' | 'eternalnight'
  | 'area51' | 'asimov' | 'nature'
  | 'oceanevent' | 'blooddonor'
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
  premium?:    boolean         // sold for Gems in the Premium section
  event?:      boolean         // sold for Gems in the Weekly Events section (resets weekly)
  cost?:       number          // Gem price (used by both premium and event)
  /** For event worlds: the ISO date (YYYY-MM-DD) of the Monday this event
   *  becomes ACTIVE. Used to schedule which event runs on which week — the
   *  Mon 16:00 PST of this date is the boundary where the event flips from
   *  "upcoming" to "active". The next Mon 16:00 PST flips it from "active"
   *  to "past". Non-event worlds ignore this field. */
  startDate?:  string
  levels:      Level[]
}
