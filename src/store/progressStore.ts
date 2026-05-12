import { create } from 'zustand'
import { WORLDS } from '../data/worldData'
import type { WorldId } from '../data/worlds'

const STORAGE_KEY  = 'wc_progress_v1'
const PREMIUM_KEY  = 'wc_premium_unlocks_v1'

interface LevelProgress {
  completed: boolean
  score:     number
}

interface WorldProgress {
  levels: Record<number, LevelProgress>  // levelIndex → progress
}

interface ProgressState {
  worlds:          Record<WorldId, WorldProgress>
  unlockedPremium: Partial<Record<WorldId, boolean>>   // which premium worlds have been purchased

  // Actions
  markLevelComplete:   (worldId: WorldId, levelIndex: number, score: number) => void
  getCompletedCount:   (worldId: WorldId) => number
  isLevelUnlocked:     (worldId: WorldId, levelIndex: number) => number   // 0=locked,1=unlocked,2=completed
  isWorldUnlocked:     (worldId: WorldId) => boolean
  getTotalScore:       (worldId: WorldId) => number
  load:                () => void
  reset:               () => void
  // Premium
  markPremiumUnlocked: (worldId: WorldId) => void
  isPremiumUnlocked:   (worldId: WorldId) => boolean
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
    coming_soon:  { levels: {} },
  }
}

function save(worlds: Record<WorldId, WorldProgress>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)) } catch {}
}

function loadFromStorage(): Record<WorldId, WorldProgress> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyProgress(), ...JSON.parse(raw) }
  } catch {}
  return emptyProgress()
}

function savePremium(map: Partial<Record<WorldId, boolean>>) {
  try { localStorage.setItem(PREMIUM_KEY, JSON.stringify(map)) } catch {}
}

function loadPremiumFromStorage(): Partial<Record<WorldId, boolean>> {
  try {
    const raw = localStorage.getItem(PREMIUM_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  worlds:          loadFromStorage(),
  unlockedPremium: loadPremiumFromStorage(),

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

  getCompletedCount: (worldId) => {
    const { worlds } = get()
    return Object.values(worlds[worldId]?.levels ?? {}).filter(l => l.completed).length
  },

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
    const { getCompletedCount } = get()
    return getCompletedCount(prevWorld.id) >= world.unlockAfter
  },

  getTotalScore: (worldId) => {
    const { worlds } = get()
    return Object.values(worlds[worldId]?.levels ?? {}).reduce((sum, l) => sum + (l.score ?? 0), 0)
  },

  load: () => set({ worlds: loadFromStorage(), unlockedPremium: loadPremiumFromStorage() }),

  reset: () => {
    const empty = emptyProgress()
    save(empty)
    savePremium({})
    set({ worlds: empty, unlockedPremium: {} })
  },

  // ── Premium unlock tracking ─────────────────────────────────────────────
  // Premium worlds are gated by GALA purchase, not progression. We mirror
  // the unlock map to localStorage under wc_premium_unlocks_v1 so a paid
  // unlock survives reloads.
  markPremiumUnlocked: (worldId) => {
    const next = { ...get().unlockedPremium, [worldId]: true }
    savePremium(next)
    set({ unlockedPremium: next })
  },

  isPremiumUnlocked: (worldId) => !!get().unlockedPremium[worldId],
}))
