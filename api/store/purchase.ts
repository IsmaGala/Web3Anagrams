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
import { createHmac, createHash } from 'node:crypto'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { parseWalletAddress } from '../_lib/wallet.js'
import { grantGems } from '../_lib/economy.js'
import { track } from '../_lib/analytics.js'

// Pack catalog — keep in sync with src/components/GemStore.tsx PACKS.
// `gala` is the GALA quantity (integer string) the player pays. Server
// is authoritative on pricing; we ignore whatever the client claims.
const PACK_CATALOG: Record<string, { gems: number; usd: number; gala: string }> = {
  '1k':  { gems: 1000,  usd: 2,  gala: '100' },
  '3k':  { gems: 3000,  usd: 5,  gala: '250' },
  '10k': { gems: 10000, usd: 10, gala: '500' },
}

// GalaChain gateway base URL. The older hostnames behave like this:
//   • gateway-testnet.galachain.com — serves reads fine but hangs
//     indefinitely on TransferToken writes. Avoid for writes.
//   • gateway.gala.games — referenced by the team's PoC but does NOT
//     resolve publicly (NXDOMAIN even from Cloudflare). Likely an
//     internal-only host.
//   • gateway-mainnet.galachain.com — exists publicly and is the
//     canonical write gateway per the team's own bootstrap doc.
// We default to the mainnet host on both branches and let GALACHAIN_*
// env vars override per environment.
const NETWORK = (process.env.GALACHAIN_NETWORK ?? 'testnet').toLowerCase()
const GATEWAY = NETWORK === 'mainnet'
  ? (process.env.GALACHAIN_GATEWAY_MAINNET
      ?? 'https://gateway-mainnet.galachain.com/api/asset/token-contract')
  : (process.env.GALACHAIN_GATEWAY_TESTNET
      ?? 'https://gateway-testnet.galachain.com/api/testnet01/gc-a9b8b472b035c0510508c248d1110d3162b7e5f4-GalaChainToken')

// Required. The wallet that receives player GALA payments. MUST be in
// gala form (`eth|<EIP55>`) — we compare it byte-for-byte against
// signedDto.to. If unset, purchases are disabled at the server boundary
// rather than silently misrouting funds.
const TREASURY = process.env.GAME_TREASURY_ADDRESS

// Optional HMAC auth for the gateway. If both env vars are set, every
// request to GalaChain gets X-Api-Key / X-Timestamp / X-Signature headers
// computed per WALLET_AUTH.md §8. If unset, requests go out unauth'd
// (matches the old behavior; works only for gateways that don't gate
// writes behind HMAC).
//
// Observed (2026-05): testnet gateway accepts read endpoints without
// auth but silently hangs on writes when these headers are absent.
// Without the key+secret pair from Gala, every TransferToken request
// will time out. Set both env vars when your teammate sends them.
const GATEWAY_API_KEY = process.env.GALACHAIN_GATEWAY_API_KEY
const GATEWAY_SECRET  = process.env.GALACHAIN_GATEWAY_SECRET

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
  // Serialize once so the HMAC body-hash and the actual POST body are
  // byte-identical. Even though JSON.stringify is deterministic for a
  // given object, computing it twice is a footgun waiting to bite.
  const bodyStr     = JSON.stringify(signedDto)
  const transferUrl = `${GATEWAY}/TransferToken`

  // Build headers. If gateway HMAC is configured, attach the three auth
  // headers per WALLET_AUTH.md §8. If not, send a plain POST and hope
  // the gateway accepts unauth'd writes (it usually doesn't on testnet).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (GATEWAY_API_KEY && GATEWAY_SECRET) {
    const urlPath   = new URL(transferUrl).pathname  // e.g. /api/asset/token-contract/TransferToken
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyHash  = createHash('sha256').update(bodyStr).digest('hex')
    const toSign    = `${timestamp}\nPOST\n${urlPath}\n${bodyHash}`
    const signature = createHmac('sha256', GATEWAY_SECRET).update(toSign).digest('hex')
    headers['X-Api-Key']   = GATEWAY_API_KEY
    headers['X-Timestamp'] = timestamp
    headers['X-Signature'] = signature
  }

  let gatewayResp: Response
  try {
    // Hard 20s timeout. Real TransferToken latency is sub-second; anything
    // that takes longer is upstream-broken (testnet flaking, wrong path
    // accepted-then-hung, missing auth, …) and we'd rather surface that
    // as a real 502 than let the Vercel function run to its own platform
    // timeout (which returns an opaque banner with no clue what hung).
    gatewayResp = await fetch(transferUrl, {
      method:  'POST',
      headers,
      body:    bodyStr,
      signal:  AbortSignal.timeout(20_000),
    })
  } catch (e: any) {
    const isTimeout = e?.name === 'TimeoutError' || e?.code === 'ETIMEDOUT'
    // undici hides the actual network reason (ENOTFOUND, ECONNREFUSED, etc.)
    // in e.cause — surface it so "fetch failed" turns into something
    // diagnosable. The cause may also have its own .cause chain (e.g.,
    // TLS error -> system error); walk it to a depth of 3.
    const causeChain: string[] = []
    let cur: any = e?.cause
    for (let i = 0; cur && i < 3; i++) {
      const part = cur.code ? `${cur.code}: ${cur.message ?? ''}` : (cur.message ?? String(cur))
      causeChain.push(part)
      cur = cur.cause
    }
    track('gala_gateway_timeout', {
      address:          authAddr,
      pack_id:          packId,
      url:              transferUrl,
      hmac_auth_enabled: !!(GATEWAY_API_KEY && GATEWAY_SECRET),
      timeout_ms:       20000,
      error_detail:     e?.message ?? String(e),
      network:          NETWORK,
    })
    return res.status(502).json({
      error:  isTimeout
        ? 'GalaChain gateway timed out after 20s — testnet may be unhealthy, or gateway HMAC auth is required and not configured'
        : 'GalaChain gateway unreachable',
      detail:    e?.message ?? String(e),
      cause:     causeChain.length > 0 ? causeChain : undefined,
      url:       transferUrl,
      hmacAuth:  GATEWAY_API_KEY && GATEWAY_SECRET ? 'enabled' : 'disabled (no GALACHAIN_GATEWAY_API_KEY / GALACHAIN_GATEWAY_SECRET)',
    })
  }
  if (!gatewayResp.ok) {
    let body = ''
    try { body = await gatewayResp.text() } catch {}
    return res.status(502).json({
      error:    `GalaChain gateway returned HTTP ${gatewayResp.status}`,
      detail:   body.slice(0, 500),
      url:      transferUrl,
      hmacAuth: GATEWAY_API_KEY && GATEWAY_SECRET ? 'enabled' : 'disabled',
    })
  }
  // Canonical chain tx ID lives in the X-Transaction-Id header (the body's
  // Data field is opaque). Capture it for the audit log so support can
  // trace a credit back to the on-chain payment.
  const chainTxId = gatewayResp.headers.get('x-transaction-id') ?? null

  let chainResult: any
  try {
    chainResult = await gatewayResp.json()
  } catch (e: any) {
    return res.status(502).json({ error: 'GalaChain gateway returned non-JSON', detail: e?.message })
  }

  // ErrorCode 409 = "uniqueKey already processed" — the payment IS on-chain,
  // we're just seeing a retry. Treat it as success per PoC line 232.
  const isReplaySuccess = chainResult?.Status !== 1
    && chainResult?.Error?.ErrorCode === 409

  if (chainResult?.Status !== 1 && !isReplaySuccess) {
    // Chaincode rejected (bad signature, insufficient GALA, unregistered
    // wallet, …). Surface the chain's own message so the player sees
    // "insufficient balance" instead of a generic failure.
    track('gala_purchase_failed', {
      address:      authAddr,
      pack_id:      packId,
      gala_amount:  pack.gala,
      error_detail: chainResult?.Error?.Message ?? chainResult?.Message ?? chainResult?.ErrorKey ?? 'unknown chaincode error',
      error_code:   chainResult?.Error?.ErrorCode ?? null,
      network:      NETWORK,
    })
    return res.status(402).json({
      ok:      false,
      error:   'GalaChain transfer failed',
      detail:  chainResult?.Error?.Message
            ?? chainResult?.Message
            ?? chainResult?.ErrorKey
            ?? 'unknown chaincode error',
      errorCode: chainResult?.Error?.ErrorCode ?? null,
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
      chainTxId,
      chainTxData: chainResult?.Data ?? null,
      replay:      isReplaySuccess || undefined,
    },
  })

  track('gala_purchase_success', {
    address:      authAddr,
    pack_id:      packId,
    gala_spent:   pack.gala,
    gems_credited: pack.gems,
    new_balance:  granted.newBalance,
    chain_tx_id:  chainTxId,
    network:      NETWORK,
    replay:       isReplaySuccess || undefined,
  })

  return res.status(200).json({
    ok:           true,
    packId,
    gemsCredited: pack.gems,
    newBalance:   granted.newBalance,
  })
}
