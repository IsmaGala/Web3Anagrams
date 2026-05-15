// POST /api/store/purchase
// Headers: Authorization: Bearer <jwt>
// Body:    { packId: '1k' | '3k' | '10k', method: 'GALA' | 'GUSDC',
//            message: string, signature: string }
// Returns: { ok, packId, gemsCredited, newBalance }
//
// V4 STUB: validates the wallet signature on the payment-intent message but
// does NOT execute a real chain transfer. Gems are credited directly to the
// player's player_state row. To go live, replace the "STUB" block below
// with a real GalaChain TransferToken DTO submission. See docs/wallet/
// WALLET_AUTH.md §6 and §8 for the receiving side; the client already
// produced a personal_sign signature that the chaincode can verify.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyMessage, keccak256, recoverAddress } from 'ethers'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'

// Pack catalog — keep in sync with src/components/GemStore.tsx PACKS array.
// Single source of truth would be nicer; for now duplicate-and-document.
const PACK_CATALOG: Record<string, { gems: number; usd: number }> = {
  '1k':  { gems: 1000,  usd: 2  },
  '3k':  { gems: 3000,  usd: 5  },
  '10k': { gems: 10000, usd: 10 },
}

const ALLOWED_METHODS = new Set(['GALA', 'GUSDC'])

function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]+$/.test(s)
}

/** Same multi-variant recovery used by /api/auth/verify. MetaMask uses
 *  standard EIP-191 over the raw message; Gala Wallet hex-encodes the
 *  bytes first. Accept whichever recovers the requesting wallet. */
function recoverAll(message: string, signature: string): string[] {
  const out: string[] = []
  const hex = '0x' + Buffer.from(message, 'utf8').toString('hex')
  try { out.push(verifyMessage(message, signature).toLowerCase()) } catch {}
  try { out.push(verifyMessage(hex,     signature).toLowerCase()) } catch {}
  try { out.push(recoverAddress(keccak256(hex), signature).toLowerCase()) } catch {}
  return out
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

  const { packId, method, message, signature } = (req.body ?? {}) as {
    packId?: string; method?: string; message?: string; signature?: string
  }

  if (!packId || !PACK_CATALOG[packId]) {
    return res.status(400).json({ error: 'Invalid packId' })
  }
  if (!method || !ALLOWED_METHODS.has(method)) {
    return res.status(400).json({ error: 'Invalid payment method — must be GALA or GUSDC' })
  }
  if (typeof message !== 'string' || message.length === 0 || message.length > 1000) {
    return res.status(400).json({ error: 'Invalid payment-intent message' })
  }
  if (!isHex(signature)) {
    return res.status(400).json({ error: 'Invalid signature — must be 0x-prefixed hex' })
  }

  // Spot-check the message — it should mention the pack and method the
  // client is claiming. A real adversary could craft a different message
  // that signs correctly; this is a defense-in-depth tripwire.
  const pack = PACK_CATALOG[packId]
  if (!message.includes(packId === '1k' ? '1,000' : packId === '3k' ? '3,000' : '10,000')) {
    return res.status(400).json({ error: 'Payment-intent message does not match packId' })
  }
  if (!message.includes(method)) {
    return res.status(400).json({ error: 'Payment-intent message does not match payment method' })
  }

  // Recover signer and verify it's the wallet behind the JWT. This is the
  // critical authorization check — without it, anyone with a leaked JWT
  // could mint Gems for the JWT's owner without their consent.
  const recovered = recoverAll(message, signature)
  if (!recovered.includes(address)) {
    return res.status(401).json({ error: 'Signature does not match the requesting wallet' })
  }

  // ───── STUB: TODO real chain integration ─────
  // What goes here for production:
  //   1. Build an unsigned TransferToken DTO with `from = address`,
  //      `to = process.env.GAME_TREASURY_ADDRESS`, the right token (GALA or
  //      GUSDC), and the USD-equivalent quantity.
  //   2. Submit it to GalaChain via the gateway (HMAC auth — see
  //      WALLET_AUTH.md §8). The chaincode verifies the client signature
  //      against the DTO hash (we already collected the personal_sign above;
  //      the gateway accepts it as part of the DTO payload).
  //   3. Await confirmation. On success, fall through to the credit logic
  //      below. On failure, return 502 with the gateway error.
  //
  // For now: skip the chain submission entirely. The signature check above
  // is enough to prove the player approved the purchase, which is all the
  // stub flow needs.
  // ──────────────────────────────────────────────

  // Credit gems on the server's player_state row. We merge into the
  // existing JSONB payload via SQL so a concurrent profile sync doesn't
  // race-clobber the credit.
  const rows = await sql()`
    INSERT INTO player_state (address, payload, updated_at)
    VALUES (
      ${address},
      jsonb_build_object(
        'v', 1,
        'economy', jsonb_build_object('gemsBalance', ${pack.gems}::int, 'hints', 3)
      ),
      NOW()
    )
    ON CONFLICT (address) DO UPDATE
      SET payload = jsonb_set(
            player_state.payload,
            '{economy,gemsBalance}',
            to_jsonb(
              COALESCE(
                (player_state.payload->'economy'->>'gemsBalance')::int,
                (player_state.payload->'economy'->>'galaBalance')::int,
                0
              ) + ${pack.gems}::int
            ),
            true
          ),
          updated_at = NOW()
    RETURNING (payload->'economy'->>'gemsBalance')::int AS new_balance
  ` as Array<{ new_balance: number }>

  const newBalance = rows[0]?.new_balance ?? pack.gems

  return res.status(200).json({
    ok:           true,
    packId,
    gemsCredited: pack.gems,
    newBalance,
  })
}
