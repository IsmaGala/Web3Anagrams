// POST /api/play/level/start
// Body:    { worldId: string, levelIndex: number, mode: 'single'|'daily' }
// Headers: Authorization: Bearer <jwt>
// Returns: { roundId, manifest, balances, serverTime }
//
// Creates a new server-side round, returns the public level manifest (no
// words, no defs, no theme — only slot lengths and a shuffled letter set).
// The client uses `roundId` for every subsequent action (submit-word, hint,
// complete). Without it the server has no way to associate actions with a
// level, which is precisely what makes completion non-forgeable.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../../_lib/cors.js'
import { requireAuth } from '../../_lib/jwt.js'
import { getLevel } from '../../_data/worldsServerData.js'
import { buildManifest } from '../../_lib/play.js'
import { createRound, newRoundId, seedFromRoundId, getBalances } from '../../_lib/round.js'

function isWorldId(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9_]{1,32}$/i.test(s)
}

function isValidIndex(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 200
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  const { worldId, levelIndex, mode } = (req.body ?? {}) as {
    worldId?: unknown; levelIndex?: unknown; mode?: unknown
  }
  if (!isWorldId(worldId))         return res.status(400).json({ error: 'Invalid worldId' })
  if (!isValidIndex(levelIndex))   return res.status(400).json({ error: 'Invalid levelIndex' })
  if (mode !== 'single' && mode !== 'daily') {
    return res.status(400).json({ error: 'mode must be "single" or "daily"' })
  }

  const level = getLevel(worldId, levelIndex)
  if (!level) return res.status(404).json({ error: 'No such level' })

  // Generate the round id up front so the shuffle seed can be derived from
  // it (lets us reconstruct the same shuffle if we ever need to audit/replay
  // the round). Then the same id is what we pass to createRound for the
  // INSERT — no race, no second INSERT.
  const roundId = newRoundId()
  const seed    = seedFromRoundId(roundId)

  // Build the public manifest. This is what we'll return to the client and
  // also what we persist as the wheel letters for the round (so the player
  // can't refresh and get a different shuffle that has the answer letters
  // in answer-order).
  const manifest = buildManifest(worldId, levelIndex, level, seed)

  // Persist the round. We bypass createRound's id-generation here because
  // we already minted one above to seed the shuffle deterministically.
  const { sql } = await import('../../_lib/db.js')
  await sql()`
    INSERT INTO play_rounds (round_id, address, world_id, level_index, mode, shuffled_letters)
    VALUES (${roundId}, ${address}, ${worldId}, ${levelIndex}, ${mode},
            ${JSON.stringify(manifest.letters)}::jsonb)
  `
  // Suppress unused-import lint — createRound is exported for endpoints that
  // don't need a deterministic seed and can use the standard helper.
  void createRound

  const balances = await getBalances(address)

  return res.status(200).json({
    roundId,
    manifest,
    balances,
    serverTime: Date.now(),
  })
}
