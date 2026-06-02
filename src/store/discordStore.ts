// ─────────────────────────────────────────────────────────────────────────────
// discordStore — persists the linked Discord identity across sessions.
//
// Stores only: handle (display name) + avatar URL.
// The source of truth is the server (discord_connections table); this is a
// client-side cache so the UI renders immediately without a round-trip.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DiscordState {
  handle:    string | null
  avatarUrl: string | null
  connected: boolean

  setDiscord: (handle: string, avatarUrl: string | null) => void
  clearDiscord: () => void
}

export const useDiscordStore = create<DiscordState>()(
  persist(
    (set) => ({
      handle:    null,
      avatarUrl: null,
      connected: false,

      setDiscord: (handle, avatarUrl) =>
        set({ handle, avatarUrl, connected: true }),

      clearDiscord: () =>
        set({ handle: null, avatarUrl: null, connected: false }),
    }),
    { name: 'wc_discord_v1' }
  )
)
