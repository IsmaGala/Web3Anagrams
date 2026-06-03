// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/discord   — link a Discord account to an authenticated wallet
// DELETE /api/auth/discord — unlink (remove discord_connections row)
//
// Flow (POST):
//   1. Caller must be wallet-authenticated (Bearer JWT in Authorization header)
//   2. Body: { code: string }  — the OAuth2 code from Discord's redirect
//   3. Server exchanges code → access token → GET /users/@me
//   4. Upserts discord_connections keyed by wallet address
//   5. Access token is discarded immediately — never stored
//   6. Returns { discord_handle, discord_avatar_url }
//
// Scope required on Discord app: identify (no email, no guilds)
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '../_lib/vercel-compat.js'
import { applyCors }   from '../_lib/cors.js'
import { requireAuth }  from '../_lib/jwt.js'
import { sql }          from '../_lib/db.js'
import { grantGems, grantHints, hasReceivedGrant } from '../_lib/economy.js'
import { FIRST_WALLET_BONUS } from '../_data/worldsServerData.js'

// ── Config helpers ────────────────────────────────────────────────────────────

function discordConfig() {
  const clientId     = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const redirectUri  = process.env.DISCORD_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Discord env vars. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI.'
    )
  }
  return { clientId, clientSecret, redirectUri }
}

// ── Discord API helpers ───────────────────────────────────────────────────────

interface DiscordTokenResponse {
  access_token: string
  token_type:   string
  scope:        string
}

interface DiscordUser {
  id:           string
  username:     string
  global_name:  string | null
  avatar:       string | null
}

async function exchangeCode(code: string): Promise<DiscordTokenResponse> {
  const { clientId, clientSecret, redirectUri } = discordConfig()

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    client_secret: clientSecret,
  })

  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord token exchange failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<DiscordTokenResponse>
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Discord /users/@me failed (${res.status})`)
  }

  return res.json() as Promise<DiscordUser>
}

function avatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
}

// ── POST handler ──────────────────────────────────────────────────────────────

async function handleLink(req: VercelRequest, res: VercelResponse) {
  // Require wallet auth
  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Wallet authentication required' })
  }

  const { code } = (req.body ?? {}) as { code?: string }
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing code in request body' })
  }

  let tokenData: DiscordTokenResponse
  try {
    tokenData = await exchangeCode(code)
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? 'Failed to exchange Discord code' })
  }

  let discordUser: DiscordUser
  try {
    discordUser = await fetchDiscordUser(tokenData.access_token)
  } catch (e: any) {
    return res.status(502).json({ error: e?.message ?? 'Failed to fetch Discord user' })
  }

  // access_token is used above and intentionally not stored beyond this point
  const handle    = discordUser.global_name ?? discordUser.username
  const avatarHash = discordUser.avatar

  const db = sql()

  // Check if this wallet already had a Discord connection (re-link = no bonus)
  const existing = await db`
    SELECT address FROM discord_connections WHERE address = ${address} LIMIT 1
  ` as Array<{ address: string }>
  const isFirstLink = existing.length === 0

  await db`
    INSERT INTO discord_connections (address, discord_id, discord_handle, discord_avatar)
    VALUES (${address}, ${discordUser.id}, ${handle}, ${avatarHash})
    ON CONFLICT (address) DO UPDATE
      SET discord_id     = EXCLUDED.discord_id,
          discord_handle = EXCLUDED.discord_handle,
          discord_avatar = EXCLUDED.discord_avatar,
          connected_at   = NOW()
  `

  // First-time Discord bonus — same amount as the wallet welcome bonus, granted once.
  let firstDiscordBonusGranted: { gems: number; hints: number } | undefined
  if (isFirstLink) {
    const alreadyBonused = await hasReceivedGrant({ address, reason: 'first_discord_bonus' })
    if (!alreadyBonused) {
      await grantGems ({ address, amount: FIRST_WALLET_BONUS.gems,  reason: 'first_discord_bonus' })
      await grantHints({ address, amount: FIRST_WALLET_BONUS.hints, reason: 'first_discord_bonus' })
      firstDiscordBonusGranted = { gems: FIRST_WALLET_BONUS.gems, hints: FIRST_WALLET_BONUS.hints }
    }
  }

  return res.status(200).json({
    discord_handle:      handle,
    discord_avatar_url:  avatarUrl(discordUser),
    firstDiscordBonusGranted,
  })
}

// ── DELETE handler ────────────────────────────────────────────────────────────

async function handleUnlink(req: VercelRequest, res: VercelResponse) {
  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Wallet authentication required' })
  }

  const db = sql()
  await db`DELETE FROM discord_connections WHERE address = ${address}`

  return res.status(204).end()
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method === 'POST')   return handleLink(req, res)
  if (req.method === 'DELETE') return handleUnlink(req, res)

  res.setHeader('Allow', 'POST, DELETE, OPTIONS')
  return res.status(405).json({ error: 'Method not allowed' })
}
