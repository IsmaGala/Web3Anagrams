// Client wrappers for the /api/play/level/* endpoints.
//
// Used only when VITE_SERVER_AUTHORITATIVE === 'true' (see gameStore.ts).
// In legacy mode none of these functions are called — the client validates
// locally against the bundled answer key.
//
// All requests carry the user's JWT via the shared apiClient (Authorization
// header is auto-attached). All endpoints expect a roundId returned by
// startLevel; the server enforces (round_id, address) ownership server-side
// so a leaked roundId from another session is rejected.

import { api } from './apiClient'
import type { LevelManifest, SlotRef } from '../types'

// ── Types mirroring the server's response shapes ─────────────────────────────

export interface StartLevelResponse {
  roundId:    string
  manifest:   LevelManifest
  balances:   { gems: number; hints: number }
  serverTime: number
}

export interface SubmitWordAcceptedPrimary {
  result:     'accepted'
  kind:       'primary'
  scoreDelta: number
  totalScore: number
  slot:       SlotRef
  def:        string
  completed:  boolean
  breakdown?: {
    base:           number
    misses:         number
    missesPenalty:  number
    hintsUsed:      number
    hintsPenalty:   number
    elapsedSec:     number
    timeBonus:      number
    final:          number
  }
  // Server-issued grants that fired during this submission. Only present
  // when the round just completed AND a grant was eligible. The amounts
  // here are post-grant balances (in player_balances) — the client should
  // sync its local copy from them rather than computing locally.
  grants?: {
    worldCompletion?: { amount: number; worldId: string }
    dailyWin?:        { hints: number }
  }
}

export interface SubmitWordAcceptedBonus {
  result:     'accepted'
  kind:       'bonus'
  scoreDelta: number
  totalScore: number
  def:        string
}

export interface SubmitWordRejected {
  result: 'rejected'
  reason: 'not-in-chain' | 'not-makeable'
  misses: number
}

export interface SubmitWordDuplicate {
  result: 'duplicate'
}

export type SubmitWordResponse =
  | SubmitWordAcceptedPrimary
  | SubmitWordAcceptedBonus
  | SubmitWordRejected
  | SubmitWordDuplicate

export interface HintResponse {
  slot:           SlotRef
  position:       number
  letter:         string
  hintsRemaining: number
}

// ── Endpoint wrappers ────────────────────────────────────────────────────────

export function startLevel(args: {
  worldId:    string
  levelIndex: number
  mode:       'single' | 'daily'
}): Promise<StartLevelResponse> {
  return api.post<StartLevelResponse>('/api/play/level/start', args)
}

export function submitWord(args: {
  roundId: string
  word:    string
}): Promise<SubmitWordResponse> {
  return api.post<SubmitWordResponse>('/api/play/level/submit-word', args)
}

export function requestHint(args: { roundId: string }): Promise<HintResponse> {
  return api.post<HintResponse>('/api/play/level/hint', args)
}

// ── Flag accessor ────────────────────────────────────────────────────────────
// Centralized so a stray hand-check in gameStore can't go out of sync. Both
// 'true' (Vercel env vars are strings) and a boolean true (vite.define) are
// accepted to make local-dev configuration ergonomics painless.

export function isServerAuthoritative(): boolean {
  const v = (import.meta as any).env?.VITE_SERVER_AUTHORITATIVE
  return v === true || v === 'true' || v === '1'
}
