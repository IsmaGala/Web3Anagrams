// ─────────────────────────────────────────────────────────────────────────────
// discordClient — thin wrappers around /api/auth/discord
// ─────────────────────────────────────────────────────────────────────────────

import { api, apiFetch } from './apiClient'

export interface DiscordLinkResult {
  discord_handle:     string
  discord_avatar_url: string | null
}

/** Exchange an OAuth2 code for a linked Discord identity. */
export async function linkDiscord(code: string): Promise<DiscordLinkResult> {
  return api.post<DiscordLinkResult>('/api/auth/discord', { code })
}

/** Remove the Discord link for the current wallet. */
export async function unlinkDiscord(): Promise<void> {
  await apiFetch('/api/auth/discord', { method: 'DELETE' })
}
