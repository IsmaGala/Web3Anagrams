// POST /api/store/purchase
// Headers: Authorization: Bearer <jwt>
// Body:    { packId: '1k' | '3k' | '10k', signedDto: <signed TransferToken DTO> }
// Returns: { ok, packId, gemsCredited, newBalance }
//
// Real GalaChain flow. The client:
//   1. Built a TransferToken DTO via src/utils/galaChain.buildTransferGalaDto
//   2. Signed it via signGalaDto (deterministic JSON + EIP-191 prefix +
//      personal_sign on MetaMask or Gala Wallet)
//   3. Posted the signed DTO here.
//
// This endpoint:
//   1. Re-validates the DTO fields match the pack the client claims to be
//      buying (from = authed wallet, to = treasury, token = GALA, quantity
//      matches catalog). If anything differs, the player signed something
//      different from what they're claiming — refuse.
//   2. Forwards the signed DTO to GalaChain's gateway. Chaincode verifies
//      the signature, debits the player's GALA, credits the treasury.
//   3. On Status: 1, credits gems via grantGems (server-authoritative
//      economy with audit log).
//
// References:
//   docs/galachain/TOKEN_OPS.md "Purchase Pattern (Server-Mediated)"
//   docs/galachain/WALLET_AUTH.md §8

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { parseWalletAddress } from '../_lib/wallet.js'
import { grantGems } from '../_lib/economy.js'

// Pack catalog — keep in sync with src/components/GemStore.tsx PACKS.
// `gala` is the GALA quantity (integer string) the player pays. Server
// is authoritative on pricing; we ignore whatever the client claims.
const PACK_CATALOG: Record<string, { gems: number; usd: number; gala: string }> = {
  '1k':  { gems: 1000,  usd: 2,  gala: '100' },
  '3k':  { gems: 3000,  usd: 5,  gala: '250' },
  '10k': { gems: 10000, usd: 10, gala: '500' },
}

// Testnet by default. Flip to mainnet by setting GALACHAIN_NETWORK=mainnet
// (and funding GAME_TREASURY_ADDRESS with real GALA). The full URLs are
// overridable for staging / private gateways.
//
// Note (2026-05): the bootstrap doc's older testnet URL
// (.../api/testnet01/gc-<hash>-GalaChainToken) returns 404. Gala's
// current testnet uses the same /api/asset/token-contract path layout
// as mainnet — only the host differs.
const NETWORK = (process.env.GALACHAIN_NETWORK ?? 'testnet').toLowerCase()
const GATEWAY = NETWORK === 'mainnet'
  ? (process.env.GALACHAIN_GATEWAY_MAINNET
      ?? 'https://gateway-mainnet.galachain.com/api/asset/token-contract')
  : (process.env.GALACHAIN_GATEWAY_TESTNET
      ?? 'https://gateway-testnet.galachain.com/api/asset/token-contract')

// Required. The wallet that receives player GALA payments. MUST be in
// gala form (`eth|<EIP55>`) — we compare it byte-for-byte against
// signedDto.to. If unset, purchases are disabled at the server boundary
// rather than silently misrouting funds.
const TREASURY = process.env.GAME_TREASURY_ADDRESS

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!TREASURY || !TREASURY.startsWith('eth|')) {
    return res.status(500).json({
      error: 'GAME_TREASURY_ADDRESS is not set or not in gala form (eth|<EIP55>) — purchases disabled',
    })
  }

  const authAddr = await requireAuth(req.headers.authorization)
  if (!authAddr) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  const { packId, signedDto } = (req.body ?? {}) as {
    packId?:    string
    signedDto?: Record<string, any>
  }

  if (!packId || !PACK_CATALOG[packId]) {
    return res.status(400).json({ error: 'Invalid packId' })
  }
  if (!signedDto || typeof signedDto !== 'object') {
    return res.status(400).json({ error: 'signedDto is required' })
  }
  const pack = PACK_CATALOG[packId]

  // Translate the JWT-derived storage address (0x<lower>) → gala form
  // (eth|<EIP55>) so it can be compared against signedDto.from exactly.
  let expectedFrom: string
  try {
    expectedFrom = parseWalletAddress(authAddr).gala
  } catch {
    return res.status(500).json({ error: 'JWT contains an address we cannot parse — re-login' })
  }

  // ── DTO field validation ────────────────────────────────────────────────
  // Each of these guards refuses a request where the player signed
  // something that wouldn't credit the right account or amount. The
  // chaincode will catch most of these too, but failing here is faster
  // and produces clearer error messages.
  if (signedDto.from !== expectedFrom) {
    return res.status(401).json({
      error: `TransferToken.from (${signedDto.from}) does not match the authenticated wallet`,
    })
  }
  if (signedDto.to !== TREASURY) {
    return res.status(400).json({
      error: 'TransferToken.to must be the game treasury wallet',
    })
  }
  const inst = signedDto.tokenInstance
  if (!inst
      || inst.collection    !== 'GALA'
      || inst.category      !== 'Unit'
      || inst.type          !== 'none'
      || inst.additionalKey !== 'none'
      || inst.instance      !== '0') {
    return res.status(400).json({
      error: 'TransferToken.tokenInstance must be the GALA fungible class (GALA|Unit|none|none, instance "0")',
    })
  }
  if (String(signedDto.quantity) !== pack.gala) {
    return res.status(400).json({
      error: `Expected quantity ${pack.gala} GALA for pack ${packId}, got ${signedDto.quantity}`,
    })
  }
  if (typeof signedDto.signature !== 'string' || signedDto.signature.length === 0) {
    return res.status(400).json({
      error: 'signedDto is missing the signature field — did the client call signGalaDto?',
    })
  }
  if (typeof signedDto.uniqueKey !== 'string' || signedDto.uniqueKey.length === 0) {
    return res.status(400).json({
      error: 'signedDto is missing uniqueKey — required for chain replay protection',
    })
  }

  // ── Submit to GalaChain ────────────────────────────────────────────────
  // The gateway responds with { Status: 1, Data: ... } on success or
  // { Status: 0, Message: '...' } on failure (per TOKEN_OPS.md "Gateway").
  // We treat anything else (non-2xx HTTP, parse failure, network error)
  // as 502 — the player did everything right; the chain didn't.
  let gatewayResp: Response
  try {
    gatewayResp = await fetch(`${GATEWAY}/TransferToken`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(signedDto),
    })
  } catch (e: any) {
    return res.status(502).json({
      error:   'GalaChain gateway unreachable',
      detail:  e?.message ?? String(e),
    })
  }
  if (!gatewayResp.ok) {
    let body = ''
    try { body = await gatewayResp.text() } catch {}
    return res.status(502).json({
      error:  `GalaChain gateway returned HTTP ${gatewayResp.status}`,
      detail: body.slice(0, 500),
    })
  }
  let chainResult: any
  try {
    chainResult = await gatewayResp.json()
  } catch (e: any) {
    return res.status(502).json({ error: 'GalaChain gateway returned non-JSON', detail: e?.message })
  }
  if (chainResult?.Status !== 1) {
    // Chaincode rejected (bad signature, insufficient GALA, replay, …).
    // Surface the chain's own message to the client so the player sees
    // "insufficient balance" instead of a generic failure.
    return res.status(402).json({
      ok:      false,
      error:   'GalaChain transfer failed',
      detail:  chainResult?.Message ?? chainResult?.ErrorKey ?? 'unknown chaincode error',
    })
  }

  // ── Credit gems ────────────────────────────────────────────────────────
  // Use the audit-logged grant helper so the server economy stays atomic
  // and inspectable. The metadata captures the chain tx for support.
  const granted = await grantGems({
    address:  authAddr,
    amount:   pack.gems,
    reason:   'store_purchase',
    metadata: {
      packId,
      gala:        pack.gala,
      uniqueKey:   signedDto.uniqueKey,
      network:     NETWORK,
      chainTxData: chainResult?.Data ?? null,
    },
  })

  return res.status(200).json({
    ok:           true,
    packId,
    gemsCredited: pack.gems,
    newBalance:   granted.newBalance,
  })
}
