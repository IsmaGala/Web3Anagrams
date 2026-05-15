import type { Level } from '../types'
import type { WheelSkinId } from '../skins'

export type WorldId =
  | 'townstar' | 'mirandus' | 'galaswap' | 'eternalnight'
  | 'area51' | 'asimov' | 'nature'
  | 'oceanevent' | 'blooddonor' | 'area515'
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
  /** One-time Gem bounty granted when the player completes every level in
   *  this world for the first time. Intended for free single-player worlds
   *  as the main on-ramp to the Gem economy — premium/event worlds typically
   *  leave this undefined since the player already paid Gems to enter. The
   *  reward is claimed exactly once per (player, world) via
   *  progressStore.worldCompletionClaimed. */
  completionReward?: number
  /** For event worlds: the bundle granted to the player who ends the
   *  week at rank #1 on this event's leaderboard. Tier 2 / 3 rewards are
   *  uniform across events and live in WeeklyEvents.tsx; only the
   *  marquee skin reward is event-specific. Unset on non-event worlds.
   *  See cosmeticsStore.grantSkin — claim wiring lives in
   *  components/WeeklyEvents.tsx → LeaderboardPanel.handleClaim. */
  eventReward?: {
    firstPlaceSkin?: WheelSkinId
  }
  levels:      Level[]
}
