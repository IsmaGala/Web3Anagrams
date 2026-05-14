// POST /api/profile/sync
// Headers: Authorization: Bearer <jwt>
// Body:    the full PlayerStatePayload object (shape owned by the client)
// Returns: { ok, address, updatedAt }
//
// UPSERTs the payload by address. The address comes from the JWT, never
// from the body — that prevents a signed-in player from overwriting
// another player's state by spoofing the address field.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'

const MAX_PAYLOAD_BYTES = 200_000

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

  const payload = req.body
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'payload must be a JSON object' })
  }

  const serialized = JSON.stringify(payload)
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({ error: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes` })
  }

  const now = new Date().toISOString()
  await sql()`
    INSERT INTO player_state (address, payload, updated_at)
    VALUES (${address}, ${serialized}::jsonb, ${now})
    ON CONFLICT (address) DO UPDATE
      SET payload    = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at
  `

  return res.status(200).json({ ok: true, address, updatedAt: now })
}
