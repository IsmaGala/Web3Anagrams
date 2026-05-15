import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useWalletStore } from '../store/walletStore'
import { signMessage } from '../utils/wallet'
import { api } from '../utils/apiClient'
import { playSfx } from '../utils/sfx'

// Gem Store — the on-chain GALA / GUSDC entry point.
//
// V4 ships with the FULL purchase UX (3 packs × 2 payment methods) but the
// actual chain submission is stubbed on the server (see /api/store/purchase).
// The flow is real where it can be: the player signs a payment-intent
// message with their wallet, the server verifies the signature, and gems
// credit immediately to player_state.payload.economy.gemsBalance.
//
// To go live: swap the stub in api/store/purchase.ts for a real TransferToken
// DTO submission against the GalaChain gateway. See the inline TODO there.

interface Pack {
  id:    '1k' | '3k' | '10k'
  gems:  number
  usd:   number
  label: string
  badge?: string
  glow:  string
}

const PACKS: Pack[] = [
  { id: '1k',  gems: 1000,  usd: 2,  label: '1,000 GEMS',  glow: 'rgba(167,139,250,0.5)' },
  { id: '3k',  gems: 3000,  usd: 5,  label: '3,000 GEMS',  badge: 'BEST VALUE', glow: 'rgba(34,211,238,0.5)' },
  { id: '10k', gems: 10000, usd: 10, label: '10,000 GEMS', badge: 'BIGGEST',     glow: 'rgba(251,191,36,0.5)' },
]

type PayMethod = 'GALA' | 'GUSDC'

interface PurchaseResponse {
  ok:         boolean
  packId:     string
  gemsCredited: number
  newBalance: number
}

export default function GemStore() {
  const goToSplash    = useGameStore(s => s.goToSplash)
  const gemsBalance   = useGameStore(s => s.gemsBalance)
  const showToast     = useGameStore(s => s.showToast)
  const walletAddress = useWalletStore(s => s.address)
  const walletType    = useWalletStore(s => s.walletType)
  const jwt           = useWalletStore(s => s.jwt)
  const [pendingPack, setPendingPack] = useState<Pack | null>(null)
  const [pendingMethod, setPendingMethod] = useState<PayMethod | null>(null)
  const [submitting,  setSubmitting]  = useState(false)

  const signedIn = !!walletAddress && !!jwt && !!walletType

  function openPurchase(pack: Pack, method: PayMethod) {
    playSfx('uiTap')
    if (!signedIn) {
      showToast('Connect a wallet on the splash to buy Gems')
      return
    }
    setPendingPack(pack)
    setPendingMethod(method)
  }

  function closePurchase() {
    if (submitting) return
    setPendingPack(null)
    setPendingMethod(null)
  }

  async function handleConfirmPurchase() {
    if (!pendingPack || !pendingMethod || !walletAddress || !walletType) return
    setSubmitting(true)
    try {
      // Build a human-readable payment-intent message. The player sees this
      // verbatim in their wallet's signing prompt, so wording matters.
      // Server re-derives the same string from the request body to verify
      // the signature matches exactly what was approved.
      const nonce = crypto.randomUUID()
      const message = [
        'NFT WordChain — Gem Purchase',
        `Pack: ${pendingPack.label}`,
        `Pay:  ${pendingMethod}`,
        `USD:  $${pendingPack.usd}`,
        `Nonce: ${nonce}`,
      ].join('\n')

      const signature = await signMessage(walletType, walletAddress, message)

      const resp = await api.post<PurchaseResponse>('/api/store/purchase', {
        packId:    pendingPack.id,
        method:    pendingMethod,
        message,
        signature,
      })

      // Credit gems locally to match what the server stored. The next
      // profileSync.pullAndApply (which fires on the leaderboard refetch
      // or any state-change push) will reconcile if there's drift.
      useGameStore.setState({ gemsBalance: resp.newBalance })
      playSfx('purchase')
      showToast(`✓ +${pendingPack.gems.toLocaleString()} Gems credited`)
      setPendingPack(null); setPendingMethod(null)
    } catch (e: any) {
      const msg = e?.message ?? 'Purchase failed'
      showToast(`⚠ ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-10 px-4"
      style={{ background:'linear-gradient(180deg,#2e1065 0%,#1a0533 60%,#0d0220 100%)' }}>

      {/* Back */}
      <div className="self-start mb-5">
        <button onClick={() => { playSfx('uiTap'); goToSplash() }} className="btn-3d flex items-center gap-2 px-5 py-3"
          style={{ background:'linear-gradient(160deg,#4c1d95,#3b0764)',
            border:'3px solid #7c3aed', borderBottom:'3px solid #2e1065',
            boxShadow:'0 5px 0 #1e0050', borderRadius:'14px',
            color:'#e9d5ff', fontFamily:'Fredoka One,cursive', fontSize:'1rem' }}>
          ‹ MENU
        </button>
      </div>

      <h1 className="font-fredoka text-4xl text-center mb-1"
        style={{ color:'#a78bfa', textShadow:'0 4px 24px rgba(167,139,250,0.4)' }}>
        GEM STORE
      </h1>
      <p className="font-nunito font-bold text-sm mb-2"
        style={{ color:'rgba(196,181,253,0.5)', letterSpacing:'2px' }}>
        BUY GEMS WITH GALA OR GUSDC
      </p>

      {/* TEST MODE pill — clearly labels this as not-yet-on-chain. The stub
          server credits gems immediately on a successful signature, with no
          actual token transfer. */}
      <div className="px-3 py-1 rounded-full mb-4"
        style={{ background:'rgba(251,191,36,0.15)', border:'1.5px solid rgba(251,191,36,0.4)' }}>
        <span className="font-fredoka text-xs" style={{ color:'#fbbf24', letterSpacing:'1.5px' }}>
          TEST MODE · NO TOKENS WILL BE TRANSFERRED
        </span>
      </div>

      {/* Gems balance chip */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full mb-6"
        style={{ background:'rgba(167,139,250,0.08)', border:'2px solid rgba(167,139,250,0.25)' }}>
        <span style={{ color:'#a78bfa' }}>◈</span>
        <span className="font-fredoka text-base" style={{ color:'#a78bfa' }}>{gemsBalance.toLocaleString()}</span>
        <span className="font-nunito font-bold text-xs" style={{ color:'rgba(196,181,253,0.4)' }}>GEMS</span>
      </div>

      {/* Wallet sign-in nudge */}
      {!signedIn && (
        <div className="w-full max-w-sm mb-5 p-3 rounded-xl"
          style={{ background:'rgba(127,29,29,0.18)', border:'1.5px solid rgba(248,113,113,0.35)' }}>
          <p className="font-nunito font-bold text-xs text-center" style={{ color:'#fecaca', lineHeight:1.45 }}>
            Connect a wallet on the splash to enable purchases.
            The store needs your signature to verify the buyer.
          </p>
        </div>
      )}

      {/* Pack cards */}
      <div className="w-full max-w-sm flex flex-col gap-4">
        {PACKS.map(pack => (
          <div key={pack.id} className="relative btn-3d w-full text-left"
            style={{
              background: 'linear-gradient(160deg,#3b0764,#2e1065)',
              border: '4px solid rgba(167,139,250,0.5)',
              borderBottom: '4px solid rgba(76,29,149,0.6)',
              boxShadow: `0 8px 0 rgba(30,0,80,0.7), 0 0 28px ${pack.glow}`,
              borderRadius: '20px',
              padding: '18px 16px',
            }}>
            {pack.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-fredoka text-xs px-3 py-0.5 rounded-full"
                style={{ background:'linear-gradient(90deg,#f59e0b,#fbbf24)', color:'#1c1917', letterSpacing:'1px' }}>
                {pack.badge}
              </span>
            )}

            <div className="flex items-center gap-4 mb-3">
              <span className="text-4xl" style={{ filter:`drop-shadow(0 4px 8px ${pack.glow})` }}>💎</span>
              <div className="flex-1">
                <div className="font-fredoka text-xl text-white">{pack.label}</div>
                <div className="font-nunito font-bold text-sm" style={{ color:'rgba(196,181,253,0.55)' }}>
                  ${pack.usd} value
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => openPurchase(pack, 'GALA')} disabled={!signedIn}
                className="btn-3d py-3"
                style={{
                  background: signedIn
                    ? 'linear-gradient(160deg,#c2410c,#9a3412)'
                    : 'linear-gradient(160deg,#374151,#1f2937)',
                  border: `3px solid ${signedIn ? '#f97316' : 'rgba(255,255,255,0.15)'}`,
                  borderBottom: `3px solid ${signedIn ? '#7c2d12' : 'rgba(0,0,0,0.4)'}`,
                  boxShadow: `0 4px 0 ${signedIn ? '#7c2d12' : 'rgba(0,0,0,0.4)'}`,
                  borderRadius:'12px',
                  color: signedIn ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontFamily:'Fredoka One,cursive', fontSize:'0.95rem', letterSpacing:'1px',
                  cursor: signedIn ? 'pointer' : 'not-allowed',
                }}>
                PAY · GALA
              </button>
              <button onClick={() => openPurchase(pack, 'GUSDC')} disabled={!signedIn}
                className="btn-3d py-3"
                style={{
                  background: signedIn
                    ? 'linear-gradient(160deg,#15803d,#166534)'
                    : 'linear-gradient(160deg,#374151,#1f2937)',
                  border: `3px solid ${signedIn ? '#22c55e' : 'rgba(255,255,255,0.15)'}`,
                  borderBottom: `3px solid ${signedIn ? '#14532d' : 'rgba(0,0,0,0.4)'}`,
                  boxShadow: `0 4px 0 ${signedIn ? '#14532d' : 'rgba(0,0,0,0.4)'}`,
                  borderRadius:'12px',
                  color: signedIn ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontFamily:'Fredoka One,cursive', fontSize:'0.95rem', letterSpacing:'1px',
                  cursor: signedIn ? 'pointer' : 'not-allowed',
                }}>
                PAY · GUSDC
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm modal — appears after a Buy tap, drives the signing flow. */}
      {pendingPack && pendingMethod && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
          <div className="w-full max-w-xs text-center slide-up">
            <div className="text-7xl mb-3" style={{ filter:`drop-shadow(0 6px 20px ${pendingPack.glow})` }}>💎</div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color:'#a78bfa' }}>
              BUY {pendingPack.label}?
            </h2>
            <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem' }}>
              ${pendingPack.usd} via {pendingMethod}
            </p>
            <p className="font-nunito font-bold mb-6 px-2"
              style={{ color:'rgba(251,191,36,0.85)', fontSize:'0.78rem', lineHeight:1.4 }}>
              TEST MODE — your wallet will be asked to sign a payment-intent
              message, but no tokens are transferred yet. Gems credit immediately.
            </p>

            <button onClick={handleConfirmPurchase} disabled={submitting} className="btn-3d w-full py-3 mb-3"
              style={{
                background: submitting
                  ? 'linear-gradient(160deg,#374151,#1f2937)'
                  : 'linear-gradient(160deg,#7c3aed,#6d28d9)',
                border:`4px solid ${submitting ? 'rgba(255,255,255,0.15)' : '#a78bfa'}`,
                borderBottom:`4px solid ${submitting ? 'rgba(0,0,0,0.4)' : '#4c1d95'}`,
                boxShadow:`0 6px 0 ${submitting ? 'rgba(0,0,0,0.4)' : '#3b0764'}`,
                borderRadius:'18px',
                color: submitting ? 'rgba(255,255,255,0.55)' : '#fff',
                fontFamily:'Fredoka One,cursive', fontSize:'1.1rem',
                cursor: submitting ? 'wait' : 'pointer',
              }}>
              {submitting ? 'SIGNING…' : `SIGN & BUY · $${pendingPack.usd}`}
            </button>

            <button onClick={closePurchase} disabled={submitting} className="btn-3d w-full py-3"
              style={{
                background:'linear-gradient(160deg,#1e293b,#0f172a)',
                border:'3px solid #475569', borderBottom:'3px solid #0f172a',
                boxShadow:'0 5px 0 #0f172a', borderRadius:'14px',
                color:'#cbd5e1', fontFamily:'Fredoka One,cursive', fontSize:'1rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
