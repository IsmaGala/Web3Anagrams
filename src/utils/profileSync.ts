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
//   • settings          → local preferred (player's current device wins;
//                         falls back to remote if local is missing)
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
import { isSfxMuted, setSfxMuted } from './sfx'
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
  /** Device preferences that should follow the player across devices.
   *  Optional for backward compatibility with payloads written before
   *  this field existed (older payloads simply omit it; local preference
   *  stays on those devices). */
  settings?: { sfxMuted: boolean }
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
  /** Server-authoritative balances from player_balances. As of milestone 2
   *  these are the truth — the `economy` block inside `payload` is a stale
   *  JSONB mirror that we no longer trust on the client. Pulled separately
   *  and applied via setBalancesFromServer below. */
  balances?:  { gems: number; hints: number }
  /** Surfaces ONCE — only in the response for the first /api/profile call
   *  after a wallet connects for the very first time ever. The server
   *  granted the welcome bundle (gems + hints) inside that same call;
   *  `balances` already reflects it. Use to fire the welcome toast. */
  firstWalletBonusGranted?: { gems: number; hints: number }
  /** Server-authoritative ownership derived from balance_transactions.
   *  Always prefer these over the JSONB payload's cosmetics / premium /
   *  event fields — the transactions table is the source of truth for
   *  anything the player paid for. */
  inventory?: {
    ownedSkins:      string[]
    unlockedPremium: string[]
    eventUnlocks:    Array<{ worldId: string; weekId: number }>
  }
}

// ── Build a payload from the current client state ───────────────────────────

export function buildPayload(): PlayerStatePayload {
  const game      = useGameStore.getState()
  const progress  = useProgressStore.getState()
  const cosmetics = useCosmeticsStore.getState()
  return {
    v: 1,
    economy: {
      // As of milestone 2 these values are NOT authoritative — the server
      // ignores them on /api/profile/sync writes and reads truth from
      // `player_balances.gems_balance` / `hints_balance`. We still send
      // the client's local cache here so the JSONB blob stays roughly
      // consistent for debugging (`SELECT payload->'economy' FROM
      // player_state` returns something meaningful), but a cheater
      // inflating these fields no longer affects anything spendable.
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
      // Only persist the equipped-skin preference. Ownership is derived
      // server-side from balance_transactions and applied via resp.inventory
      // in pullAndApply — storing ownedSkins in the JSONB creates a loop
      // where wiped ownership can be restored from a stale payload.
      ownedSkins: [],
      wheelSkin:  cosmetics.wheelSkin,
    },
    welcome: {
      firstWalletBonusClaimed: progress.firstWalletBonusClaimed,
    },
    settings: {
      sfxMuted: isSfxMuted(),
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
    settings: {
      // Local preference wins (player's current device is most recent intent).
      // Falls back to remote if local is missing (e.g. first login on new device).
      // Tolerant of payloads written before `settings` existed (both may be undefined).
      sfxMuted: local.settings?.sfxMuted ?? server.settings?.sfxMuted ?? false,
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
  // Apply cosmetics — only the equipped-skin preference from the JSONB.
  // Ownership (ownedSkins) is NOT applied here; it is authoritative only
  // from resp.inventory in pullAndApply (derived from balance_transactions).
  // Applying ownedSkins from the JSONB would let a stale/tampered payload
  // restore skin ownership that was legitimately wiped on the server.
  if (p.cosmetics) {
    const equipped = p.cosmetics.wheelSkin
    if (typeof equipped === 'string' && equipped in WHEEL_SKINS) {
      useCosmeticsStore.getState().setWheelSkin(equipped as WheelSkinId)
    }
  }
  // Apply settings — sfxMuted is a device preference but we sync it so a
  // player who muted on one device doesn't get blasted on the next. We
  // only apply when the field is actually present in the payload (undefined
  // means this is a pre-settings legacy blob, not that mute is off).
  if (p.settings !== undefined) {
    setSfxMuted(p.settings.sfxMuted)
  }
}

// ── Network ─────────────────────────────────────────────────────────────────

async function fetchServerPayload(): Promise<ServerResponse | null> {
  if (!useWalletStore.getState().jwt) return null
  try {
    const resp = await api.get<ServerResponse>('/api/profile')
    return resp
  } catch (e) {
    console.warn('[profileSync] pull failed:', e)
    return null
  }
}

async function pushPayload(payload: PlayerStatePayload): Promise<boolean> {
  if (!useWalletStore.getState().jwt) return false
  try {
    await api.post('/api/profile', payload)
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
 *  safe to call multiple times.
 *
 *  As of milestone 2 (server-authoritative gems), the gems/hints balances
 *  come from the response's top-level `balances` field rather than the
 *  JSONB economy block. applyPayload still consumes the JSONB economy
 *  for legacy reasons but the values are immediately overwritten here
 *  with the server's truth. The welcome bonus is also surfaced here as
 *  a side-effect of the FIRST pull for a given wallet. */
export async function pullAndApply(): Promise<void> {
  setStatus('pulling')
  try {
    const resp   = await fetchServerPayload()
    const server = resp?.payload ?? null
    const local  = buildPayload()
    const merged = server ? mergePayloads(local, server) : local
    applyPayload(merged)
    // Server-authoritative balances override whatever the JSONB merge
    // produced. If a cheater inflated `gemsBalance` in localStorage,
    // applyPayload would have applied that — we correct it here.
    if (resp?.balances) {
      useGameStore.setState({
        gemsBalance: resp.balances.gems,
        hints:       resp.balances.hints,
      } as any)
    }
    // First-wallet welcome bonus — server-issued, surfaced here as a toast.
    // The balances above already include the bonus, so the +Gems / +hints
    // numbers in the toast are descriptive of what just happened.
    if (resp?.firstWalletBonusGranted) {
      const { gems, hints } = resp.firstWalletBonusGranted
      // Flip the local "claimed" flag so older cross-device sync code
      // doesn't try to re-claim. Server is the real gate via the audit
      // table, but the flag keeps the legacy UI tidy.
      try { useProgressStore.getState().claimFirstWalletBonus() } catch {}
      // Show a dedicated reward popup instead of a transient toast.
      useGameStore.getState().setPendingWelcomeBonus({ gems, hints })
    }
    // Server-authoritative inventory — derived from balance_transactions.
    // This is the source of truth for ownership. We apply it AFTER the JSONB
    // merge and it REPLACES whatever the JSONB said about skins.
    //
    // Why authoritative (not additive): the JSONB is a sync cache that can
    // drift — a DB wipe, a tampered payload, or a cross-device race can leave
    // stale skin ownership in the JSONB. `balance_transactions` is the audit
    // log and cannot lie. An empty `ownedSkins` here means zero purchased
    // skins, and we must honour that (the cosmetics store always adds 'default'
    // back in `setOwnedSkins`, so the player is never left with no skin).
    if (resp?.inventory) {
      const { ownedSkins, unlockedPremium, eventUnlocks } = resp.inventory
      // Skins: replace with server truth. setOwnedSkins always keeps 'default'.
      const cosmetics = useCosmeticsStore.getState()
      cosmetics.setOwnedSkins(ownedSkins as WheelSkinId[])
      // If the currently-equipped skin is no longer owned, fall back to default.
      if (!cosmetics.ownsSkin(cosmetics.wheelSkin)) {
        cosmetics.setWheelSkin('default')
      }
      // Premium worlds + event week unlocks: reconcile into progressStore
      // without triggering level-wipe side effects.
      if (unlockedPremium.length > 0 || eventUnlocks.length > 0) {
        useProgressStore.getState().reconcileInventory({
          premiumWorldIds: unlockedPremium,
          eventUnlocks,
        })
      }
    }
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
