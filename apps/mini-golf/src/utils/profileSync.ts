// Profile sync — cross-device save layer for mini golf.
// Mirrors the player's progress, economy, and cosmetics to the server.
// Implementation follows the same pattern as wordchain's profileSync.

import { api } from '@gala-games/metagame'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { useWalletStore } from '@gala-games/metagame'
import type { BallSkinId, ClubSkinId } from '../types'

// ── Payload shape ─────────────────────────────────────────────────────────────

interface HoleProgressRecord { completed: boolean; bestStrokes: number }
interface CourseProgressRecord { holes: Record<string, HoleProgressRecord> }

export interface MiniGolfPayload {
  v: 1
  economy: { gemsBalance: number }
  courses: Record<string, CourseProgressRecord>
  premiumCourses: string[]
  cosmetics: { ballSkin: BallSkinId; clubSkin: ClubSkinId; ownedBalls: BallSkinId[]; ownedClubs: ClubSkinId[] }
}

function buildPayload(): MiniGolfPayload {
  const { gemsBalance } = useGameStore.getState()
  const { courses, premiumCourses } = useProgressStore.getState()
  const { ballSkin, clubSkin, ownedBalls, ownedClubs } = useCosmeticsStore.getState()
  return {
    v: 1,
    economy: { gemsBalance },
    courses,
    premiumCourses,
    cosmetics: {
      ballSkin,
      clubSkin,
      ownedBalls: [...ownedBalls] as BallSkinId[],
      ownedClubs: [...ownedClubs] as ClubSkinId[],
    },
  }
}

function applyPayload(remote: MiniGolfPayload) {
  const local = buildPayload()

  // Economy — take max
  const gems = Math.max(local.economy.gemsBalance, remote.economy.gemsBalance)
  useGameStore.setState({ gemsBalance: gems })

  // Progress — union, take best strokes
  const merged: Record<string, CourseProgressRecord> = { ...local.courses }
  for (const [cid, cp] of Object.entries(remote.courses ?? {})) {
    if (!merged[cid]) { merged[cid] = { holes: {} }; }
    for (const [hid, hp] of Object.entries(cp.holes ?? {})) {
      const existing = merged[cid].holes[hid]
      merged[cid].holes[hid] = {
        completed: hp.completed || (existing?.completed ?? false),
        bestStrokes: existing ? Math.min(existing.bestStrokes, hp.bestStrokes) : hp.bestStrokes,
      }
    }
  }
  const premiumUnion = [...new Set([...local.premiumCourses, ...(remote.premiumCourses ?? [])])]

  useProgressStore.setState({ courses: merged, premiumCourses: premiumUnion })

  // Cosmetics — union of owned items
  const { setOwnedBalls, setOwnedClubs } = useCosmeticsStore.getState()
  setOwnedBalls([...new Set([...local.cosmetics.ownedBalls, ...(remote.cosmetics?.ownedBalls ?? [])])] as BallSkinId[])
  setOwnedClubs([...new Set([...local.cosmetics.ownedClubs, ...(remote.cosmetics?.ownedClubs ?? [])])] as ClubSkinId[])
}

// ── Push/pull ─────────────────────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null

export async function pullAndApply(): Promise<void> {
  const { jwt, address } = useWalletStore.getState()
  if (!jwt || !address) return
  try {
    const resp = await api.get<{ payload: MiniGolfPayload }>('/api/profile')
    if (resp?.payload?.v === 1) applyPayload(resp.payload)
  } catch (e) {
    console.warn('[profileSync] pull failed', e)
  }
}

async function push(): Promise<void> {
  const { jwt } = useWalletStore.getState()
  if (!jwt) return
  try {
    await api.post('/api/profile/sync', { payload: buildPayload() })
  } catch (e) {
    console.warn('[profileSync] push failed', e)
  }
}

export function schedulePush(): void {
  const { jwt } = useWalletStore.getState()
  if (!jwt) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(push, 2000)
}

export async function flushPush(): Promise<void> {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
  await push()
}

export function cancelPendingPush(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
}
