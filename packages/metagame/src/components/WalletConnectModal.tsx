import { useState } from 'react'
import { useWalletStore } from '../store/walletStore'
import { detectWallets } from '../utils/wallet'

export default function WalletConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connectAndLogin = useWalletStore(s => s.connectAndLogin)
  const connecting      = useWalletStore(s => s.connecting)
  const loggingIn       = useWalletStore(s => s.loggingIn)
  const storeError      = useWalletStore(s => s.error)
  const [localError, setLocalError] = useState<string | null>(null)

  if (!open) return null
  const present = detectWallets()
  const busy    = connecting || loggingIn
  const error   = localError ?? storeError

  async function pick(type: 'metamask' | 'gala') {
    setLocalError(null)
    const ok = await connectAndLogin(type)
    if (ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(14px)' }}
    >
      <div className="w-full max-w-xs text-center slide-up">
        <div className="text-6xl mb-3" style={{ filter: 'drop-shadow(0 6px 20px rgba(167,139,250,0.8))' }}>◈</div>
        <h2 className="font-fredoka text-3xl mb-2" style={{ color: '#c4b5fd' }}>CONNECT WALLET</h2>
        <p className="font-nunito font-bold mb-5 px-2" style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>
          Link a wallet to claim your identity. Signing happens locally — no GALA is spent.
        </p>

        {(['metamask', 'gala'] as const).map(type => {
          const detected = present[type]
          const label    = type === 'metamask' ? 'METAMASK' : 'GALA WALLET'
          const icon     = type === 'metamask' ? '🦊' : '🟣'
          return (
            <button
              key={type}
              onClick={() => pick(type)}
              disabled={busy || !detected}
              className="btn-3d w-full py-3 mb-3"
              style={{
                background: detected ? 'linear-gradient(160deg,#4c1d95,#3b0764)' : 'linear-gradient(160deg,#374151,#1f2937)',
                border: `4px solid ${detected ? '#a78bfa' : 'rgba(255,255,255,0.15)'}`,
                borderBottom: `4px solid ${detected ? '#2e1065' : 'rgba(0,0,0,0.4)'}`,
                boxShadow: `0 6px 0 ${detected ? '#1e0050' : 'rgba(0,0,0,0.4)'}`,
                borderRadius: '18px',
                color: detected ? '#fff' : 'rgba(255,255,255,0.5)',
                fontFamily: 'Fredoka One, cursive',
                fontSize: '1.1rem',
                cursor: detected ? 'pointer' : 'not-allowed',
              }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl">{icon}</span>
                <span>{detected ? label : `${label} · NOT FOUND`}</span>
              </div>
            </button>
          )
        })}

        {busy && (
          <p className="font-nunito font-bold mt-2" style={{ color: '#c4b5fd', fontSize: '0.85rem' }}>
            {loggingIn ? 'Signing in…' : 'Connecting…'}
          </p>
        )}
        {error && (
          <p className="font-nunito font-bold mt-2" style={{ color: '#f87171', fontSize: '0.8rem' }}>
            {error}
          </p>
        )}

        <button
          onClick={onClose}
          disabled={busy}
          className="mt-4 font-nunito font-bold"
          style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
