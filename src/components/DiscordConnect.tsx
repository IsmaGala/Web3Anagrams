// ─────────────────────────────────────────────────────────────────────────────
// DiscordConnect — button shown on Splash after wallet is connected.
//
// States:
//   • not connected → "CONNECT DISCORD" button
//   • loading       → spinner while popup is open / request is in-flight
//   • connected     → shows avatar + handle + UNLINK option
//
// OAuth2 popup flow:
//   1. Open discord.com/oauth2/authorize in a small popup
//   2. Discord redirects to /discord-callback with ?code=
//   3. DiscordCallback exchanges the code and posts DISCORD_SUCCESS to this window
//   4. This component receives the message, updates discordStore, closes the loop
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { useDiscordStore } from '../store/discordStore'
import { unlinkDiscord } from '../utils/discordClient'

const DISCORD_PURPLE = '#5865F2'

function buildOAuthUrl(): string {
  const clientId    = import.meta.env.VITE_DISCORD_CLIENT_ID ?? ''
  const redirectUri = import.meta.env.VITE_DISCORD_REDIRECT_URI
    ?? `${window.location.origin}/discord-callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'identify',
  })
  return `https://discord.com/oauth2/authorize?${params}`
}

export default function DiscordConnect() {
  const { connected, handle, avatarUrl, setDiscord, clearDiscord } = useDiscordStore()
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const popupRef = useRef<Window | null>(null)

  // Listen for postMessage from /discord-callback popup
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return

      if (e.data?.type === 'DISCORD_SUCCESS') {
        const { discord_handle, discord_avatar_url } = e.data.payload
        setDiscord(discord_handle, discord_avatar_url)
        setLoading(false)
        setError(null)
        popupRef.current?.close()
        popupRef.current = null
      }

      if (e.data?.type === 'DISCORD_ERROR') {
        setError(e.data.error ?? 'Discord linking failed.')
        setLoading(false)
        popupRef.current?.close()
        popupRef.current = null
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [setDiscord])

  // Detect if user closes the popup without completing the flow
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        setLoading(false)
        popupRef.current = null
      }
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  function openPopup() {
    setError(null)
    setLoading(true)
    const url = buildOAuthUrl()
    const popup = window.open(
      url,
      'discord-oauth',
      'width=480,height=700,menubar=no,toolbar=no,location=no,status=no'
    )
    if (!popup) {
      setLoading(false)
      setError('Popup was blocked. Please allow popups for this site.')
      return
    }
    popupRef.current = popup
  }

  async function handleUnlink() {
    setConfirmUnlink(false)
    setLoading(true)
    try {
      await unlinkDiscord()
      clearDiscord()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to unlink Discord.')
    } finally {
      setLoading(false)
    }
  }

  // ── Connected state ────────────────────────────────────────────────────────
  if (connected && handle) {
    return (
      <div className="w-full mb-3">
        {!confirmUnlink ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
            style={{
              background: 'rgba(88,101,242,0.15)',
              border: `2px solid rgba(88,101,242,0.5)`,
            }}>
            {/* Avatar */}
            {avatarUrl ? (
              <img src={avatarUrl} alt={handle}
                style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                <DiscordIcon size={22} />
              </span>
            )}
            {/* Handle */}
            <span className="font-nunito font-bold text-sm flex-1 truncate"
              style={{ color: '#c4b5fd', letterSpacing: '0.5px' }}>
              {handle}
            </span>
            {/* Unlink button */}
            <button
              onClick={() => setConfirmUnlink(true)}
              className="font-nunito font-bold text-xs px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(0,0,0,0.3)',
                color: 'rgba(196,181,253,0.6)',
                border: '1px solid rgba(88,101,242,0.3)',
                flexShrink: 0,
              }}>
              UNLINK
            </button>
          </div>
        ) : (
          /* Unlink confirmation inline */
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
            style={{ background: 'rgba(127,29,29,0.3)', border: '2px solid rgba(248,113,113,0.4)' }}>
            <span className="font-nunito font-bold text-xs flex-1"
              style={{ color: '#fca5a5' }}>
              Unlink Discord?
            </span>
            <button onClick={handleUnlink}
              className="font-nunito font-bold text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(248,113,113,0.25)', color: '#fca5a5',
                border: '1px solid rgba(248,113,113,0.4)' }}>
              YES
            </button>
            <button onClick={() => setConfirmUnlink(false)}
              className="font-nunito font-bold text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.2)', color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.15)' }}>
              NO
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Not connected state ────────────────────────────────────────────────────
  return (
    <div className="w-full mb-3">
      <button
        onClick={openPopup}
        disabled={loading}
        className="w-full flex items-center gap-3 px-4 py-2 rounded-2xl"
        style={{
          background: loading ? 'rgba(88,101,242,0.1)' : 'rgba(88,101,242,0.18)',
          border: `2px solid ${loading ? 'rgba(88,101,242,0.25)' : 'rgba(88,101,242,0.55)'}`,
          cursor: loading ? 'default' : 'pointer',
          transition: 'all 0.2s',
        }}>
        <DiscordIcon size={20} />
        <span className="font-nunito font-bold text-sm flex-1 text-left"
          style={{ color: loading ? 'rgba(196,181,253,0.5)' : '#c4b5fd', letterSpacing: '1px' }}>
          {loading ? 'WAITING FOR DISCORD…' : 'CONNECT DISCORD'}
        </span>
        {!loading && <span style={{ color: 'rgba(196,181,253,0.5)', fontSize: '1rem' }}>›</span>}
      </button>

      {error && (
        <p className="font-nunito text-xs mt-1 text-center px-2"
          style={{ color: '#fca5a5' }}>
          {error}
        </p>
      )}

      <p className="font-nunito text-center mt-1 px-2"
        style={{ color: 'rgba(196,181,253,0.4)', fontSize: '0.7rem' }}>
        Show your Discord name on the leaderboard
      </p>
    </div>
  )
}

// Inline Discord logo SVG — no external dependency
function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={DISCORD_PURPLE}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
  )
}
