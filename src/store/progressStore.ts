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

// Per-event state: which week was unlocked, and which week's reward has been claimed.
interface EventState {
  unlockedWeek?: number   // week-id when last unlocked (must equal current week to play)
  claimedWeek?:  number   // last week-id the reward was claimed for
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

  // Weekly events
  unlockEventForWeek:    (worldId: WorldId) => void
  isEventUnlockedThisWeek:(worldId: WorldId) => boolean
  markEventRewardClaimed:(worldId: WorldId) => void
  isEventRewardClaimedThisWeek: (worldId: WorldId) => boolean
  forceEventReset:       (worldId: WorldId) => void   // dev helper

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
function loadEventsFromStorage(): Partial<Record<WorldId, EventState>> {
  try { const raw = localStorage.getItem(EVENT_KEY); if (raw) return JSON.parse(raw) } catch {}
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
  // Unlocks are tied to the week-id (epoch / WEEK_MS). When the week rolls
  // over, the stored week-id no longer matches currentWeekId() and the event
  // appears locked again, requiring another 5-GALA purchase.
  unlockEventForWeek: (worldId) => {
    const week = currentWeekId()
    // Wipe last week's per-event level progress when re-unlocking — this is a
    // fresh attempt with a clean leaderboard.
    const currentEvent = get().eventState[worldId]
    const isNewWeek = currentEvent?.unlockedWeek !== week
    const updatedEvent = {
      ...get().eventState,
      [worldId]: { ...currentEvent, unlockedWeek: week },
    }
    saveEvents(updatedEvent)

    if (isNewWeek) {
      // Reset the event world's level progress for the new week.
      const w = get().worlds
      const wipedWorlds = { ...w, [worldId]: { levels: {} } }
      save(wipedWorlds)
      set({ eventState: updatedEvent, worlds: wipedWorlds })
    } else {
      set({ eventState: updatedEvent })
    }
  },

  isEventUnlockedThisWeek: (worldId) =>
    get().eventState[worldId]?.unlockedWeek === currentWeekId(),

  markEventRewardClaimed: (worldId) => {
    const week = currentWeekId()
    const next = {
      ...get().eventState,
      [worldId]: { ...get().eventState[worldId], claimedWeek: week },
    }
    saveEvents(next)
    set({ eventState: next })
  },

  isEventRewardClaimedThisWeek: (worldId) =>
    get().eventState[worldId]?.claimedWeek === currentWeekId(),

  forceEventReset: (worldId) => {
    const w = get().worlds
    const wipedWorlds = { ...w, [worldId]: { levels: {} } }
    const next = { ...get().eventState, [worldId]: {} }
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
