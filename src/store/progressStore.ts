import { create } from 'zustand'
import { WORLDS } from '../data/worldData'
import type { WorldId } from '../data/worlds'
import type { DailyAttempt } from '../types'
import { currentWeekId, todaysDateKey } from '../utils/gameUtils'

const STORAGE_KEY  = 'wc_progress_v1'
const PREMIUM_KEY  = 'wc_premium_unlocks_v1'
const EVENT_KEY    = 'wc_event_state_v1'
const DAILY_KEY    = 'wc_daily_attempt_v1'

interface LevelProgress {
  completed: boolean
  score:     number
}

interface WorldProgress {
  levels: Record<number, LevelProgress>  // levelIndex → progress
}

// Per-event state, scoped to a single (worldId, weekId) competition.
// Unlocked = the player paid to enter that week's event.
// Claimed  = the player has taken their rank-based reward for that week.
//
// Tracking it per-week (rather than the single most-recent week) is what
// lets entered events "stack" — a player who joined two weeks in a row but
// only claimed week N still sees a pending-claim card for week N+1 after
// the new event starts.
export interface EventWeekRecord {
  unlocked: boolean
  claimed:  boolean
}
interface EventState {
  weeks: Record<number, EventWeekRecord>   // weekId → record
}

interface ProgressState {
  worlds:          Record<WorldId, WorldProgress>
  unlockedPremium: Partial<Record<WorldId, boolean>>
  eventState:      Partial<Record<WorldId, EventState>>
  dailyAttempt:    DailyAttempt | null     // today's daily-challenge result, if any

  // Actions — regular progress
  markLevelComplete:   (worldId: WorldId, levelIndex: number, score: number) => void
  getCompletedCount:   (worldId: WorldId) => number
  isLevelUnlocked:     (worldId: WorldId, levelIndex: number) => number
  isWorldUnlocked:     (worldId: WorldId) => boolean
  getTotalScore:       (worldId: WorldId) => number
  load:                () => void
  reset:               () => void

  // Premium
  markPremiumUnlocked: (worldId: WorldId) => void
  isPremiumUnlocked:   (worldId: WorldId) => boolean

  // Weekly events — per-week tracking. The "this week" sugar helpers below
  // are kept for backward compatibility with existing call sites; new code
  // should reach for the explicit per-week variants.
  unlockEventForWeek:    (worldId: WorldId) => void                    // current week
  isEventUnlockedThisWeek:(worldId: WorldId) => boolean
  markEventRewardClaimed:(worldId: WorldId, weekId?: number) => void   // defaults to current
  isEventRewardClaimedThisWeek: (worldId: WorldId) => boolean
  forceEventReset:       (worldId: WorldId) => void                    // dev helper

  // Per-week variants.
  isEventUnlockedForWeek:(worldId: WorldId, weekId: number) => boolean
  isEventClaimedForWeek: (worldId: WorldId, weekId: number) => boolean
  /** Sorted desc (newest first) list of weekIds where the player joined
   *  this event but hasn't claimed their reward yet. */
  getPendingClaimWeeks:  (worldId: WorldId) => number[]

  // Daily lockout — daily can be attempted once per local calendar day.
  // A stored attempt with a stale dateKey is treated as "no attempt today".
  getTodaysDailyAttempt: () => DailyAttempt | null
  setDailyAttempt:       (status: 'won' | 'lost') => void
  clearDailyAttempt:     () => void
}

function emptyProgress(): Record<WorldId, WorldProgress> {
  return {
    townstar:     { levels: {} },
    mirandus:     { levels: {} },
    galaswap:     { levels: {} },
    eternalnight: { levels: {} },
    area51:       { levels: {} },
    asimov:       { levels: {} },
    nature:       { levels: {} },
    oceanevent:   { levels: {} },
    blooddonor:   { levels: {} },
    coming_soon:  { levels: {} },
  }
}

function save(worlds: Record<WorldId, WorldProgress>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)) } catch {}
}
function loadFromStorage(): Record<WorldId, WorldProgress> {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return { ...emptyProgress(), ...JSON.parse(raw) } } catch {}
  return emptyProgress()
}
function savePremium(map: Partial<Record<WorldId, boolean>>) {
  try { localStorage.setItem(PREMIUM_KEY, JSON.stringify(map)) } catch {}
}
function loadPremiumFromStorage(): Partial<Record<WorldId, boolean>> {
  try { const raw = localStorage.getItem(PREMIUM_KEY); if (raw) return JSON.parse(raw) } catch {}
  return {}
}
function saveEvents(map: Partial<Record<WorldId, EventState>>) {
  try { localStorage.setItem(EVENT_KEY, JSON.stringify(map)) } catch {}
}

/** Migrate the pre-stacking shape `{ unlockedWeek?, claimedWeek? }` into the
 *  per-week shape `{ weeks: { [weekId]: { unlocked, claimed } } }`. Both
 *  fields, if present, become entries in the weeks map. If a record is
 *  already in the new shape (has `.weeks`), we pass it through unchanged. */
function migrateEventState(raw: unknown): Partial<Record<WorldId, EventState>> {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, any>
  const out: Partial<Record<WorldId, EventState>> = {}
  for (const wid of Object.keys(src)) {
    const v = src[wid]
    if (!v || typeof v !== 'object') continue
    // New shape — already migrated. Sanitize the weeks map.
    if (v.weeks && typeof v.weeks === 'object') {
      const weeks: Record<number, EventWeekRecord> = {}
      for (const k of Object.keys(v.weeks)) {
        const rec = v.weeks[k]
        const weekId = parseInt(k, 10)
        if (!Number.isFinite(weekId) || !rec) continue
        weeks[weekId] = { unlocked: !!rec.unlocked, claimed: !!rec.claimed }
      }
      out[wid as WorldId] = { weeks }
      continue
    }
    // Old shape — fold the flat fields into the weeks map.
    const weeks: Record<number, EventWeekRecord> = {}
    if (typeof v.unlockedWeek === 'number') {
      weeks[v.unlockedWeek] = { unlocked: true, claimed: v.claimedWeek === v.unlockedWeek }
    }
    if (typeof v.claimedWeek === 'number' && v.claimedWeek !== v.unlockedWeek) {
      // If a claim exists for a different week than the most-recent unlock,
      // assume the player must have entered that week too — we never tracked
      // claims for events they didn't enter.
      weeks[v.claimedWeek] = { unlocked: true, claimed: true }
    }
    out[wid as WorldId] = { weeks }
  }
  return out
}

function loadEventsFromStorage(): Partial<Record<WorldId, EventState>> {
  try {
    const raw = localStorage.getItem(EVENT_KEY)
    if (!raw) return {}
    return migrateEventState(JSON.parse(raw))
  } catch {}
  return {}
}

function saveDaily(att: DailyAttempt | null) {
  try {
    if (att) localStorage.setItem(DAILY_KEY, JSON.stringify(att))
    else     localStorage.removeItem(DAILY_KEY)
  } catch {}
}
function loadDailyFromStorage(): DailyAttempt | null {
  try { const raw = localStorage.getItem(DAILY_KEY); if (raw) return JSON.parse(raw) } catch {}
  return null
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  worlds:          loadFromStorage(),
  unlockedPremium: loadPremiumFromStorage(),
  eventState:      loadEventsFromStorage(),
  dailyAttempt:    loadDailyFromStorage(),

  markLevelComplete: (worldId, levelIndex, score) => {
    const { worlds } = get()
    const prev = worlds[worldId]?.levels[levelIndex]
    const updated: Record<WorldId, WorldProgress> = {
      ...worlds,
      [worldId]: {
        levels: {
          ...worlds[worldId]?.levels,
          [levelIndex]: {
            completed: true,
            score: Math.max(score, prev?.score ?? 0),
          }
        }
      }
    }
    save(updated)
    set({ worlds: updated })
  },

  getCompletedCount: (worldId) =>
    Object.values(get().worlds[worldId]?.levels ?? {}).filter(l => l.completed).length,

  isLevelUnlocked: (worldId, levelIndex) => {
    const { worlds } = get()
    const lvl = worlds[worldId]?.levels[levelIndex]
    if (lvl?.completed) return 2
    if (levelIndex === 0) return 1
    const prev = worlds[worldId]?.levels[levelIndex - 1]
    return prev?.completed ? 1 : 0
  },

  isWorldUnlocked: (worldId) => {
    const world = WORLDS.find(w => w.id === worldId)
    if (!world || world.unlockAfter === 0) return true
    if (world.comingSoon) return false
    const worldIndex = WORLDS.findIndex(w => w.id === worldId)
    if (worldIndex <= 0) return true
    const prevWorld = WORLDS[worldIndex - 1]
    return get().getCompletedCount(prevWorld.id) >= world.unlockAfter
  },

  getTotalScore: (worldId) =>
    Object.values(get().worlds[worldId]?.levels ?? {}).reduce((sum, l) => sum + (l.score ?? 0), 0),

  load: () => set({
    worlds: loadFromStorage(),
    unlockedPremium: loadPremiumFromStorage(),
    eventState: loadEventsFromStorage(),
    dailyAttempt: loadDailyFromStorage(),
  }),

  reset: () => {
    const empty = emptyProgress()
    save(empty); savePremium({}); saveEvents({}); saveDaily(null)
    set({ worlds: empty, unlockedPremium: {}, eventState: {}, dailyAttempt: null })
  },

  // ── Premium ─────────────────────────────────────────────────────────────
  markPremiumUnlocked: (worldId) => {
    const next = { ...get().unlockedPremium, [worldId]: true }
    savePremium(next)
    set({ unlockedPremium: next })
  },
  isPremiumUnlocked: (worldId) => !!get().unlockedPremium[worldId],

  // ── Weekly events ───────────────────────────────────────────────────────
  // Per-week records so entered events persist across week boundaries. A
  // player who joined week N but didn't claim still sees a pending-claim
  // card after the new week starts; the eventState.weeks[N] record survives.
  //
  // When a player enters a NEW week (one with no existing record), we wipe
  // the per-level progress in `worlds[worldId]` because the leaderboard for
  // that new week starts at zero. The previous week's level-by-level scores
  // are gone from the client (they live only on the server's leaderboard
  // rows from now on) — see WeeklyEvents.tsx for how past-week cards rely
  // on the server's leaderboard data rather than local progress.

  isEventUnlockedForWeek: (worldId, weekId) =>
    !!get().eventState[worldId]?.weeks?.[weekId]?.unlocked,

  isEventClaimedForWeek: (worldId, weekId) =>
    !!get().eventState[worldId]?.weeks?.[weekId]?.claimed,

  getPendingClaimWeeks: (worldId) => {
    const weeks = get().eventState[worldId]?.weeks ?? {}
    return Object.entries(weeks)
      .filter(([, rec]) => rec.unlocked && !rec.claimed)
      .map(([k]) => parseInt(k, 10))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => b - a)
  },

  unlockEventForWeek: (worldId) => {
    const week = currentWeekId()
    const cur = get().eventState[worldId] ?? { weeks: {} }
    const alreadyUnlocked = !!cur.weeks[week]?.unlocked
    const updatedEvent: Partial<Record<WorldId, EventState>> = {
      ...get().eventState,
      [worldId]: {
        weeks: {
          ...cur.weeks,
          [week]: { unlocked: true, claimed: cur.weeks[week]?.claimed ?? false },
        },
      },
    }
    saveEvents(updatedEvent)

    if (!alreadyUnlocked) {
      // Fresh week → reset the per-level progress so this week's leaderboard
      // run starts from zero. Past weeks' data lives on the server.
      const w = get().worlds
      const wipedWorlds = { ...w, [worldId]: { levels: {} } }
      save(wipedWorlds)
      set({ eventState: updatedEvent, worlds: wipedWorlds })
    } else {
      set({ eventState: updatedEvent })
    }
  },

  isEventUnlockedThisWeek: (worldId) =>
    get().isEventUnlockedForWeek(worldId, currentWeekId()),

  markEventRewardClaimed: (worldId, weekId) => {
    const week = weekId ?? currentWeekId()
    const cur = get().eventState[worldId] ?? { weeks: {} }
    const prevRec = cur.weeks[week] ?? { unlocked: true, claimed: false }
    const next: Partial<Record<WorldId, EventState>> = {
      ...get().eventState,
      [worldId]: {
        weeks: {
          ...cur.weeks,
          [week]: { unlocked: prevRec.unlocked, claimed: true },
        },
      },
    }
    saveEvents(next)
    set({ eventState: next })
  },

  isEventRewardClaimedThisWeek: (worldId) =>
    get().isEventClaimedForWeek(worldId, currentWeekId()),

  forceEventReset: (worldId) => {
    const w = get().worlds
    const wipedWorlds = { ...w, [worldId]: { levels: {} } }
    const next = { ...get().eventState, [worldId]: { weeks: {} } }
    save(wipedWorlds); saveEvents(next)
    set({ worlds: wipedWorlds, eventState: next })
  },

  // ── Daily lockout ───────────────────────────────────────────────────────
  // Stored attempts whose dateKey isn't today are treated as missing — the
  // daily naturally "resets" when the calendar rolls.
  getTodaysDailyAttempt: () => {
    const att = get().dailyAttempt
    if (!att || att.dateKey !== todaysDateKey()) return null
    return att
  },

  setDailyAttempt: (status) => {
    const att: DailyAttempt = { dateKey: todaysDateKey(), status }
    saveDaily(att)
    set({ dailyAttempt: att })
  },

  clearDailyAttempt: () => {
    saveDaily(null)
    set({ dailyAttempt: null })
  },
}))
