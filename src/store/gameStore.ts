import { create } from 'zustand'
import type { GameState, GameMode, Level, MessageType, RoundState, SlotState, ScoreBreakdown } from '../types'
import type { WorldId } from '../data/worlds'
import {
  arrangeLevels, pickDailyLevel, getSessionSeed,
  wordScore, wordFeedback, validateLevel,
  DAILY_DURATION, DAILY_RETRY_COST, updateStreak,
  MIN_WORDS_PER_LEVEL,
  computeScoreBreakdown,
  pickDailyWordMix,
  getDailyLevelIndex,
  currentWeekId,
} from '../utils/gameUtils'
import { DAILY_POOL_SIZE } from '../data/dailyLevels'
import { playSfx, isSfxMuted, setSfxMuted, unlockSfx } from '../utils/sfx'
import { startBgm, isBgmMuted, setBgmMuted } from '../utils/bgm'
import { useProgressStore } from './progressStore'
import { useCosmeticsStore } from './cosmeticsStore'
import type { WheelSkinId } from '../skins'
import { WORLDS } from '../data/worldData'
import {
  isServerAuthoritative, startLevel as apiStartLevel,
  submitWord as apiSubmitWord, requestHint as apiRequestHint,
} from '../utils/playClient'
import { spendGems as apiSpendGems } from '../utils/economyClient'

// ── Server-authoritative slot helpers ────────────────────────────────────────
// The server identifies slots by (len, ordinal). To turn a SlotState array
// into something the WordGrid can render row-by-row, we group by length and
// sort within each group by ordinal — same ordering the server uses.

function buildEmptySlots(slotLengths: number[]): SlotState[] {
  const byLen: Record<number, number> = {}
  return slotLengths.map(len => {
    const ord = (byLen[len] = (byLen[len] ?? 0))
    byLen[len] = ord + 1
    return { len, ordinal: ord, hinted: [] }
  })
}

function applyFilledSlot(
  slots:    SlotState[],
  slotRef:  { len: number; ordinal: number },
  word:     string,
  def:      string,
): SlotState[] {
  return slots.map(s =>
    s.len === slotRef.len && s.ordinal === slotRef.ordinal
      ? { ...s, filled: { word, def } }
      : s,
  )
}

function applyHintReveal(
  slots:   SlotState[],
  slotRef: { len: number; ordinal: number },
  reveal:  { position: number; letter: string },
): SlotState[] {
  return slots.map(s =>
    s.len === slotRef.len && s.ordinal === slotRef.ordinal
      ? { ...s, hinted: [...s.hinted, reveal] }
      : s,
  )
}

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
  goToWardrobe:    () => void
  // Premium — async because each spend round-trips to /api/economy/spend
  // so the server is authoritative on gem balance. Returns true on success,
  // false on insufficient gems, throws on network/auth errors (caller
  // handles via try/catch).
  purchaseWorld:   (worldId: string, cost: number) => Promise<boolean>
  // Weekly events
  purchaseEvent:   (worldId: string, cost: number) => Promise<boolean>
  // Cosmetics (Wardrobe screen)
  /** Spend Gems server-side and grant the skin via the cosmetics store.
   *  Returns true if the player just unlocked it, false if they already
   *  owned it or couldn't afford it. */
  purchaseSkin:    (skinId: string, cost: number) => Promise<boolean>
  // Daily retry
  payToRetryDaily: () => Promise<boolean>

  // First-wallet welcome bonus popup
  /** Non-null when the server just granted a first-wallet bonus for this
   *  address. WelcomeBonusOverlay reads this and clears it on dismiss. */
  pendingWelcomeBonus: { gems: number; hints: number } | null
  setPendingWelcomeBonus: (bonus: { gems: number; hints: number } | null) => void

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
  /** Locally shuffle the wheel letter order so the player can un-jam combos.
   *  Visual-only — solution words unchanged. Resets on every new level/round. */
  shuffleLetters:  () => void
  shuffledLetters: string[] | null

  // Internal helpers (declared in interface so get() can call them)
  _updateCurrentWord: (sel: number[]) => void
  _setMessage:        (msg: string, type: MessageType) => void

  // Word submission
  submitWord: () => void
  useHint:    () => void

  // Shop
  openShop:  () => void
  closeShop: () => void
  buyPack:   (hints: number, cost: number) => Promise<void>

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

  // BGM
  toggleBgmMuted: () => void
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
  bgmMuted:          isBgmMuted(),
  pendingWelcomeBonus: null,
  setPendingWelcomeBonus: (bonus) => set({ pendingWelcomeBonus: bonus }),

  pendingWorldRewardId: null,

  round:             null,
  shuffledLetters:   null,

  setScreen:  (screen) => set({ screen } as any),
  setWorldId: (id) => set({ selectedWorldId: id, _worldId: id }),

  // ── Load & init ──────────────────────────────────────────────────────────

  loadLevels: (raw) => {
    // Server-authoritative mode: the bundled levels are length-only
    // placeholders (no `words`/`bonus`/`letters`/`theme` after the bundle
    // strip), so client-side validation would filter every level out as
    // "below MIN_WORDS_PER_LEVEL". The server handles all validation now;
    // we just preserve the array shape so currentLevelIndex math works.
    if (isServerAuthoritative()) {
      set({ allLevels: raw, levels: raw })
      return
    }
    const validated = raw.map(validateLevel).filter(playableLevel)
    const seed      = getSessionSeed()
    const arranged  = arrangeLevels(validated, seed)
    set({ allLevels: arranged, levels: arranged })
  },

  // Load a specific world's levels in fixed order — no shuffle
  loadWorldLevels: (raw: Level[]) => {
    if (isServerAuthoritative()) {
      set({ levels: raw })
      return
    }
    const validated = raw.map(validateLevel).filter(playableLevel)
    set({ levels: validated })
  },

  initLevel: () => {
    const { levels, currentLevelIndex, gameMode, _worldId } = get()
    if (!levels.length) return
    const isDaily = gameMode === 'daily'

    // Common reset (applies in both modes). The mode-specific bits — the
    // message text and any async round bootstrap — follow.
    set({
      foundWords:      new Set(),
      hintedSlots:     {},
      selected:        [],
      dragging:        false,
      levelMisses:     0,
      levelHintsUsed:  0,
      levelStartTime:  Date.now(),
      lastBreakdown:   undefined,
      score:           0,
      currentWord:     '',
      wordDef:         '',
      dailySecondsLeft: DAILY_DURATION,
      dailyComplete:   false,
      dailyFailed:     false,
      round:           null,
      shuffledLetters: null,
    })

    // ── Server-authoritative path ─────────────────────────────────────────
    // Kick off a fire-and-forget round-start request. The UI shows a brief
    // "Connecting…" message while we wait; on response we populate the
    // round and trigger the standard "Find N words!" message.
    if (isServerAuthoritative()) {
      set({ message: 'Connecting…', messageType: 'info' })
      apiStartLevel({ worldId: _worldId, levelIndex: currentLevelIndex, mode: gameMode })
        .then(({ roundId, manifest, balances }) => {
          // Reset levelStartTime to NOW that we actually started — the server
          // has its own start timestamp but the UI feels less laggy if local
          // elapsed-time starts when the manifest arrives, not when the
          // request fired. The server-side breakdown overrides this anyway
          // on completion.
          const round: RoundState = {
            roundId,
            manifest,
            slots:      buildEmptySlots(manifest.slotLengths),
            bonusFound: [],
          }
          const msg = isDaily ? '⏱ 5 minutes — no hints!' : `Find ${manifest.slotCount} words!`
          set({
            round,
            levelStartTime: Date.now(),
            message:        msg,
            messageType:    isDaily ? 'error' : 'info',
            gemsBalance:    balances.gems,
            hints:          balances.hints,
          })
          setTimeout(() => {
            if (get().message === msg) set({ message: '', messageType: '' })
          }, 2000)
        })
        .catch(err => {
          // Network/auth failures shouldn't softlock the level. Surface a
          // visible error and let the player back out via the splash button.
          console.warn('apiStartLevel failed:', err)
          set({ message: 'Connection error — please retry', messageType: 'error' })
        })
      return
    }

    // ── Legacy path ───────────────────────────────────────────────────────
    const lvl = levels[currentLevelIndex % levels.length]
    const msg = isDaily ? '⏱ 5 minutes — no hints!' : `Find ${lvl.words.length} words!`
    set({ message: msg, messageType: isDaily ? 'error' : 'info' })
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

      // Server-authoritative mode: the bundled levels are length-only
      // placeholders, so we can't pick a daily level locally. We instead
      // tell the server which slot of the dedicated daily pool to serve.
      //
      // Routing:
      //   • worldId          → 'daily' (resolves to DAILY_LEVELS on the
      //                        server, NOT a player-facing world)
      //   • currentLevelIndex → getDailyLevelIndex(DAILY_POOL_SIZE), a
      //                        calendar-deterministic 0..N-1 index so every
      //                        player gets the same puzzle on the same day
      //
      // Expansion: when we add additional daily pools (e.g. "Space"),
      // either rotate the worldId here based on weekday / week-id, or pass
      // a `poolId` through the start endpoint and have the server pick
      // the array.
      if (isServerAuthoritative()) {
        updateStreak()
        const dailyIndex = getDailyLevelIndex(DAILY_POOL_SIZE)
        const placeholder = {} as Level
        set({
          gameMode:          mode,
          screen:            'game',
          levels:            [placeholder],
          currentLevelIndex: dailyIndex,
          _worldId:          'daily',
          score:             0,
        })
        setTimeout(() => get().initLevel(), 0)
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

  // Navigate to the Wardrobe screen (cosmetic skins — equip / buy with Gems).
  goToWardrobe: () => set({ screen: 'wardrobe' }),

  // Purchase a wheel skin with Gems. The Wardrobe screen is the caller —
  // it knows the skin's `price` (from skins/<name>.ts) and calls this
  // after the player confirms. We do the affordability check and the
  // grant atomically here so a doubled-up tap can't double-grant.
  //
  // No-op (and returns false) when the player already owns the skin,
  // can't afford it, or passes a price ≤ 0. Toast surfaces in the
  // Wardrobe; we keep this action focused on the state mutation.
  purchaseSkin: async (skinId, cost) => {
    if (!skinId || cost <= 0) return false
    const cosmetics = useCosmeticsStore.getState()
    if (cosmetics.ownsSkin(skinId as WheelSkinId)) return false
    try {
      const resp = await apiSpendGems({
        amount:   cost,
        reason:   'cosmetic_skin',
        metadata: { skinId },
      })
      if (!resp.ok) {
        set({ gemsBalance: resp.newBalance })
        return false
      }
      set({ gemsBalance: resp.newBalance })
      cosmetics.grantSkin(skinId as WheelSkinId)
      cosmetics.setWheelSkin(skinId as WheelSkinId)
      return true
    } catch (err) {
      console.warn('purchaseSkin failed:', err)
      return false
    }
  },

  // Spend Gems to unlock the current week's event. The unlock resets every
  // Monday (Mon-16:00-PST-anchored week). Returns true if purchase succeeded.
  purchaseEvent: async (worldId, cost) => {
    try {
      const resp = await apiSpendGems({
        amount:   cost,
        reason:   'unlock_event',
        metadata: { worldId, weekId: currentWeekId() },
      })
      if (!resp.ok) {
        set({ gemsBalance: resp.newBalance })
        playSfx('wordInvalid')
        get().showToast('⚠ Not enough Gems')
        return false
      }
      set({ gemsBalance: resp.newBalance })
      useProgressStore.getState().unlockEventForWeek(worldId as any)
      playSfx('purchase')
      get().showToast(`✓ Event unlocked · ${cost} Gems spent`)
      return true
    } catch (err) {
      console.warn('purchaseEvent failed:', err)
      playSfx('wordInvalid')
      get().showToast('⚠ Connection error')
      return false
    }
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
    // As of milestone 2 (server-authoritative gems), the bounty has ALREADY
    // been granted by the time this overlay surfaces — the server credits
    // it inside /api/play/level/submit-word when the round that completes
    // the world lands, and the client's gemsBalance is bumped in the
    // submit-word .then() handler from `resp.grants.worldCompletion`. The
    // claimWorldCompletionReward call below is still useful as a guard:
    // it returns 0 (no-op) if the world was already marked claimed locally,
    // which is the common case post-milestone-2. The CLAIM tap is now a
    // purely celebratory UI step — sound + dismiss + advance to the next
    // queued reward.
    //
    // Legacy fallback path: for very old players whose world completion
    // PREDATES milestone 2 and was never granted server-side (the
    // /api/play/level/submit-word grant only fires on a fresh completion),
    // `claimWorldCompletionReward` will still return >0 and we'll add the
    // local bounty as before. This keeps retroactive rewards intact.
    const bounty = useProgressStore.getState().claimWorldCompletionReward(id as WorldId)
    if (bounty > 0) {
      // Only reached for the retroactive/legacy case described above.
      set({ gemsBalance: get().gemsBalance + bounty })
    }
    playSfx('purchase')
    set({ pendingWorldRewardId: null })
    // Multiple stacked rewards: pop the next one immediately so the player
    // gets a sequence of celebrations.
    get().scanForUnclaimedWorldRewards()
  },

  // Spend Gems to unlock a premium world. Returns true if purchase succeeded.
  // The actual unlock is persisted in progressStore so it survives reloads.
  //
  // Server-authoritative as of milestone 2: the gem debit happens on the
  // server (via /api/economy/spend), and the response carries the new
  // authoritative balance. If localStorage was tampered to show inflated
  // gems, the server still rejects spends the player can't afford.
  purchaseWorld: async (worldId, cost) => {
    try {
      const resp = await apiSpendGems({
        amount:   cost,
        reason:   'unlock_premium',
        metadata: { worldId },
      })
      if (!resp.ok) {
        // Server says "insufficient" — sync local balance to its truth
        // (which may be lower than the client believed) and bail.
        set({ gemsBalance: resp.newBalance })
        playSfx('wordInvalid')
        get().showToast('⚠ Not enough Gems')
        return false
      }
      set({ gemsBalance: resp.newBalance })
      useProgressStore.getState().markPremiumUnlocked(worldId as any)
      playSfx('purchase')
      get().showToast(`✓ World unlocked · ${cost.toLocaleString()} Gems spent`)
      return true
    } catch (err) {
      console.warn('purchaseWorld failed:', err)
      playSfx('wordInvalid')
      get().showToast('⚠ Connection error')
      return false
    }
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

  shuffleLetters: () => {
    const current = selectActiveLetters(get() as any)
    if (!current.length) return
    const arr = [...current]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    set({ shuffledLetters: arr, selected: [], currentWord: '', wordDef: '' })
  },

  _updateCurrentWord: (sel) => {
    const { levels, currentLevelIndex, round } = get()

    // Server-authoritative mode: the client doesn't know the answer set, so
    // we can only show the word being typed — no valid/invalid color hint.
    // (A future tweak could optionally ask the server for a "prefix-of-any-
    // valid-word" answer, but the round-trip cost outweighs the UX gain.)
    // Always read from the displayed letter order — if the player shuffled,
    // selectActiveLetters returns shuffledLetters, so indices stay consistent
    // with what the wheel is actually showing.
    const activeLetters = selectActiveLetters(get() as any)

    if (round) {
      const word = sel.map(i => activeLetters[i]).join('')
      set({ currentWord: word, _currentWordState: '' } as any)
      return
    }

    const lvl = levels[currentLevelIndex % levels.length]
    if (!lvl) return
    // Bundle-strip guard: with stripped placeholder Levels, `letters` /
    // `words` / `bonus` may be undefined. Render the partial word from
    // whatever letters we have (none, in practice — wheel won't show
    // letters either) and skip the valid/invalid check.
    if (!lvl.letters) { set({ currentWord: '', _currentWordState: '' } as any); return }
    const word      = sel.map(i => activeLetters[i]).join('')
    const allWords  = lvl.words && lvl.bonus ? [...lvl.words, ...lvl.bonus] : []
    const wordState = word.length >= 2 && allWords.length > 0 ? (allWords.includes(word) ? 'valid' : 'invalid') : ''
    set({ currentWord: word, _currentWordState: wordState } as any)
  },

  // ── Word Submission ───────────────────────────────────────────────────────

  submitWord: () => {
    const { levels, currentLevelIndex, selected, foundWords, score, gameMode, _worldId, round } = get()

    // ── Server-authoritative path ─────────────────────────────────────────
    // Build the word from the manifest letters (the wheel renders those in
    // server mode), POST to /api/play/level/submit-word, and apply the
    // response. The server decides every outcome — including completion.
    if (round) {
      // Use selectActiveLetters so a player-triggered shuffle is respected —
      // indices in `selected` always refer to whatever the wheel is displaying.
      const activeLetters = selectActiveLetters(get() as any)
      const word = selected.map(i => activeLetters[i]).join('').toUpperCase()
      set({ selected: [], currentWord: '', _currentWordState: '' } as any)
      if (word.length < 2) return

      // ── Optimistic feedback ────────────────────────────────────────────
      // The submit-word round-trip is ~50–150ms once the function is warm.
      // To make the wheel feel instant we play the success/duplicate sound
      // and show the feedback message NOW, based on local-only signals:
      //   • If `word` is already in foundWords → predict 'duplicate'
      //   • Else if `word.length` matches an unfilled slot → predict 'success'
      //   • Otherwise stay silent (server will fire the correct feedback)
      //
      // The authoritative score / slot fill / def still come from the
      // server response — we deliberately don't optimistically fill the
      // slot to avoid the visual "letter jumps between rows of the same
      // length" glitch when the server's alphabetical ordinal disagrees
      // with our first-unfilled guess. Score isn't bumped optimistically
      // either, so a rejection doesn't cause a visible score bounce.
      //
      // The `optimistic` tracker lets the .then() handler skip duplicate
      // sound/message playback when we already fired them speculatively.
      const alreadyFound    = get().foundWords.has(word)
      const hasMatchingSlot = round.slots.some(s => !s.filled && s.len === word.length)
      let optimistic: 'success' | 'duplicate' | 'silent' = 'silent'
      if (alreadyFound) {
        playSfx('wordRepeat')
        get()._setMessage('Already found!', 'error')
        optimistic = 'duplicate'
      } else if (hasMatchingSlot) {
        playSfx('wordValid')
        get()._setMessage(wordFeedback(word), 'great')
        optimistic = 'success'
      }

      apiSubmitWord({ roundId: round.roundId, word })
        .then(resp => {
          // Re-read state after the round-trip — the player may have done
          // something else in between (e.g. spent a hint).
          const r = get().round
          if (!r) return   // round was torn down mid-flight, ignore

          if (resp.result === 'duplicate') {
            // Speculative feedback already fired if we predicted dup.
            if (optimistic !== 'duplicate') {
              playSfx('wordRepeat')
              get()._setMessage('Already found!', 'error')
            }
            return
          }
          if (resp.result === 'rejected') {
            // The server tracks misses authoritatively; we mirror its count
            // so the UI breakdown preview matches. If we played the
            // wordValid sound optimistically, the rejection sound here
            // overlays it — minor audio glitch, but the player needs to
            // hear that the word was rejected.
            set({ levelMisses: resp.misses })
            playSfx('wordInvalid')
            get()._setMessage('Not in the chain', 'error')
            return
          }
          if (resp.result === 'accepted' && resp.kind === 'bonus') {
            const nextFound = new Set(get().foundWords); nextFound.add(word)
            const nextBonus = [...r.bonusFound, { word, def: resp.def }]
            set({
              foundWords: nextFound,
              score:      resp.totalScore,
              wordDef:    resp.def ? `${word}: ${resp.def}` : '',
              round:      { ...r, bonusFound: nextBonus },
            })
            // Bonus has a distinct sound + message. If optimism predicted
            // success (wordValid), we play wordBonus on top so the player
            // still hears the "this is a bonus, not a primary" cue.
            playSfx('wordBonus')
            get()._setMessage('💎 BONUS TOKEN!', 'great')
            return
          }
          // Primary word accepted
          const nextFound = new Set(get().foundWords); nextFound.add(word)
          const nextSlots = applyFilledSlot(r.slots, resp.slot, word, resp.def)
          set({
            foundWords: nextFound,
            score:      resp.totalScore,
            wordDef:    resp.def ? `${word}: ${resp.def}` : '',
            round:      { ...r, slots: nextSlots },
          })
          // Speculative feedback already fired if we predicted success.
          // Skip the redundant play; the slot fill animation is enough
          // visual confirmation that the word landed.
          if (optimistic !== 'success') {
            playSfx('wordValid')
            get()._setMessage(wordFeedback(word), 'great')
          }

          if (resp.completed && resp.breakdown) {
            // Server-authoritative breakdown. We trust `final`; the local
            // tracker fields (levelMisses, levelHintsUsed) are just for the
            // breakdown UI and may have drifted by 1 between requests —
            // override them with the server's view.
            const b = resp.breakdown as ScoreBreakdown
            set({
              lastBreakdown:  b,
              score:          b.final,
              levelMisses:    b.misses,
              levelHintsUsed: b.hintsUsed,
            })
            saveProgress(_worldId, currentLevelIndex, b.final)
            submitEventScoreIfApplicable(_worldId, b.final)

            // ── Server-issued grants ──────────────────────────────────────
            // As of milestone 2, world-completion and daily-win grants are
            // computed and applied SERVER-SIDE inside /api/play/level/
            // submit-word. The response surfaces them here so the client
            // can update its local balance and trigger the matching UI
            // (WorldRewardOverlay / DailyWinOverlay).
            //
            // World completion: server already debited—er, granted—the
            // bounty. Client's job is just to flag pendingWorldRewardId so
            // the celebration overlay surfaces. The local gem balance is
            // bumped by the grant amount (server's authoritative post-grant
            // balance isn't carried directly here — we infer it from the
            // grant `amount` field; profile pulls will reconcile any drift).
            if (resp.grants?.worldCompletion) {
              const grant = resp.grants.worldCompletion
              set({ gemsBalance: get().gemsBalance + grant.amount })
              // Mark the progress flag locally too so the overlay's "ALREADY
              // CLAIMED" guard works on subsequent visits. The server has the
              // real audit row; this is a UI cache only.
              try { useProgressStore.getState().claimWorldCompletionReward(grant.worldId as WorldId) } catch {}
              if (gameMode !== 'daily') {
                set({ pendingWorldRewardId: grant.worldId })
              }
            }

            // Daily-win hint grant — server-issued. Update local hints from
            // the delta; the daily-win overlay reads `hints` to show the
            // post-grant total.
            if (resp.grants?.dailyWin) {
              const grant = resp.grants.dailyWin
              set({ hints: get().hints + grant.hints })
            }

            setTimeout(() => {
              if (gameMode === 'daily') get().triggerDailyWin()
              else {
                playSfx('levelComplete')
                set({ _levelComplete: true } as any)
              }
            }, 600)
          }
        })
        .catch(err => {
          console.warn('apiSubmitWord failed:', err)
          get()._setMessage('Connection error', 'error')
        })
      return
    }

    // ── Legacy path ───────────────────────────────────────────────────────
    const lvl = levels[currentLevelIndex % levels.length]
    if (!lvl) return
    // Bundle-strip guard: if the bundled Level has no `letters` array, we
    // can't build a word locally. This happens when the server-authoritative
    // flag is on but `round` hasn't loaded yet (e.g. a fast click before
    // /api/play/level/start returns) — the right thing to do is silently
    // ignore the submission, since the legacy path has no useful answer set
    // to validate against anyway.
    if (!lvl.letters) { set({ selected: [], currentWord: '' } as any); return }

    const activeLetters = selectActiveLetters(get() as any)
    const word = selected.map(i => activeLetters[i]).join('')
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
    const { gameMode, hints, levels, currentLevelIndex, foundWords, hintedSlots, round } = get()
    if (gameMode === 'daily') return

    // ── Server-authoritative path ─────────────────────────────────────────
    // The server picks the slot + letter and charges the hint atomically.
    // We optimistically gate on the LOCAL hint count for instant UI feedback,
    // but the server is the real spender — a 402 response opens the shop
    // regardless of what the local count claimed.
    if (round) {
      if (hints <= 0) { set({ showShop: true }); return }
      apiRequestHint({ roundId: round.roundId })
        .then(resp => {
          const r = get().round
          if (!r) return
          const nextSlots = applyHintReveal(r.slots, resp.slot, {
            position: resp.position, letter: resp.letter,
          })
          set({
            round:          { ...r, slots: nextSlots },
            hints:          resp.hintsRemaining,
            levelHintsUsed: get().levelHintsUsed + 1,
          })
          playSfx('hint')
          get()._setMessage('Hint deployed!', 'info')
        })
        .catch(err => {
          // The server returns 402 with { reason: 'no-hints' } when the
          // player is broke — apiClient.ts throws that as an Error whose
          // message is the body's `error` field. Match on the substring so
          // we open the shop instead of just showing a toast.
          const msg = (err && (err as Error).message) || ''
          if (msg.includes('no-hints')) { set({ showShop: true }); return }
          if (msg.includes('no-hintable-slot')) {
            playSfx('wordInvalid')
            get()._setMessage('No hints available!', 'error')
            return
          }
          console.warn('apiRequestHint failed:', err)
          get()._setMessage('Connection error', 'error')
        })
      return
    }

    // ── Legacy path ───────────────────────────────────────────────────────
    const lvl = levels[currentLevelIndex % levels.length]
    if (!lvl) return
    // Bundle-strip guard — same rationale as in submitWord. If there's no
    // word list to draw hints from (server mode, round not yet loaded), do
    // nothing; the user will be able to hint once the round arrives.
    if (!lvl.words) return

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

  buyPack: async (hintsAmt, cost) => {
    // Server-authoritative: the spend endpoint atomically debits gems AND
    // credits hints for the matching packId. We derive packId from
    // (hintsAmt, cost) to match the catalog the server has in spend.ts —
    // keeping the call signature compatible with the existing ShopModal.
    const packId = hintsAmt === 5 ? 'starter'
                 : hintsAmt === 25 ? 'pro'
                 : hintsAmt === 100 ? 'whale'
                 : null
    if (!packId) {
      console.warn('buyPack: unknown pack', { hintsAmt, cost })
      get().showToast('⚠ Unknown pack')
      return
    }
    try {
      const resp = await apiSpendGems({
        amount:   cost,
        reason:   'hint_pack',
        metadata: { packId },
      })
      if (!resp.ok) {
        set({ gemsBalance: resp.newBalance })
        playSfx('wordInvalid')
        get().showToast('⚠ Not enough Gems')
        return
      }
      // Apply both server-authoritative balances. The shop closes either
      // way, matching the legacy behavior.
      set({
        gemsBalance: resp.newBalance,
        hints:       resp.newHints ?? (get().hints + hintsAmt),
        showShop:    false,
      })
      playSfx('purchase')
      get().showToast(`✓ ${hintsAmt} hints added · ${cost.toLocaleString()} Gems spent`)
    } catch (err) {
      console.warn('buyPack failed:', err)
      playSfx('wordInvalid')
      get().showToast('⚠ Connection error')
    }
  },

  // ── Daily Timer ───────────────────────────────────────────────────────────

  tickTimer: () => {
    const { dailySecondsLeft, gameMode, screen } = get()
    if (gameMode !== 'daily' || screen !== 'game') return
    if (dailySecondsLeft <= 1) get().triggerDailyLose()
    else set({ dailySecondsLeft: dailySecondsLeft - 1 })
  },

  triggerDailyWin: () => {
    // Daily-win hint reward is server-issued as of milestone 2 — the
    // /api/play/level/submit-word response carries `grants.dailyWin.hints`
    // and the submit-word .then() handler already bumped local `hints`
    // from it. We DON'T add hints again here; doing so used to grant the
    // reward client-side, which let anyone replay the daily-win moment
    // (e.g. refresh-and-replay) and multiply their hints.
    playSfx('dailyWin')
    useProgressStore.getState().setDailyAttempt('won')
    set({ dailyComplete: true })
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
    // midnight unless the player spends DAILY_RETRY_COST Gems to retry.
    useProgressStore.getState().setDailyAttempt('lost')
    set({ showQuitConfirm: false })
    get().goToSplash()
  },

  // Pay DAILY_RETRY_COST Gems to clear today's "lost" daily attempt and
  // immediately enter a fresh run. Returns true on success.
  payToRetryDaily: async () => {
    const attempt = useProgressStore.getState().getTodaysDailyAttempt()
    if (!attempt || attempt.status !== 'lost') return false
    try {
      const resp = await apiSpendGems({
        amount:   DAILY_RETRY_COST,
        reason:   'daily_retry',
        metadata: {},
      })
      if (!resp.ok) {
        set({ gemsBalance: resp.newBalance })
        playSfx('wordInvalid')
        get().showToast(`⚠ Need ${DAILY_RETRY_COST} Gems to retry the daily`)
        return false
      }
      set({ gemsBalance: resp.newBalance })
      useProgressStore.getState().clearDailyAttempt()
      playSfx('purchase')
      get().showToast(`✓ Daily retry purchased · ${DAILY_RETRY_COST} Gems spent`)
      get().goToGame('daily')
      return true
    } catch (err) {
      console.warn('payToRetryDaily failed:', err)
      playSfx('wordInvalid')
      get().showToast('⚠ Connection error')
      return false
    }
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

  // ── BGM ───────────────────────────────────────────────────────────────────
  toggleBgmMuted: () => {
    const next = !get().bgmMuted
    setBgmMuted(next)
    set({ bgmMuted: next })
    // If the user unmutes and BGM hasn't started yet (autoplay was blocked),
    // this gesture unlocks it — startBgm is idempotent so safe to call here.
    if (!next) startBgm()
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
//
// Two parallel sets of selectors:
//   * Legacy (selectCurrentLevel, selectFoundCount, selectProgress) — read
//     from `levels[currentLevelIndex]`. Returns the full Level when in
//     legacy mode; in server mode `selectCurrentLevel` still returns the
//     bundle-side entry, but `words` may be empty / stripped once the
//     bundle-strip milestone lands.
//   * Server-aware (selectActiveLetters, selectActiveSlotCount, etc.) —
//     return the right value regardless of mode.
//
// New consumers should prefer the server-aware variants. Existing consumers
// migrate over the course of the bundle-strip milestone.

export const selectCurrentLevel = (s: GameStore) =>
  s.levels[s.currentLevelIndex % (s.levels.length || 1)]

/** Letters as the player sees them on the wheel. In server mode this is
 *  the server's per-round shuffled set; in legacy mode it's the level's
 *  intrinsic letters.
 *
 *  IMPORTANT: this selector must return a REFERENTIALLY STABLE value across
 *  calls when the underlying data hasn't changed. Zustand subscribes via
 *  useSyncExternalStore which uses Object.is to detect changes — returning a
 *  fresh `[]` literal on every call (which `?? []` would do) caused an
 *  infinite re-render loop (React error #185) in the brief window between
 *  level-entry and the apiStartLevel response landing. We use a module-level
 *  frozen empty array as the stable fallback. */
const EMPTY_LETTERS: string[] = Object.freeze([]) as unknown as string[]

export const selectActiveLetters = (s: GameStore): string[] => {
  if (s.shuffledLetters) return s.shuffledLetters
  if (s.round) return s.round.manifest.letters
  const lvl = selectCurrentLevel(s)
  return lvl?.letters ?? EMPTY_LETTERS
}

/** Total number of primary slots in the active level. */
export const selectActiveSlotCount = (s: GameStore): number => {
  if (s.round) return s.round.manifest.slotCount
  const lvl = selectCurrentLevel(s)
  // `lvl` is the placeholder `{}` in server-mode builds, so `lvl.words` is
  // undefined — double-chain the optional to avoid `undefined.length`.
  return lvl?.words?.length ?? 0
}

/** How many primary slots have been filled. */
export const selectActiveFoundCount = (s: GameStore): number => {
  if (s.round) return s.round.slots.filter(slot => !!slot.filled).length
  const lvl = selectCurrentLevel(s)
  // Defensive: bundle-stripped placeholder Levels have no `words` array,
  // so this can only return a real count in legacy mode.
  return lvl?.words ? lvl.words.filter(w => s.foundWords.has(w)).length : 0
}

export const selectFoundCount = selectActiveFoundCount

export const selectProgress = (s: GameStore) => {
  const total = selectActiveSlotCount(s)
  if (!total) return 0
  return selectActiveFoundCount(s) / total
}

export const selectCurrentWordState = (s: any): 'valid' | 'invalid' | '' =>
  s._currentWordState ?? ''

export const selectLevelComplete = (s: any): boolean =>
  s._levelComplete ?? false

export const selectClearLevelComplete = () =>
  useGameStore.setState({ _levelComplete: false } as any)
