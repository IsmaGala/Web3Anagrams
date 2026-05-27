import { useState } from 'react'
import { useWalletStore } from '../store/walletStore'
import { detectWallets } from '../utils/wallet'

// Wallet picker — appears when the player taps the "CONNECT WALLET" pill on
// the splash. Lists MetaMask and Gala Wallet, greys out any not detected
// in `window`. Auto-closes on successful connect; surfaces the wallet's
// own rejection / error message inline on failure.

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

  // connectAndLogin: pops the wallet's account prompt, then immediately
  // signs the server nonce and exchanges it for a JWT. The player sees
  // two extension prompts in a row — one for "share account" and one for
  // "sign this nonce to log in".
  async function pick(type: 'metamask' | 'gala') {
    setLocalError(null)
    const ok = await connectAndLogin(type)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
      <div className="w-full max-w-xs text-center slide-up">
        <div className="text-6xl mb-3" style={{ filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))' }}>◈</div>
        <h2 className="font-fredoka text-3xl mb-2" style={{ color:'#c4b5fd' }}>CONNECT WALLET</h2>
        <p className="font-nunito font-bold mb-5 px-2" style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.85rem' }}>
          Link a wallet to claim your identity. Signing happens locally — no GALA is spent.
        </p>

        <button onClick={() => pick('metamask')} disabled={busy || !present.metamask}
          /* during a login the modal stays open and just dims */
          className="btn-3d w-full py-3 mb-3"
          style={{
            background: present.metamask
              ? 'linear-gradient(160deg, #c2410c, #9a3412)'
              : 'linear-gradient(160deg, #374151, #1f2937)',
            border: `4px solid ${present.metamask ? '#f97316' : 'rgba(255,255,255,0.15)'}`,
            borderBottom: `4px solid ${present.metamask ? '#7c2d12' : 'rgba(0,0,0,0.4)'}`,
            boxShadow: `0 6px 0 ${present.metamask ? '#7c2d12' : 'rgba(0,0,0,0.4)'}`,
            borderRadius:'18px',
            color: present.metamask ? '#fff' : 'rgba(255,255,255,0.5)',
            fontFamily:'Fredoka One,cursive', fontSize:'1.1rem',
            cursor: present.metamask ? 'pointer' : 'not-allowed',
          }}>
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">🦊</span>
            <span>{present.metamask ? 'METAMASK' : 'METAMASK · NOT FOUND'}</span>
          </div>
        </button>

        {/* Gala Wallet — disabled until EIP-712 signing is implemented */}
        <button disabled
          className="btn-3d w-full py-3 mb-4"
          style={{
            background:'linear-gradient(160deg, #374151, #1f2937)',
            border:'4px solid rgba(255,255,255,0.15)',
            borderBottom:'4px solid rgba(0,0,0,0.4)',
            boxShadow:'0 6px 0 rgba(0,0,0,0.4)',
            borderRadius:'18px',
            color:'rgba(255,255,255,0.35)',
            fontFamily:'Fredoka One,cursive', fontSize:'1.1rem',
            cursor:'not-allowed',
            position:'relative',
          }}>
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl" style={{ opacity:0.4 }}>🟣</span>
            <span>GALA WALLET</span>
            <span style={{
              fontSize:'0.6rem', fontFamily:'Nunito,sans-serif', fontWeight:800,
              letterSpacing:'0.08em', color:'#a78bfa',
              background:'rgba(167,139,250,0.15)', border:'1.5px solid rgba(167,139,250,0.4)',
              borderRadius:'6px', padding:'2px 7px',
              verticalAlign:'middle',
            }}>COMING SOON</span>
          </div>
        </button>

        {error && (
          <p className="font-nunito font-bold mb-3 px-3 py-2 rounded-lg"
            style={{ background:'rgba(127,29,29,0.4)', border:'1.5px solid #b91c1c', color:'#fecaca', fontSize:'0.8rem' }}>
            ⚠ {error}
          </p>
        )}
        {!present.metamask && (
          <p className="font-nunito font-bold mb-3 text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>
            No wallet detected. Install MetaMask to continue.
          </p>
        )}

        <button onClick={onClose} disabled={busy} className="btn-3d w-full py-3"
          style={{
            background:'linear-gradient(160deg,#1e293b,#0f172a)',
            border:'3px solid #475569', borderBottom:'3px solid #0f172a',
            boxShadow:'0 5px 0 #0f172a', borderRadius:'14px',
            color:'#cbd5e1', fontFamily:'Fredoka One,cursive', fontSize:'1rem',
          }}>
          CANCEL
        </button>
      </div>
    </div>
  )
}
