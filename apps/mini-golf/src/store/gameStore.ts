import { create } from 'zustand'
import { setSfxMuted, isSfxMuted } from '@gala-games/metagame'
import type { Screen, GameMode, Vec2, HoleResult, MessageType } from '../types'

const ECONOMY_KEY = 'mg_economy_v1'

function loadGems(): number {
  try { return parseInt(localStorage.getItem(ECONOMY_KEY) ?? '0', 10) || 0 } catch { return 0 }
}
function saveGems(n: number) {
  try { localStorage.setItem(ECONOMY_KEY, String(n)) } catch {}
}

export interface GameStoreState {
  // Navigation
  screen:            Screen
  gameMode:          GameMode

  // Course / hole selection
  selectedCourseId:  string | null
  selectedHoleIndex: number

  // Active hole state
  currentShots:   number
  holeResults:    HoleResult[]
  ballPosition:   Vec2 | null
  isHoleComplete: boolean
  ballInWater:    boolean

  // Economy
  gemsBalance: number

  // Daily
  dailySecondsLeft: number
  dailyComplete:    boolean

  // UI
  sfxMuted:    boolean
  toast:       string
  message:     string
  messageType: MessageType
  showShop:    boolean

  // Actions — navigation
  goToSplash:      () => void
  goToWorldSelect: () => void
  goToLevelSelect: (courseId: string) => void
  goToGame:        (holeIndex: number, mode?: GameMode) => void
  goToPremium:     () => void
  goToEvents:      () => void
  goToStore:       () => void
  goToWardrobe:    () => void

  // Actions — gameplay
  recordShot:       () => void
  completeHole:     () => void
  ballDroppedInWater: () => void
  resetHole:        () => void

  // Actions — economy
  spendGems:   (amount: number) => boolean
  earnGems:    (amount: number) => void
  wipeEconomy: () => void

  // Actions — UI
  showToast:       (msg: string) => void
  setMessage:      (msg: string, type: MessageType) => void
  toggleSfxMuted:  () => void
  setShowShop:     (v: boolean) => void
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  screen:            'splash',
  gameMode:          'single',
  selectedCourseId:  null,
  selectedHoleIndex: 0,
  currentShots:      0,
  holeResults:       [],
  ballPosition:      null,
  isHoleComplete:    false,
  ballInWater:       false,
  gemsBalance:       loadGems(),
  dailySecondsLeft:  0,
  dailyComplete:     false,
  sfxMuted:          isSfxMuted(),
  toast:             '',
  message:           '',
  messageType:       '',
  showShop:          false,

  // ── Navigation ──────────────────────────────────────────────────────────────

  goToSplash:      () => set({ screen: 'splash' }),
  goToWorldSelect: () => set({ screen: 'worldSelect' }),
  goToLevelSelect: (courseId) => set({ screen: 'levelSelect', selectedCourseId: courseId }),
  goToGame: (holeIndex, mode = 'single') =>
    set({ screen: 'game', selectedHoleIndex: holeIndex, gameMode: mode, currentShots: 0, isHoleComplete: false, ballInWater: false }),
  goToPremium:  () => set({ screen: 'premium' }),
  goToEvents:   () => set({ screen: 'events' }),
  goToStore:    () => set({ screen: 'store', showShop: true }),
  goToWardrobe: () => set({ screen: 'wardrobe' }),

  // ── Gameplay ─────────────────────────────────────────────────────────────────

  recordShot: () => set(s => ({ currentShots: s.currentShots + 1 })),

  completeHole: () => {
    const { selectedCourseId, selectedHoleIndex, currentShots } = get()
    if (!selectedCourseId) return
    const result: HoleResult = {
      holeId: `${selectedCourseId}_${selectedHoleIndex}`,
      par:    3, // fetched from courseData in the component
      shots:  currentShots,
    }
    set(s => ({
      isHoleComplete: true,
      holeResults:    [...s.holeResults, result],
    }))
  },

  ballDroppedInWater: () => {
    // Penalty stroke + reset to last safe position
    set(s => ({ currentShots: s.currentShots + 1, ballInWater: false }))
  },

  resetHole: () => set({ currentShots: 0, isHoleComplete: false, ballInWater: false }),

  // ── Economy ──────────────────────────────────────────────────────────────────

  spendGems: (amount) => {
    const bal = get().gemsBalance
    if (bal < amount) return false
    const next = bal - amount
    set({ gemsBalance: next })
    saveGems(next)
    return true
  },

  earnGems: (amount) => {
    const next = get().gemsBalance + amount
    set({ gemsBalance: next })
    saveGems(next)
  },

  wipeEconomy: () => {
    set({ gemsBalance: 0 })
    saveGems(0)
  },

  // ── UI ────────────────────────────────────────────────────────────────────────

  showToast: (msg) => {
    set({ toast: msg })
    setTimeout(() => set(s => (s.toast === msg ? { toast: '' } : {})), 2500)
  },

  setMessage: (msg, type) => set({ message: msg, messageType: type }),

  toggleSfxMuted: () => {
    const next = !get().sfxMuted
    setSfxMuted(next)
    set({ sfxMuted: next })
  },

  setShowShop: (v) => set({ showShop: v }),
}))

/** Convenience: wipe economy from outside the store (used by wallet disconnect handler). */
export function wipeEconomy() {
  useGameStore.getState().wipeEconomy()
}
