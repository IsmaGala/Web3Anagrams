// Client wrapper for /api/economy/* endpoints.
//
// All gem-spending now goes through the server. The client used to do
// `set({ gemsBalance: gemsBalance - cost })` directly in gameStore; that
// pattern is gone as of milestone 2 because it let a cheater edit
// localStorage to fake a balance. Now the client POSTs to spendGems and
// the server returns the authoritative new balance — which the client
// updates its local copy from.
//
// The grant side (level-completion bounty, daily-win, first-wallet bonus,
// real-money store purchase) is server-initiated and doesn't have a
// matching client endpoint; the new balances flow down via responses to
// existing endpoints (/api/profile, /api/play/level/submit-word).

import { api } from './apiClient'

export type SpendReason =
  | 'hint_pack' | 'unlock_premium' | 'unlock_event'
  | 'daily_retry' | 'cosmetic_skin'

export interface SpendResponseOk {
  ok:           true
  newBalance:   number      // post-debit gems balance
  newHints?:    number      // present when the spend granted hints (hint_pack)
  hintsGranted?: number     // for hint_pack: how many hints were credited
  reason:       SpendReason
}

export interface SpendResponseInsufficient {
  ok:         false
  newBalance: number        // current (pre-attempt) gems balance — caller may
                            // want to reflect this so the UI shows truth
  reason:     'insufficient'
}

export type SpendResponse = SpendResponseOk | SpendResponseInsufficient

/** Spend gems server-side. Returns:
 *   - { ok: true,  newBalance } on success (the server already debited)
 *   - { ok: false, newBalance, reason: 'insufficient' } when the player
 *     can't afford it (the server didn't debit — newBalance is the current
 *     truth, which may be lower than the client believed)
 *   - throws on network/auth errors — caller handles via try/catch
 *
 * The CALLER is responsible for the side effect of the spend (e.g.,
 * flipping `unlockedPremium[worldId] = true` in progressStore). Those
 * unlock flags are still client-side in this milestone; a future
 * milestone moves them server-side too.
 *
 * The endpoint returns HTTP 200 for both ok=true and ok=false; only
 * malformed requests / auth failures produce a thrown error here. */
export function spendGems(args: {
  amount:    number
  reason:    SpendReason
  metadata?: Record<string, unknown>
}): Promise<SpendResponse> {
  return api.post<SpendResponse>('/api/economy/spend', args)
}
