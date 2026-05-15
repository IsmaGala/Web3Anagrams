import { create } from 'zustand'
import type { GameState, GameMode, Level, MessageType } from '../types'
import type { WorldId } from '../data/worlds'
import {
  arrangeLevels, pickDailyLevel, getSessionSeed,
  wordScore, wordFeedback, validateLevel,
  DAILY_DURATION, DAILY_HINT_REWARD, updateStreak,
  MIN_WORDS_PER_LEVEL,
  computeScoreBreakdown,
  pickDailyWordMix,
} from '../utils/gameUtils'
import { playSfx, isSfxMuted, setSfxMuted, unlockSfx } from '../utils/sfx'
import { useProgressStore } from './progressStore'
import { WORLDS } from '../data/worldData'

function saveProgress(worldId: string, levelIndex: number, score: number) {
  try {
    useProgressStore.getState().markLevelComplete(worldId as any, levelIndex, score)
    console.log(`✅ Progress saved: ${worldId} level ${levelIndex} score ${score}`)
  } catch (e) {
    console.warn('❌ Could not save progress:', e)
  }
}

/** Fire-and-forget leaderboard submission. Called after the local breakdown
 *  is committed to progressStore. No-ops gracefully when:
 *    • the world isn't an event world
 *    • the player isn't connected / not signed in
 *    • the network/server is unavailable (we don't want game UX to depend on it)
 *
 *  We submit the player's CUMULATIVE score across every completed level in
 *  this event — not just the level that was just finished — so the server
 *  leaderboard reflects the same total the player sees locally. The server
 *  keeps GREATEST per (address, event_id, week_id), so a late improvement
 *  to any level pushes the rank up; a regression keeps the prior best. */
function submitEventScoreIfApplicable(worldId: string, _justFinishedScore: number) {
  // Lazy lookup of the world so the import graph stays simple.
  import('../data/worldData').then(({ WORLDS: ALL }) => {
    const world = ALL.find(w => w.id === worldId)
    if (!world?.event) return
    return import('./walletStore').then(({ useWalletStore }) => {
      if (!useWalletStore.getState().jwt) return
      // Read AFTER markLevelComplete has committed (the caller did that
      // synchronously before invoking us). The total reflects best-of-attempts
      // per level, summed across every completed level in this event world.
      const totalScore = useProgressStore.getState().getTotalScore(worldId as any)
      return import('../utils/apiClient').then(({ api }) =>
        api.post('/api/leaderboard/score', { eventId: worldId, score: totalScore })
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

// DAILY_HINT_REWARD now lives in utils/gameUtils.ts so the on-screen
// reward badge in DailyWinOverlay and the actual hint credit here can't
// drift apart. Edit it there and both surfaces update.
const INITIAL_HINTS     = 3
// New players start with no Gems — they earn them by completing free worlds
// (see WORLDS[].completionReward) and by winning the daily, or buy them in
// the Gem Store. Existing players keep whatever balance is in localStorage;
// only fresh installs (or a debug-menu wipe) see this default.
const INITIAL_GEMS      = 0

// ── Local economy persistence ────────────────────────────────────────────────
// Gems are the in-game currency the player spends on hints, premium worlds,
// and event entries. They're purchased with real GALA / GUSDC tokens via the
// in-game store (see /api/store/purchase) or earned through gameplay.
//
// Persistence: mirrored to localStorage so a page reload (or MetaMask
// switching accounts, which can trigger one) doesn't reset the balance.
// The server's player_state is the cross-device source of truth and overrides
// the local copy on next sync.
//
// Legacy migration: pre-v4 the field was `galaBalance`. We read both keys
// when hydrating so existing localStorage entries upgrade transparently —
// no player loses their balance on the cutover.

const ECONOMY_KEY = 'wc_economy_v1'

interface PersistedEconomy { gemsBalance: number; hints: number }

function loadEconomy(): PersistedEconomy {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ECONOMY_KEY) : null
    if (!raw) return { gemsBalance: INITIAL_GEMS, hints: INITIAL_HINTS }
    const obj = JSON.parse(raw) as Partial<PersistedEconomy> & { galaBalance?: number }
    // Prefer the new `gemsBalance` field; fall back to the legacy
    // `galaBalance` field for forward-compat with pre-v4 localStorage.
    const balance = typeof obj.gemsBalance === 'number' && obj.gemsBalance >= 0
      ? obj.gemsBalance
      : typeof obj.galaBalance === 'number' && obj.galaBalance >= 0
        ? obj.galaBalance
        : INITIAL_GEMS
    return {
      gemsBalance: balance,
      hints:       typeof obj.hints === 'number' && obj.hints >= 0 ? obj.hints : INITIAL_HINTS,
    }
  } catch { return { gemsBalance: INITIAL_GEMS, hints: INITIAL_HINTS } }
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
  useGameStore.setState({ gemsBalance: INITIAL_GEMS, hints: INITIAL_HINTS })
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
  goToStore:       () => void
  // Premium
  purchaseWorld:   (worldId: string, cost: number) => boolean
  // Weekly events
  purchaseEvent:   (worldId: string, cost: number) => boolean
  // Daily retry
  payToRetryDaily: () => boolean

  // World-completion reward flow
  /** worldId currently waiting for the player to accept its completion
   *  bounty via WorldRewardOverlay. Null when nothing is pending. */
  pendingWorldRewardId:        string | null
  /** Scan every world for an unclaimed-but-eligible completion bounty
   *  and queue the first hit. Used on app mount and after cross-device
   *  sync so retroactive rewards surface without requiring a level replay. */
  scanForUnclaimedWorldRewards: () => void
  /** Player tapped CLAIM on the reward modal: atomically claim, credit
   *  Gems, then re-scan in case there are more queued. */
  acceptWorldReward:           () => void

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
  gemsBalance:       loadEconomy().gemsBalance,
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
  pendingWorldRewardId: null,

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
    const msg     = isDaily ? '⏱ 5 minutes — no hints!' : `Find ${lvl.words.length} words!`
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
      // long/mid/short set (DAILY_WORDS_TARGET = 8) so the daily feels
      // distinct from a regular level — same rules for everyone since the
      // underlying word list is deterministic.
      const dailyLevel = { ...picked, words: pickDailyWordMix(picked.words, picked.theme) }
      updateStreak()
      set({ gameMode: mode, screen: 'game', levels: [dailyLevel], currentLevelIndex: 0, score: 0 })
      setTimeout(() => get().initLevel(), 0)
    } else {
      set({ screen: 'worldSelect' })
    }
  },

  goToSplash: () => {
    set({
      screen:            'splash',
      currentLevelIndex: 0,
      dailyComplete:     false,
      dailyFailed:       false,
      dailySecondsLeft:  DAILY_DURATION,
      showQuitConfirm:   false,
    })
    // Whenever we leave the game screen, re-scan. If a level completion
    // legitimately filled the last slot in a world but the queue inside
    // submitWord failed to fire (or pendingWorldRewardId was somehow
    // cleared by an unrelated state update), this safety net catches it
    // and pops the modal on the splash.
    get().scanForUnclaimedWorldRewards()
  },

  goToLevelSelect: () => {
    set({
      screen:        'levelSelect',
      dailyComplete: false,
      dailyFailed:   false,
    })
    // Same safety-net rescan as goToSplash — by the time we land back
    // on the level select grid, any newly-completed world will surface
    // its bounty popup even if the immediate in-submitWord queue missed.
    get().scanForUnclaimedWorldRewards()
  },

  // Navigate to the premium (paid worlds) storefront.
  goToPremium: () => set({ screen: 'premium' }),

  // Navigate to the weekly events hub.
  goToEvents: () => set({ screen: 'events' }),

  // Navigate to the gem store (buy Gems with GALA or GUSDC tokens).
  goToStore: () => set({ screen: 'store' }),

  // Spend Gems to unlock the current week's event. The unlock resets every
  // Monday (Mon-16:00-PST-anchored week). Returns true if purchase succeeded.
  purchaseEvent: (worldId, cost) => {
    const { gemsBalance } = get()
    if (gemsBalance < cost) {
      playSfx('wordInvalid')
      get().showToast('⚠ Not enough Gems')
      return false
    }
    set({ gemsBalance: gemsBalance - cost })
    useProgressStore.getState().unlockEventForWeek(worldId as any)
    playSfx('purchase')
    get().showToast(`✓ Event unlocked · ${cost} Gems spent`)
    return true
  },

  // ── World-completion reward flow ─────────────────────────────────────────
  // Two-step contract:
  //   1. scanForUnclaimedWorldRewards / submitWord flag a world as pending
  //      by setting `pendingWorldRewardId`.
  //   2. The player taps CLAIM in the modal → acceptWorldReward atomically
  //      claims the bounty in progressStore and credits the Gems here.

  scanForUnclaimedWorldRewards: () => {
    // Don't stomp an already-queued reward. The modal will scan again
    // after the player accepts it, so any extra pending rewards (e.g. a
    // player who pre-cleared multiple worlds before this feature shipped)
    // surface one at a time.
    if (get().pendingWorldRewardId) return
    const progress = useProgressStore.getState()
    for (const world of WORLDS) {
      if (!world.completionReward || world.completionReward <= 0) continue
      if (progress.isWorldCompletionRewardClaimed(world.id)) continue
      // Two-stage eligibility, OR'd so the more lenient signal also fires:
      //   • completedCount >= raw levelCount (matches the original intent
      //     when no levels get filtered out by playableLevel).
      //   • every level the world ships has a progress entry marked
      //     completed (covers the case where the raw count is unreachable
      //     because some level failed validation — using `world.levels`
      //     here, not the player's loaded `levels`, so the scan works on
      //     any screen regardless of what's currently loaded in state).
      const completed = progress.getCompletedCount(world.id)
      const worldLevels = progress.worlds[world.id]?.levels ?? {}
      const everyLevelDone = world.levels.length > 0
        && world.levels.every((_, i) => worldLevels[i]?.completed)
      if (completed >= world.levelCount || everyLevelDone) {
        set({ pendingWorldRewardId: world.id })
        return
      }
    }
  },

  acceptWorldReward: () => {
    const id = get().pendingWorldRewardId
    if (!id) return
    // Atomic check-and-mark — returns 0 if the reward was somehow already
    // claimed (e.g. duplicate tap, cross-device race), guarding against
    // double-credit.
    const bounty = useProgressStore.getState().claimWorldCompletionReward(id as WorldId)
    if (bounty > 0) {
      set({ gemsBalance: get().gemsBalance + bounty })
      playSfx('purchase')
    }
    set({ pendingWorldRewardId: null })
    // A player can have multiple unclaimed rewards stacked up (e.g. they
    // pre-cleared Town Star + Mirandus before this feature shipped). Pop
    // the next one immediately so they get a sequence of "WORLD COMPLETE"
    // celebrations rather than having to navigate away and back.
    get().scanForUnclaimedWorldRewards()
  },

  // Spend Gems to unlock a premium world. Returns true if purchase succeeded.
  // The actual unlock is persisted in progressStore so it survives reloads.
  purchaseWorld: (worldId, cost) => {
    const { gemsBalance } = get()
    if (gemsBalance < cost) {
      playSfx('wordInvalid')
      get().showToast('⚠ Not enough Gems')
      return false
    }
    set({ gemsBalance: gemsBalance - cost })
    useProgressStore.getState().markPremiumUnlocked(worldId as any)
    playSfx('purchase')
    get().showToast(`✓ World unlocked · ${cost.toLocaleString()} Gems spent`)
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
        // One-time world-completion Gem bounty. We don't pay it directly
        // here — instead we queue the world as a pending reward so the
        // WorldRewardOverlay can confirm the grant with the player. The
        // overlay's CLAIM button calls acceptWorldReward, which is what
        // actually atomically claims + credits the Gems. Queuing only — we
        // do NOT modify worldCompletionClaimed yet.
        //
        // Eligibility: only single-player mode (daily plays a one-off level
        // from any world; we don't want a daily win to falsely complete the
        // _worldId carried over from the player's last single-player session)
        // AND every level that's actually been LOADED for this world is
        // marked complete. Loaded levels are what the player can reach —
        // checking those instead of `world.levelCount` covers the case where
        // some raw levels were filtered out by `playableLevel` validation
        // and the player can't physically reach the raw count.
        // Narrow the loosely-typed `_worldId: string` from the store back
        // to the literal-union `WorldId` so the indexes below are well-typed.
        // The store keeps it as `string` to dodge a circular import on the
        // type definition; the cast here is the single bridge point.
        const wid = _worldId as WorldId
        const world = WORLDS.find(w => w.id === wid)
        const reward = world?.completionReward ?? 0
        if (gameMode !== 'daily'
            && reward > 0
            && !useProgressStore.getState().isWorldCompletionRewardClaimed(wid)) {
          const worldProgress = useProgressStore.getState().worlds[wid]?.levels ?? {}
          const allLoadedDone = levels.length > 0 && levels.every((_, i) => worldProgress[i]?.completed)
          if (allLoadedDone) {
            set({ pendingWorldRewardId: _worldId })
          }
        }
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
    const { gemsBalance, hints } = get()
    if (gemsBalance < cost) { playSfx('wordInvalid'); get().showToast('⚠ Not enough Gems'); return }
    set({ gemsBalance: gemsBalance - cost, hints: hints + hintsAmt, showShop: false })
    playSfx('purchase')
    get().showToast(`✓ ${hintsAmt} hints added · ${cost.toLocaleString()} Gems spent`)
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
    // midnight unless the player spends 1 Gem to retry.
    useProgressStore.getState().setDailyAttempt('lost')
    set({ showQuitConfirm: false })
    get().goToSplash()
  },

  // Pay 1 Gem to clear today's "lost" daily attempt and immediately enter
  // a fresh run. Returns true on success.
  payToRetryDaily: () => {
    const { gemsBalance } = get()
    const attempt = useProgressStore.getState().getTodaysDailyAttempt()
    if (!attempt || attempt.status !== 'lost') return false
    if (gemsBalance < 1) {
      playSfx('wordInvalid')
      get().showToast('⚠ Need 1 Gem to retry the daily')
      return false
    }
    set({ gemsBalance: gemsBalance - 1 })
    useProgressStore.getState().clearDailyAttempt()
    playSfx('purchase')
    get().showToast('✓ Daily retry purchased · 1 Gem spent')
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
// Whenever gemsBalance or hints change, mirror the new values to localStorage.
// We compare against a snapshot to avoid writing on unrelated state changes
// (the splash countdown, message toasts, etc. would all otherwise trigger a
// write on every frame).

let lastEconomy = { gemsBalance: useGameStore.getState().gemsBalance, hints: useGameStore.getState().hints }
useGameStore.subscribe((state) => {
  if (state.gemsBalance !== lastEconomy.gemsBalance || state.hints !== lastEconomy.hints) {
    lastEconomy = { gemsBalance: state.gemsBalance, hints: state.hints }
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
