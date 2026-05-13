import { create } from 'zustand'
import type { GameState, GameMode, Level, MessageType } from '../types'
import {
  arrangeLevels, pickDailyLevel, getSessionSeed,
  wordScore, wordFeedback, validateLevel,
  DAILY_DURATION, updateStreak,
  MIN_WORDS_PER_LEVEL,
  computeScoreBreakdown,
  pickDailyWordMix,
} from '../utils/gameUtils'
import { playSfx, isSfxMuted, setSfxMuted, unlockSfx } from '../utils/sfx'
import { useProgressStore } from './progressStore'

function saveProgress(worldId: string, levelIndex: number, score: number) {
  try {
    useProgressStore.getState().markLevelComplete(worldId as any, levelIndex, score)
    console.log(`✅ Progress saved: ${worldId} level ${levelIndex} score ${score}`)
  } catch (e) {
    console.warn('❌ Could not save progress:', e)
  }
}

/** Fire-and-forget leaderboard submission. Called after the local breakdown
 *  is computed. No-ops gracefully when:
 *    • the world isn't an event world
 *    • the player isn't connected / not signed in
 *    • the network/server is unavailable (we don't want game UX to depend on it)
 *  Server keeps the best-of-week score, so resubmitting on a worse run is safe. */
function submitEventScoreIfApplicable(worldId: string, score: number) {
  // Lazy lookup of the world so the import graph stays simple.
  import('../data/worldData').then(({ WORLDS: ALL }) => {
    const world = ALL.find(w => w.id === worldId)
    if (!world?.event) return
    return import('./walletStore').then(({ useWalletStore }) => {
      if (!useWalletStore.getState().jwt) return
      return import('../utils/apiClient').then(({ api }) =>
        api.post('/api/leaderboard/score', { eventId: worldId, score })
      )
    })
  }).catch(err => {
    // Non-fatal — log for debugging but never disrupt gameplay.
    console.warn('Leaderboard submission failed:', err)
  })
}

/** Drop levels whose validated word list is below the playable minimum.
 *  validateLevel already logs a warning for these; here we simply exclude
 *  them from the rotation so the player never lands on a too-thin level. */
function playableLevel(lvl: Level): boolean {
  if (lvl.words.length < MIN_WORDS_PER_LEVEL) {
    console.warn(`[${lvl.theme}] excluded from rotation: only ${lvl.words.length} word(s), need ≥ ${MIN_WORDS_PER_LEVEL}`)
    return false
  }
  return true
}

const DAILY_HINT_REWARD = 5     // hints granted on daily win (GALA reward removed — hints are the only GALA sink, so we don't bleed supply)
const INITIAL_HINTS     = 3
const INITIAL_GALA      = 10000

// ── Local economy persistence ────────────────────────────────────────────────
// Until on-chain GALA is wired, the player's GALA + hints are session-local.
// We mirror them to localStorage so a page reload (or MetaMask switching
// accounts, which can trigger one) doesn't reset the balance to 10k.
//
// When v3 lands and the GALA balance comes from GalaChain, delete the
// hydration on init and replace the subscription with a chain-fetch.

const ECONOMY_KEY = 'wc_economy_v1'

interface PersistedEconomy { galaBalance: number; hints: number }

function loadEconomy(): PersistedEconomy {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ECONOMY_KEY) : null
    if (!raw) return { galaBalance: INITIAL_GALA, hints: INITIAL_HINTS }
    const obj = JSON.parse(raw) as Partial<PersistedEconomy>
    return {
      galaBalance: typeof obj.galaBalance === 'number' && obj.galaBalance >= 0 ? obj.galaBalance : INITIAL_GALA,
      hints:       typeof obj.hints       === 'number' && obj.hints       >= 0 ? obj.hints       : INITIAL_HINTS,
    }
  } catch { return { galaBalance: INITIAL_GALA, hints: INITIAL_HINTS } }
}

function saveEconomy(payload: PersistedEconomy) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ECONOMY_KEY, JSON.stringify(payload))
    }
  } catch {}
}

export function wipeEconomy() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(ECONOMY_KEY) } catch {}
  useGameStore.setState({ galaBalance: INITIAL_GALA, hints: INITIAL_HINTS })
}

// ── Store interface ────────────────────────────────────────────────────────────

interface GameStore extends GameState {
  // World nav (loosely typed to avoid circular dep on WorldId)
  selectedWorldId: string
  _worldId:        string
  setScreen:       (s: string) => void
  setWorldId:      (id: string) => void

  // Navigation
  goToGame:        (mode: GameMode) => void
  goToSplash:      () => void
  goToLevelSelect: () => void
  goToPremium:     () => void
  goToEvents:      () => void
  // Premium
  purchaseWorld:   (worldId: string, cost: number) => boolean
  // Weekly events
  purchaseEvent:   (worldId: string, cost: number) => boolean
  // Daily retry
  payToRetryDaily: () => boolean

  // Level lifecycle
  loadLevels:       (raw: Level[]) => void
  loadWorldLevels:  (raw: Level[]) => void
  initLevel:        () => void
  nextLevel:        () => void

  // Wheel
  startSelect:    (index: number) => void
  continueSelect: (index: number) => void
  endSelect:      () => void

  // Internal helpers (declared in interface so get() can call them)
  _updateCurrentWord: (sel: number[]) => void
  _setMessage:        (msg: string, type: MessageType) => void

  // Word submission
  submitWord: () => void
  useHint:    () => void

  // Shop
  openShop:  () => void
  closeShop: () => void
  buyPack:   (hints: number, cost: number) => void

  // Daily timer
  tickTimer:        () => void
  triggerDailyWin:  () => void
  triggerDailyLose: () => void

  // Daily quit-confirm flow
  requestQuitDaily: () => void
  confirmQuitDaily: () => void
  cancelQuitDaily:  () => void

  // UI
  showToast:  (msg: string) => void
  clearToast: () => void

  // SFX
  toggleSfxMuted: () => void
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────────────
  screen:            'splash',
  gameMode:          'single',
  levels:            [],
  allLevels:         [],
  currentLevelIndex: 0,
  foundWords:        new Set(),
  hintedSlots:       {},
  score:             0,
  selected:          [],
  dragging:          false,
  galaBalance:       loadEconomy().galaBalance,
  hints:             loadEconomy().hints,
  dailySecondsLeft:  DAILY_DURATION,
  dailyComplete:     false,
  dailyFailed:       false,
  showQuitConfirm:   false,
  levelMisses:       0,
  levelHintsUsed:    0,
  levelStartTime:    Date.now(),
  lastBreakdown:     undefined,
  message:           '',
  messageType:       '',
  currentWord:       '',
  wordDef:           '',
  showShop:          false,
  toast:             '',
  selectedWorldId:   'townstar',
  _worldId:          'townstar',
  sfxMuted:          isSfxMuted(),

  setScreen:  (screen) => set({ screen } as any),
  setWorldId: (id) => set({ selectedWorldId: id, _worldId: id }),

  // ── Load & init ──────────────────────────────────────────────────────────

  loadLevels: (raw) => {
    const validated = raw.map(validateLevel).filter(playableLevel)
    const seed      = getSessionSeed()
    const arranged  = arrangeLevels(validated, seed)
    set({ allLevels: arranged, levels: arranged })
  },

  // Load a specific world's levels in fixed order — no shuffle
  loadWorldLevels: (raw: Level[]) => {
    const validated = raw.map(validateLevel).filter(playableLevel)
    set({ levels: validated })
  },

  initLevel: () => {
    const { levels, currentLevelIndex, gameMode } = get()
    if (!levels.length) return
    const lvl     = levels[currentLevelIndex % levels.length]
    const isDaily = gameMode === 'daily'
    const msg     = isDaily ? '⏱ 8 minutes — no hints!' : `Find ${lvl.words.length} words!`
    set({
      foundWords:      new Set(),
      hintedSlots:     {},
      selected:        [],
      dragging:        false,
      // Reset the per-round trackers so the breakdown only reflects this run.
      levelMisses:     0,
      levelHintsUsed:  0,
      levelStartTime:  Date.now(),
      lastBreakdown:   undefined,
      score:           0,
      currentWord:     '',
      wordDef:         '',
      message:         msg,
      messageType:     isDaily ? 'error' : 'info',
      dailySecondsLeft: DAILY_DURATION,
      dailyComplete:   false,
      dailyFailed:     false,
    })
    setTimeout(() => {
      if (get().message === msg) set({ message: '', messageType: '' })
    }, 2000)
  },

  // ── Navigation ───────────────────────────────────────────────────────────

  goToGame: (mode) => {
    const { allLevels } = get()
    if (mode === 'daily') {
      // Don't let the player re-enter the daily once today's attempt has
      // resolved. Splash gates this already but defense-in-depth — also
      // catches programmatic entry paths.
      if (useProgressStore.getState().getTodaysDailyAttempt()) {
        get().showToast('Daily already played — comes back at midnight')
        return
      }
      const picked = pickDailyLevel(allLevels)
      // Daily-specific curation: trim the full word list down to a mixed
      // 13-word set (long/mid/short) so the daily feels distinct from a
      // regular level — same rules for everyone since the underlying word
      // list is deterministic.
      const dailyLevel = { ...picked, words: pickDailyWordMix(picked.words, picked.theme) }
      updateStreak()
      set({ gameMode: mode, screen: 'game', levels: [dailyLevel], currentLevelIndex: 0, score: 0 })
      setTimeout(() => get().initLevel(), 0)
    } else {
      set({ screen: 'worldSelect' })
    }
  },

  goToSplash: () => set({
    screen:            'splash',
    currentLevelIndex: 0,
    dailyComplete:     false,
    dailyFailed:       false,
    dailySecondsLeft:  DAILY_DURATION,
    showQuitConfirm:   false,
  }),

  goToLevelSelect: () => set({
    screen:        'levelSelect',
    dailyComplete: false,
    dailyFailed:   false,
  }),

  // Navigate to the premium (paid worlds) storefront.
  goToPremium: () => set({ screen: 'premium' }),

  // Navigate to the weekly events hub.
  goToEvents: () => set({ screen: 'events' }),

  // Spend GALA to unlock the current week's event. The unlock resets every
  // Monday (epoch-anchored week). Returns true if purchase succeeded.
  purchaseEvent: (worldId, cost) => {
    const { galaBalance } = get()
    if (galaBalance < cost) {
      playSfx('wordInvalid')
      get().showToast('⚠ Insufficient GALA balance')
      return false
    }
    set({ galaBalance: galaBalance - cost })
    useProgressStore.getState().unlockEventForWeek(worldId as any)
    playSfx('purchase')
    get().showToast(`✓ Event unlocked · ${cost} GALA spent`)
    return true
  },

  // Spend GALA to unlock a premium world. Returns true if purchase succeeded.
  // The actual unlock is persisted in progressStore so it survives reloads.
  purchaseWorld: (worldId, cost) => {
    const { galaBalance } = get()
    if (galaBalance < cost) {
      playSfx('wordInvalid')
      get().showToast('⚠ Insufficient GALA balance')
      return false
    }
    set({ galaBalance: galaBalance - cost })
    useProgressStore.getState().markPremiumUnlocked(worldId as any)
    playSfx('purchase')
    get().showToast(`✓ World unlocked · ${cost.toLocaleString()} GALA spent`)
    return true
  },

  nextLevel: () => {
    const { currentLevelIndex, levels } = get()
    if (currentLevelIndex >= levels.length - 1) {
      get().goToLevelSelect()
    } else {
      set({ currentLevelIndex: currentLevelIndex + 1 })
      get().initLevel()
    }
  },

  // ── Wheel ────────────────────────────────────────────────────────────────

  startSelect: (index) => {
    set({ dragging: true, selected: [index] })
    get()._updateCurrentWord([index])
    playSfx('letterTick')
  },

  continueSelect: (index) => {
    const { dragging, selected } = get()
    if (!dragging) return
    if (selected.includes(index)) {
      const pos = selected.indexOf(index)
      if (pos === selected.length - 2) {
        const next = selected.slice(0, selected.length - 1)
        set({ selected: next })
        get()._updateCurrentWord(next)
      }
      return
    }
    const next = [...selected, index]
    set({ selected: next })
    get()._updateCurrentWord(next)
    playSfx('letterTick')
  },

  endSelect: () => {
    if (!get().dragging) return
    set({ dragging: false })
    get().submitWord()
  },

  _updateCurrentWord: (sel) => {
    const { levels, currentLevelIndex } = get()
    const lvl = levels[currentLevelIndex % levels.length]
    if (!lvl) return
    const word      = sel.map(i => lvl.letters[i]).join('')
    const allWords  = [...lvl.words, ...lvl.bonus]
    const wordState = word.length >= 2 ? (allWords.includes(word) ? 'valid' : 'invalid') : ''
    set({ currentWord: word, _currentWordState: wordState } as any)
  },

  // ── Word Submission ───────────────────────────────────────────────────────

  submitWord: () => {
    const { levels, currentLevelIndex, selected, foundWords, score, gameMode, _worldId } = get()
    const lvl = levels[currentLevelIndex % levels.length]
    if (!lvl) return

    const word = selected.map(i => lvl.letters[i]).join('')
    set({ selected: [], currentWord: '', _currentWordState: '' } as any)
    if (word.length < 2) return

    if (foundWords.has(word)) {
      playSfx('wordRepeat')
      get()._setMessage('Already found!', 'error')
      return
    }

    if (lvl.words.includes(word)) {
      const next     = new Set(foundWords)
      next.add(word)
      const newScore = score + wordScore(word)
      const def      = lvl.defs[word] ?? ''
      set({ foundWords: next, score: newScore, wordDef: def ? `${word}: ${def}` : '' })
      playSfx('wordValid')
      get()._setMessage(wordFeedback(word), 'great')

      if (lvl.words.every(w => next.has(w))) {
        // Compute the final score breakdown — base words minus misses & hints
        // penalty plus a speed bonus — and save THAT to progress (so the
        // leaderboard sees the granular figure, not just word totals).
        const { levelMisses, levelHintsUsed, levelStartTime } = get()
        const breakdown = computeScoreBreakdown(newScore, levelMisses, levelHintsUsed, levelStartTime)
        set({ lastBreakdown: breakdown, score: breakdown.final })
        saveProgress(_worldId, currentLevelIndex, breakdown.final)
        // For event worlds, also submit to the server leaderboard if the
        // player is signed in. Fire-and-forget — server failure should never
        // block the local progression UI.
        submitEventScoreIfApplicable(_worldId, breakdown.final)
        setTimeout(() => {
          if (gameMode === 'daily') get().triggerDailyWin()
          else {
            playSfx('levelComplete')
            set({ _levelComplete: true } as any)
          }
        }, 600)
      }
      return
    }

    if (lvl.bonus.includes(word)) {
      const next     = new Set(foundWords)
      next.add(word)
      const newScore = score + wordScore(word, true)
      const def      = lvl.defs[word] ?? ''
      set({ foundWords: next, score: newScore, wordDef: def ? `${word}: ${def}` : '' })
      playSfx('wordBonus')
      get()._setMessage('💎 BONUS TOKEN!', 'great')
      return
    }

    // Track misses for the score breakdown — only counts genuine "not in
    // chain" misfires, not repeats (those are softer feedback).
    set({ levelMisses: get().levelMisses + 1 })
    playSfx('wordInvalid')
    get()._setMessage('Not in the chain', 'error')
  },

  // ── Hints ─────────────────────────────────────────────────────────────────

  useHint: () => {
    const { gameMode, hints, levels, currentLevelIndex, foundWords, hintedSlots } = get()
    if (gameMode === 'daily') return
    const lvl = levels[currentLevelIndex % levels.length]
    if (!lvl) return

    const hintable = lvl.words.filter(w => {
      if (foundWords.has(w)) return false
      const revealed = hintedSlots[w] ?? []
      return w.split('').some((_, i) => !revealed.includes(i))
    })

    if (hintable.length === 0) { playSfx('wordInvalid'); get()._setMessage('No hints available!', 'error'); return }
    if (hints <= 0)             { set({ showShop: true }); return }

    const word    = hintable[Math.floor(Math.random() * hintable.length)]
    const revealed = hintedSlots[word] ?? []
    const nextIdx  = word.split('').findIndex((_, i) => !revealed.includes(i))
    if (nextIdx === -1) return

    set({
      hintedSlots: { ...hintedSlots, [word]: [...revealed, nextIdx] },
      hints: hints - 1,
      levelHintsUsed: get().levelHintsUsed + 1,
    })
    playSfx('hint')
    get()._setMessage('Hint deployed!', 'info')
  },

  // ── Shop ──────────────────────────────────────────────────────────────────

  openShop:  () => set({ showShop: true }),
  closeShop: () => set({ showShop: false }),

  buyPack: (hintsAmt, cost) => {
    const { galaBalance, hints } = get()
    if (galaBalance < cost) { playSfx('wordInvalid'); get().showToast('⚠ Insufficient GALA balance'); return }
    set({ galaBalance: galaBalance - cost, hints: hints + hintsAmt, showShop: false })
    playSfx('purchase')
    get().showToast(`✓ ${hintsAmt} hints added · ${cost.toLocaleString()} GALA spent`)
  },

  // ── Daily Timer ───────────────────────────────────────────────────────────

  tickTimer: () => {
    const { dailySecondsLeft, gameMode, screen } = get()
    if (gameMode !== 'daily' || screen !== 'game') return
    if (dailySecondsLeft <= 1) get().triggerDailyLose()
    else set({ dailySecondsLeft: dailySecondsLeft - 1 })
  },

  triggerDailyWin: () => {
    playSfx('dailyWin')
    useProgressStore.getState().setDailyAttempt('won')
    set({ dailyComplete: true, hints: get().hints + DAILY_HINT_REWARD })
  },
  triggerDailyLose: () => {
    playSfx('dailyLose')
    useProgressStore.getState().setDailyAttempt('lost')
    set({ dailyFailed: true, dailySecondsLeft: 0 })
  },

  // ── Daily quit-confirm flow ───────────────────────────────────────────────
  // Pressing back/menu mid-daily opens a confirm popup so the user doesn't
  // accidentally abandon their attempt. Forfeit just exits to splash — the
  // daily is unchanged for today and can be retried from the splash screen
  // until the 24h window naturally rolls over at midnight.
  requestQuitDaily: () => set({ showQuitConfirm: true }),
  cancelQuitDaily:  () => set({ showQuitConfirm: false }),
  confirmQuitDaily: () => {
    // Quitting mid-daily counts as a lost attempt — the daily locks until
    // midnight unless the player spends 1 GALA to retry.
    useProgressStore.getState().setDailyAttempt('lost')
    set({ showQuitConfirm: false })
    get().goToSplash()
  },

  // Pay 1 GALA to clear today's "lost" daily attempt and immediately enter
  // a fresh run. Returns true on success.
  payToRetryDaily: () => {
    const { galaBalance } = get()
    const attempt = useProgressStore.getState().getTodaysDailyAttempt()
    if (!attempt || attempt.status !== 'lost') return false
    if (galaBalance < 1) {
      playSfx('wordInvalid')
      get().showToast('⚠ Need 1 GALA to retry the daily')
      return false
    }
    set({ galaBalance: galaBalance - 1 })
    useProgressStore.getState().clearDailyAttempt()
    playSfx('purchase')
    get().showToast('✓ Daily retry purchased · 1 GALA spent')
    // Hop straight into a fresh daily run.
    get().goToGame('daily')
    return true
  },

  // ── UI Helpers ────────────────────────────────────────────────────────────

  _setMessage: (message, messageType) => {
    set({ message, messageType })
    setTimeout(() => {
      if (get().message === message) set({ message: '', messageType: '' })
    }, 2000)
  },

  showToast: (toast) => {
    set({ toast })
    setTimeout(() => { if (get().toast === toast) set({ toast: '' }) }, 2800)
  },

  clearToast: () => set({ toast: '' }),

  // ── SFX ───────────────────────────────────────────────────────────────────
  // Toggle stored in the SFX module (which also persists to localStorage); we
  // mirror it into Zustand state so React components re-render on change.
  toggleSfxMuted: () => {
    const next = !get().sfxMuted
    setSfxMuted(next)
    set({ sfxMuted: next })
    // Touching audio on the same user-gesture tick keeps autoplay policy happy.
    if (!next) unlockSfx()
  },
}))

// ── Persistence subscription ─────────────────────────────────────────────────
// Whenever galaBalance or hints change, mirror the new values to localStorage.
// We compare against a snapshot to avoid writing on unrelated state changes
// (the splash countdown, message toasts, etc. would all otherwise trigger a
// write on every frame).

let lastEconomy = { galaBalance: useGameStore.getState().galaBalance, hints: useGameStore.getState().hints }
useGameStore.subscribe((state) => {
  if (state.galaBalance !== lastEconomy.galaBalance || state.hints !== lastEconomy.hints) {
    lastEconomy = { galaBalance: state.galaBalance, hints: state.hints }
    saveEconomy(lastEconomy)
  }
})

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectCurrentLevel = (s: GameStore) =>
  s.levels[s.currentLevelIndex % (s.levels.length || 1)]

export const selectFoundCount = (s: GameStore) => {
  const lvl = selectCurrentLevel(s)
  return lvl ? lvl.words.filter(w => s.foundWords.has(w)).length : 0
}

export const selectProgress = (s: GameStore) => {
  const lvl = selectCurrentLevel(s)
  if (!lvl || !lvl.words.length) return 0
  return selectFoundCount(s) / lvl.words.length
}

export const selectCurrentWordState = (s: any): 'valid' | 'invalid' | '' =>
  s._currentWordState ?? ''

export const selectLevelComplete = (s: any): boolean =>
  s._levelComplete ?? false

export const selectClearLevelComplete = () =>
  useGameStore.setState({ _levelComplete: false } as any)
