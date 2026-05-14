// GET /api/profile
// Headers: Authorization: Bearer <jwt>
// Returns: { address, payload, updatedAt }
//
// • address    — the JWT-verified wallet
// • payload    — the JSONB blob the client uploaded most recently, or null
//                if this wallet has never synced
// • updatedAt  — ISO timestamp of the last sync, or null
//
// The payload schema is owned by the client (src/utils/profileSync.ts). The
// server is intentionally schema-agnostic so we can iterate the client's
// state buckets without DB migrations.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { applyCors } from './_lib/cors.js'
import { requireAuth } from './_lib/jwt.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  const rows = await sql()`
    SELECT payload, updated_at FROM player_state WHERE address = ${address} LIMIT 1
  ` as Array<{ payload: unknown; updated_at: string }>

  if (rows.length === 0) {
    return res.status(200).json({ address, payload: null, updatedAt: null })
  }

  return res.status(200).json({
    address,
    payload:   rows[0].payload,
    updatedAt: rows[0].updated_at,
  })
}
