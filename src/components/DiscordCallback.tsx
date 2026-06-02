// ─────────────────────────────────────────────────────────────────────────────
// DiscordCallback — rendered at /discord-callback
//
// Discord redirects here after the user authorises the app.
// This component:
//   1. Reads the `code` query param
//   2. Calls POST /api/auth/discord to exchange it
//   3. Posts the result to the opener window via postMessage
//   4. Closes itself
//
// It is shown in a small popup; the main window listens for the message and
// updates the discord store.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'

export default function DiscordCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code  = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      const msg = error === 'access_denied'
        ? 'Discord authorisation was cancelled.'
        : 'Missing code from Discord.'
      setStatus('error')
      setErrorMsg(msg)
      window.opener?.postMessage({ type: 'DISCORD_ERROR', error: msg }, window.location.origin)
      setTimeout(() => window.close(), 2500)
      return
    }

    // Send the code to the parent window — the parent has the JWT and will
    // call the API. The popup must not call the API itself (no JWT here).
    setStatus('success')
    window.opener?.postMessage({ type: 'DISCORD_CODE', code }, window.location.origin)
    setTimeout(() => window.close(), 1200)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(180deg, #2e1065 0%, #1a0533 100%)',
      fontFamily: 'sans-serif', color: '#fff', padding: '2rem',
    }}>
      {status === 'loading' && (
        <>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
            <img src="https://cdn.discordapp.com/embed/avatars/0.png"
              alt="" width={48} height={48}
              style={{ borderRadius: '50%', filter: 'grayscale(0.2)' }} />
          </div>
          <p style={{ color: '#c4b5fd', fontWeight: 700, letterSpacing: 2 }}>
            LINKING DISCORD…
          </p>
        </>
      )}
      {status === 'success' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✓</div>
          <p style={{ color: '#86efac', fontWeight: 700, letterSpacing: 2 }}>
            DISCORD LINKED!
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: 8 }}>
            Closing…
          </p>
        </>
      )}
      {status === 'error' && (
        <>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✕</div>
          <p style={{ color: '#fca5a5', fontWeight: 700, letterSpacing: 2 }}>
            SOMETHING WENT WRONG
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center' }}>
            {errorMsg}
          </p>
        </>
      )}
    </div>
  )
}
