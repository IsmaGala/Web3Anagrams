// ─────────────────────────────────────────────────────────────────────────────
// profileSync — cross-device save layer.
//
// All the player state that today lives in localStorage (economy, world
// progress, premium unlocks, event state, daily attempt) is collected into
// a single JSONB blob keyed by the wallet address and mirrored to the
// server. Reads happen once on login; writes are debounced.
//
// Lifecycle (driven from App.tsx):
//   • when JWT becomes available → pullAndApply() once
//   • when any tracked state changes → schedulePush() (debounced 2s)
//   • when JWT is cleared → cancel pending pushes, do not wipe local data
//
// Merge philosophy (server vs local on first pull):
//   • level scores      → MAX per (worldId, levelIndex)
//   • level completion  → OR (either side completed → completed)
//   • premium unlocks   → UNION
//   • daily attempt     → latest dateKey wins; ties prefer 'won'
//   • event state       → UNION of (worldId, weekId) records; within each
//                         record, OR the {unlocked, claimed} flags. Legacy
//                         {unlockedWeek, claimedWeek} entries are folded in
//                         via normalizeEventEntry before merging.
//   • economy           → MAX(gemsBalance), MAX(hints) (friendly to player)
//
// Future work: gems are server-authoritative as of v4 (the store credits
// player_state.payload.economy.gemsBalance directly on purchase). The MAX
// merge above is now a defensive measure — both sides should already agree.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './apiClient'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useWalletStore } from '../store/walletStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { WHEEL_SKINS, type WheelSkinId } from '../skins'
import type { WorldId } from '../data/worlds'

// ── Payload shape ───────────────────────────────────────────────────────────

interface LevelProgress { completed: boolean; score: number }
interface WorldProgress { levels: Record<string, LevelProgress> }
interface EventWeekRecord { unlocked: boolean; claimed: boolean }
/** Per-week event record. JSON keys are strings; the weekId is a number on
 *  the client. Shape mirrors progressStore's EventState. The pre-stacking
 *  shape `{ unlockedWeek, claimedWeek }` is migrated by normalizeEventEntry
 *  below so a payload pulled from the server before the stacking deploy can
 *  still be merged correctly. */
interface EventStateEntry {
  weeks?:        Record<string, EventWeekRecord>
  unlockedWeek?: number   // legacy
  claimedWeek?:  number   // legacy
}
interface DailyAttemptRecord { dateKey: string; status: 'won' | 'lost' }

export interface PlayerStatePayload {
  v: 1
  /** `gemsBalance` is the v4 field name. Older server-stored payloads use
   *  `galaBalance` — we read both keys via `economyBalance()` so the cutover
   *  doesn't orphan anyone's balance. New writes always use `gemsBalance`. */
  economy: { gemsBalance: number; hints: number; galaBalance?: number }
  progress: { worlds: Record<string, WorldProgress> }
  premium: { unlocked: Partial<Record<WorldId, boolean>> }
  events:  { state: Partial<Record<WorldId, EventStateEntry>> }
  daily:   { attempt: DailyAttemptRecord | null }
  /** Per-world flag set the first time the player collects the world's
   *  one-time completion Gem bounty. Synced so a fresh device can't be used
   *  to re-claim the reward. Optional in the payload shape for backward
   *  compatibility with server blobs written before this field existed. */
  completion?: { claimed: Partial<Record<WorldId, boolean>> }
  /** Cosmetic state — wheel skin unlocks and the currently-equipped skin.
   *  Ownership is the source of truth; equipped is a UX preference. Both
   *  cross-device so a player who unlocks Patriot on phone sees it
   *  equipped on tablet. Optional for backward compatibility with payloads
   *  written before this field existed. */
  cosmetics?: { ownedSkins: string[]; wheelSkin: string }
  /** One-time welcome bonus state. `firstWalletBonusClaimed: true` means
   *  the player has already been credited the +Gems / +hints grant on
   *  some device, so no device will grant it again. Optional for
   *  backward compatibility with pre-rollout payloads. */
  welcome?: { firstWalletBonusClaimed: boolean }
}

/** Read the gems balance from a payload, tolerating the legacy field name.
 *  Returns 0 if neither key is present (defensive). */
function economyBalance(e: PlayerStatePayload['economy']): number {
  if (typeof e.gemsBalance === 'number') return e.gemsBalance
  if (typeof e.galaBalance === 'number') return e.galaBalance
  return 0
}

interface ServerResponse {
  address:   string
  payload:   PlayerStatePayload | null
  updatedAt: string | null
}

// ── Build a payload from the current client state ───────────────────────────

export function buildPayload(): PlayerStatePayload {
  const game      = useGameStore.getState()
  const progress  = useProgressStore.getState()
  const cosmetics = useCosmeticsStore.getState()
  return {
    v: 1,
    economy: {
      gemsBalance: game.gemsBalance,
      hints:       game.hints,
    },
    progress: {
      worlds: progress.worlds as any,
    },
    premium: {
      unlocked: progress.unlockedPremium as any,
    },
    events: {
      state: progress.eventState as any,
    },
    daily: {
      attempt: progress.dailyAttempt,
    },
    completion: {
      claimed: progress.worldCompletionClaimed as any,
    },
    cosmetics: {
      // Spread the Set into a plain array for JSON-serializability.
      ownedSkins: [...cosmetics.ownedSkins],
      wheelSkin:  cosmetics.wheelSkin,
    },
    welcome: {
      firstWalletBonusClaimed: progress.firstWalletBonusClaimed,
    },
  }
}

// ── Merge logic ─────────────────────────────────────────────────────────────

function mergeWorlds(a: Record<string, WorldProgress>, b: Record<string, WorldProgress>): Record<string, WorldProgress> {
  const out: Record<string, WorldProgress> = { ...a }
  for (const wid of Object.keys(b)) {
    const aLevels = a[wid]?.levels ?? {}
    const bLevels = b[wid]?.levels ?? {}
    const merged: Record<string, LevelProgress> = { ...aLevels }
    for (const idx of Object.keys(bLevels)) {
      const av = aLevels[idx]
      const bv = bLevels[idx]
      if (!av) { merged[idx] = bv; continue }
      merged[idx] = {
        completed: av.completed || bv.completed,
        score:     Math.max(av.score ?? 0, bv.score ?? 0),
      }
    }
    out[wid] = { levels: merged }
  }
  return out
}

function mergeBoolMap<K extends string>(a: Partial<Record<K, boolean>>, b: Partial<Record<K, boolean>>): Partial<Record<K, boolean>> {
  const out: Partial<Record<K, boolean>> = { ...a }
  for (const k of Object.keys(b) as K[]) if (b[k]) out[k] = true
  return out
}

/** Fold legacy `{ unlockedWeek, claimedWeek }` into the per-week `weeks` map.
 *  Returns the entry's weeks map (always populated; possibly empty). */
function normalizeEventEntry(entry: EventStateEntry | undefined): Record<string, EventWeekRecord> {
  if (!entry) return {}
  const weeks: Record<string, EventWeekRecord> = { ...(entry.weeks ?? {}) }
  if (typeof entry.unlockedWeek === 'number') {
    const k = String(entry.unlockedWeek)
    weeks[k] = {
      unlocked: true,
      claimed: weeks[k]?.claimed || entry.claimedWeek === entry.unlockedWeek,
    }
  }
  if (typeof entry.claimedWeek === 'number') {
    const k = String(entry.claimedWeek)
    weeks[k] = { unlocked: weeks[k]?.unlocked ?? true, claimed: true }
  }
  return weeks
}

function mergeEventState(
  a: Partial<Record<WorldId, EventStateEntry>>,
  b: Partial<Record<WorldId, EventStateEntry>>,
): Partial<Record<WorldId, EventStateEntry>> {
  // Union of (worldId, weekId) records. Within each record we OR the flags:
  // if either side saw the week as unlocked or claimed, the merged state
  // reflects that. Mirrors the "MAX/UNION wins" friendliness of the rest of
  // the merge layer — we never lose participation evidence.
  const out: Partial<Record<WorldId, EventStateEntry>> = {}
  const keys = new Set<WorldId>([
    ...(Object.keys(a) as WorldId[]),
    ...(Object.keys(b) as WorldId[]),
  ])
  for (const k of keys) {
    const aw = normalizeEventEntry(a[k])
    const bw = normalizeEventEntry(b[k])
    const merged: Record<string, EventWeekRecord> = { ...aw }
    for (const wk of Object.keys(bw)) {
      const av = merged[wk]
      const bv = bw[wk]
      merged[wk] = av
        ? { unlocked: av.unlocked || bv.unlocked, claimed: av.claimed || bv.claimed }
        : { ...bv }
    }
    out[k] = { weeks: merged }
  }
  return out
}

/** Merge cosmetics state. Ownership is unioned (a player who unlocked a
 *  skin on either device keeps it on both). For the equipped skin we
 *  prefer the LOCAL side — pulls only happen on login and the client
 *  has likely just made a deliberate choice that should override an
 *  older server record. Falls back to remote if local is missing, then
 *  to 'default' if neither side has a valid value. */
function mergeCosmetics(
  local:  PlayerStatePayload['cosmetics'],
  server: PlayerStatePayload['cosmetics'],
): { ownedSkins: string[]; wheelSkin: string } {
  const localOwned  = local?.ownedSkins  ?? []
  const serverOwned = server?.ownedSkins ?? []
  // Union + sanitize: 'default' is always present; unknown ids dropped.
  const merged = new Set<string>(['default'])
  for (const id of [...localOwned, ...serverOwned]) {
    if (typeof id === 'string' && id in WHEEL_SKINS) merged.add(id)
  }
  // Preferred equipped: local first, then server, then default. We also
  // gate on whether the equipped skin is actually in the owned set —
  // otherwise a stale equipped value would render against a skin the
  // player no longer owns.
  const candidate = local?.wheelSkin ?? server?.wheelSkin ?? 'default'
  const equipped  = merged.has(candidate) ? candidate : 'default'
  return { ownedSkins: [...merged], wheelSkin: equipped }
}

function mergeDaily(a: DailyAttemptRecord | null, b: DailyAttemptRecord | null): DailyAttemptRecord | null {
  if (!a) return b
  if (!b) return a
  if (a.dateKey > b.dateKey) return a
  if (b.dateKey > a.dateKey) return b
  // Same day — prefer 'won'.
  return a.status === 'won' ? a : b
}

export function mergePayloads(local: PlayerStatePayload, server: PlayerStatePayload): PlayerStatePayload {
  return {
    v: 1,
    economy: {
      // `economyBalance` reads gemsBalance OR the legacy galaBalance, so a
      // server payload from before the v4 cutover still contributes its
      // balance to the merge.
      gemsBalance: Math.max(economyBalance(local.economy), economyBalance(server.economy)),
      hints:       Math.max(local.economy.hints, server.economy.hints),
    },
    progress: {
      worlds: mergeWorlds(local.progress.worlds, server.progress.worlds),
    },
    premium: {
      unlocked: mergeBoolMap(local.premium.unlocked, server.premium.unlocked),
    },
    events: {
      state: mergeEventState(local.events.state, server.events.state),
    },
    daily: {
      attempt: mergeDaily(local.daily.attempt, server.daily.attempt),
    },
    completion: {
      // UNION of claim flags — once either side has paid the bounty, no
      // device will pay it again. Tolerant of missing `completion` blocks
      // in pre-rollout server payloads.
      claimed: mergeBoolMap(
        local.completion?.claimed ?? {},
        server.completion?.claimed ?? {},
      ),
    },
    cosmetics: mergeCosmetics(local.cosmetics, server.cosmetics),
    welcome: {
      // OR — once either device records the bonus as claimed, no future
      // device will re-grant it. Tolerant of missing welcome blocks in
      // pre-rollout payloads.
      firstWalletBonusClaimed:
        !!(local.welcome?.firstWalletBonusClaimed
          || server.welcome?.firstWalletBonusClaimed),
    },
  }
}

// ── Apply a merged payload back to the stores ──────────────────────────────

export function applyPayload(p: PlayerStatePayload): void {
  useGameStore.setState({
    gemsBalance: economyBalance(p.economy),
    hints:       p.economy.hints,
  } as any)
  // progressStore doesn't expose a "set everything" action; we reach into
  // its internal state directly. The setter will trigger zustand subscribers,
  // which our localStorage layers in progressStore already listen to.
  const completionClaimed = p.completion?.claimed ?? {}
  const welcomeClaimed    = !!p.welcome?.firstWalletBonusClaimed
  useProgressStore.setState({
    worlds:                  p.progress.worlds as any,
    unlockedPremium:         p.premium.unlocked as any,
    eventState:              p.events.state as any,
    dailyAttempt:            p.daily.attempt,
    worldCompletionClaimed:  completionClaimed as any,
    firstWalletBonusClaimed: welcomeClaimed,
  } as any)
  // Persist locally — these are the SAME keys progressStore.save uses, so
  // a refresh hydrates from localStorage if we ever go offline.
  try {
    localStorage.setItem('wc_progress_v1',                    JSON.stringify(p.progress.worlds))
    localStorage.setItem('wc_premium_unlocks_v1',             JSON.stringify(p.premium.unlocked))
    localStorage.setItem('wc_event_state_v1',                 JSON.stringify(p.events.state))
    if (p.daily.attempt) localStorage.setItem('wc_daily_attempt_v1', JSON.stringify(p.daily.attempt))
    else                 localStorage.removeItem('wc_daily_attempt_v1')
    localStorage.setItem('wc_economy_v1',                     JSON.stringify(p.economy))
    localStorage.setItem('wc_world_completion_claimed_v1',    JSON.stringify(completionClaimed))
    localStorage.setItem('wc_welcome_bonus_v1',               JSON.stringify(welcomeClaimed))
  } catch {}
  // Apply cosmetics last so the wheel re-renders with the synced skin.
  // The cosmetics store handles its own localStorage persistence inside
  // setOwnedSkins / setWheelSkin, so we don't double-write here.
  if (p.cosmetics) {
    const owned = (p.cosmetics.ownedSkins ?? []).filter(
      (id): id is WheelSkinId => typeof id === 'string' && id in WHEEL_SKINS,
    )
    useCosmeticsStore.getState().setOwnedSkins(owned)
    const equipped = p.cosmetics.wheelSkin
    if (typeof equipped === 'string' && equipped in WHEEL_SKINS) {
      useCosmeticsStore.getState().setWheelSkin(equipped as WheelSkinId)
    }
  }
}

// ── Network ─────────────────────────────────────────────────────────────────

async function fetchServerPayload(): Promise<PlayerStatePayload | null> {
  if (!useWalletStore.getState().jwt) return null
  try {
    const resp = await api.get<ServerResponse>('/api/profile')
    return resp.payload ?? null
  } catch (e) {
    console.warn('[profileSync] pull failed:', e)
    return null
  }
}

async function pushPayload(payload: PlayerStatePayload): Promise<boolean> {
  if (!useWalletStore.getState().jwt) return false
  try {
    await api.post('/api/profile/sync', payload)
    return true
  } catch (e) {
    console.warn('[profileSync] push failed:', e)
    return false
  }
}

// ── Public lifecycle ────────────────────────────────────────────────────────

let syncStatus: 'idle' | 'pulling' | 'pushing' = 'idle'
const listeners = new Set<(s: typeof syncStatus) => void>()

function setStatus(s: typeof syncStatus) {
  syncStatus = s
  for (const fn of listeners) fn(s)
}

export function subscribeSyncStatus(fn: (s: 'idle' | 'pulling' | 'pushing') => void): () => void {
  listeners.add(fn)
  fn(syncStatus)
  return () => listeners.delete(fn)
}

/** Pull the server payload, merge with local state, apply the merge, and
 *  push the merged blob back so server reflects the union. Idempotent —
 *  safe to call multiple times. */
export async function pullAndApply(): Promise<void> {
  setStatus('pulling')
  try {
    const server = await fetchServerPayload()
    const local  = buildPayload()
    const merged = server ? mergePayloads(local, server) : local
    applyPayload(merged)
    // Push the merged result so the server has the union too.
    setStatus('pushing')
    await pushPayload(merged)
  } finally {
    setStatus('idle')
  }
}

// ── Debounced push ─────────────────────────────────────────────────────────
// Coalesces a flurry of changes (player completing a level → gains score,
// hints, possibly money) into a single network round-trip a couple of
// seconds after the last change.

const PUSH_DEBOUNCE_MS = 2_000
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushScheduled = false

export function schedulePush(): void {
  if (!useWalletStore.getState().jwt) return
  pushScheduled = true
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    pushTimer = null
    pushScheduled = false
    setStatus('pushing')
    try {
      await pushPayload(buildPayload())
    } finally {
      setStatus('idle')
    }
  }, PUSH_DEBOUNCE_MS)
}

export function cancelPendingPush(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
  pushScheduled = false
}

/** Flush any pending push immediately. Useful before tab unload. */
export async function flushPush(): Promise<void> {
  if (!pushScheduled) return
  cancelPendingPush()
  setStatus('pushing')
  try { await pushPayload(buildPayload()) }
  finally { setStatus('idle') }
}
