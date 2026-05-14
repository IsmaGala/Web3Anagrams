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
//   • event state       → max(unlockedWeek), max(claimedWeek) per event
//   • economy           → MAX(galaBalance), MAX(hints) (friendly to player)
//
// Future work: when GALA moves on-chain, drop economy from the payload and
// fetch from chain instead.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './apiClient'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useWalletStore } from '../store/walletStore'
import type { WorldId } from '../data/worlds'

// ── Payload shape ───────────────────────────────────────────────────────────

interface LevelProgress { completed: boolean; score: number }
interface WorldProgress { levels: Record<string, LevelProgress> }
interface EventStateEntry { unlockedWeek?: number; claimedWeek?: number }
interface DailyAttemptRecord { dateKey: string; status: 'won' | 'lost' }

export interface PlayerStatePayload {
  v: 1
  economy: { galaBalance: number; hints: number }
  progress: { worlds: Record<string, WorldProgress> }
  premium: { unlocked: Partial<Record<WorldId, boolean>> }
  events:  { state: Partial<Record<WorldId, EventStateEntry>> }
  daily:   { attempt: DailyAttemptRecord | null }
}

interface ServerResponse {
  address:   string
  payload:   PlayerStatePayload | null
  updatedAt: string | null
}

// ── Build a payload from the current client state ───────────────────────────

export function buildPayload(): PlayerStatePayload {
  const game     = useGameStore.getState()
  const progress = useProgressStore.getState()
  return {
    v: 1,
    economy: {
      galaBalance: game.galaBalance,
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

function mergeEventState(
  a: Partial<Record<WorldId, EventStateEntry>>,
  b: Partial<Record<WorldId, EventStateEntry>>,
): Partial<Record<WorldId, EventStateEntry>> {
  const out: Partial<Record<WorldId, EventStateEntry>> = { ...a }
  for (const k of Object.keys(b) as WorldId[]) {
    const av = a[k] ?? {}
    const bv = b[k] ?? {}
    out[k] = {
      unlockedWeek: Math.max(av.unlockedWeek ?? 0, bv.unlockedWeek ?? 0) || undefined,
      claimedWeek:  Math.max(av.claimedWeek  ?? 0, bv.claimedWeek  ?? 0) || undefined,
    }
  }
  return out
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
      galaBalance: Math.max(local.economy.galaBalance, server.economy.galaBalance),
      hints:       Math.max(local.economy.hints,       server.economy.hints),
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
  }
}

// ── Apply a merged payload back to the stores ──────────────────────────────

export function applyPayload(p: PlayerStatePayload): void {
  useGameStore.setState({
    galaBalance: p.economy.galaBalance,
    hints:       p.economy.hints,
  } as any)
  // progressStore doesn't expose a "set everything" action; we reach into
  // its internal state directly. The setter will trigger zustand subscribers,
  // which our localStorage layers in progressStore already listen to.
  useProgressStore.setState({
    worlds:          p.progress.worlds as any,
    unlockedPremium: p.premium.unlocked as any,
    eventState:      p.events.state as any,
    dailyAttempt:    p.daily.attempt,
  } as any)
  // Persist locally — these are the SAME keys progressStore.save uses, so
  // a refresh hydrates from localStorage if we ever go offline.
  try {
    localStorage.setItem('wc_progress_v1',          JSON.stringify(p.progress.worlds))
    localStorage.setItem('wc_premium_unlocks_v1',   JSON.stringify(p.premium.unlocked))
    localStorage.setItem('wc_event_state_v1',       JSON.stringify(p.events.state))
    if (p.daily.attempt) localStorage.setItem('wc_daily_attempt_v1', JSON.stringify(p.daily.attempt))
    else                 localStorage.removeItem('wc_daily_attempt_v1')
    localStorage.setItem('wc_economy_v1',           JSON.stringify(p.economy))
  } catch {}
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
