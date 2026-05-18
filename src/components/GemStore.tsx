import { useState } from 'react'
import { getAddress } from 'ethers'
import { useGameStore } from '../store/gameStore'
import { useWalletStore } from '../store/walletStore'
import { api } from '../utils/apiClient'
import { playSfx } from '../utils/sfx'
import { useScreenBackdrop } from '../utils/screenBackdrop'
import { buildTransferGalaDto, signGalaDto } from '../utils/galaChain'

// Gem Store — real GalaChain GALA payments.
//
// Flow:
//   1. Player taps PAY · GALA on a pack.
//   2. We build a TransferToken DTO transferring the pack's GALA price
//      from the player's wallet to VITE_GAME_TREASURY_ADDRESS.
//   3. The wallet (MetaMask or Gala Wallet) signs it via personal_sign.
//   4. We POST the signed DTO to /api/store/purchase, which:
//        a. Re-validates the fields match the catalog.
//        b. Forwards the signed DTO to the GalaChain gateway.
//        c. On Status:1, credits gems via the server-authoritative
//           economy helper.
//
// GUSDC is staged but disabled until the second pass.
// See docs/galachain/TOKEN_OPS.md "Purchase Pattern (Server-Mediated)".

interface Pack {
  id:    '1k' | '3k' | '10k'
  gems:  number
  usd:   number
  /** GALA quantity to transfer, integer decimal string. Keep this in
   *  sync with PACK_CATALOG in api/store/purchase.ts — server is
   *  authoritative on price and will refuse mismatches. */
  gala:  string
  label: string
  badge?: string
  glow:  string
}

const PACKS: Pack[] = [
  { id: '1k',  gems: 1000,  usd: 2,  gala: '100', label: '1,000 GEMS',  glow: 'rgba(167,139,250,0.5)' },
  { id: '3k',  gems: 3000,  usd: 5,  gala: '250', label: '3,000 GEMS',  badge: 'BEST VALUE', glow: 'rgba(34,211,238,0.5)' },
  { id: '10k', gems: 10000, usd: 10, gala: '500', label: '10,000 GEMS', badge: 'BIGGEST',     glow: 'rgba(251,191,36,0.5)' },
]

type PayMethod = 'GALA' | 'GUSDC'

// Treasury wallet address (gala form: eth|<EIP55>). Set as
// VITE_GAME_TREASURY_ADDRESS in your .env / Vercel env. Public info —
// it's the address that appears in every TransferToken.to field.
const TREASURY = ((import.meta as any).env?.VITE_GAME_TREASURY_ADDRESS ?? '') as string

// Banner — surfaces which GalaChain network we're targeting so testers
// don't accidentally think mainnet is live.
const NETWORK_LABEL = (((import.meta as any).env?.VITE_GALACHAIN_NETWORK ?? 'testnet') as string).toUpperCase()

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
    if (method === 'GUSDC') {
      // Staged but not yet wired to a real GUSDC TransferToken DTO. The
      // button stays visible (disabled) so users know it's coming.
      showToast('GUSDC payments coming soon — use GALA for now')
      return
    }
    if (!TREASURY) {
      showToast('Treasury not configured — set VITE_GAME_TREASURY_ADDRESS')
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
    if (pendingMethod !== 'GALA') return  // GUSDC is gated above
    setSubmitting(true)
    try {
      // 1. Translate the wallet's storage form (lowercase 0x...) into the
      //    gala form (eth|<EIP55>) that GalaChain expects on the wire.
      //    EIP-55 checksumming is required — the gateway silently fails
      //    on un-checksummed addresses (doc §10.1).
      const fromGala = `eth|${getAddress(walletAddress).slice(2)}`

      // 2. Build the unsigned TransferToken DTO. uniqueKey is generated
      //    inside buildTransferGalaDto — 32 random bytes for replay
      //    protection.
      const dto = buildTransferGalaDto({
        from:     fromGala,
        to:       TREASURY,
        quantity: pendingPack.gala,
      })

      // 3. Sign it. The wallet shows the deterministic JSON in its
      //    prompt — not pretty, but verifiable. Both MetaMask and Gala
      //    Wallet use personal_sign here; the chaincode reconstructs
      //    the same hash from the `prefix` we attach.
      const signedDto = await signGalaDto(walletType, walletAddress, dto)

      // 4. Hand off to the server. It re-validates the DTO fields
      //    against the pack catalog, forwards to the GalaChain gateway,
      //    and credits gems only on Status:1.
      const resp = await api.post<PurchaseResponse>('/api/store/purchase', {
        packId:    pendingPack.id,
        signedDto,
      })

      // 5. Mirror the server-authoritative balance into local state.
      //    profileSync.pullAndApply will reconcile any drift later.
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
      style={{ background: useScreenBackdrop('linear-gradient(180deg,#2e1065 0%,#1a0533 60%,#0d0220 100%)') }}>

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

      {/* Network pill — surfaces which gateway we'll hit so testers don't
          confuse testnet GALA with mainnet GALA. Defaults to TESTNET. */}
      <div className="px-3 py-1 rounded-full mb-4"
        style={{
          background: NETWORK_LABEL === 'MAINNET' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
          border:     NETWORK_LABEL === 'MAINNET' ? '1.5px solid rgba(34,197,94,0.4)' : '1.5px solid rgba(251,191,36,0.4)',
        }}>
        <span className="font-fredoka text-xs"
          style={{ color: NETWORK_LABEL === 'MAINNET' ? '#22c55e' : '#fbbf24', letterSpacing:'1.5px' }}>
          {NETWORK_LABEL === 'MAINNET' ? 'MAINNET · LIVE GALA' : 'TESTNET · USE TEST GALA'}
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
                  fontFamily:'Fredoka One,cursive', fontSize:'0.92rem', letterSpacing:'1px',
                  cursor: signedIn ? 'pointer' : 'not-allowed',
                }}>
                {pack.gala} GALA
              </button>
              {/* GUSDC: visible but disabled — full DTO/SDK path lands in v2. */}
              <button onClick={() => openPurchase(pack, 'GUSDC')} disabled
                className="btn-3d py-3"
                style={{
                  background:'linear-gradient(160deg,#374151,#1f2937)',
                  border:'3px solid rgba(255,255,255,0.15)',
                  borderBottom:'3px solid rgba(0,0,0,0.4)',
                  boxShadow:'0 4px 0 rgba(0,0,0,0.4)',
                  borderRadius:'12px',
                  color:'rgba(255,255,255,0.45)',
                  fontFamily:'Fredoka One,cursive', fontSize:'0.92rem', letterSpacing:'1px',
                  cursor:'not-allowed',
                }}>
                GUSDC · SOON
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
              {pendingPack.gala} GALA · ${pendingPack.usd} value
            </p>
            <p className="font-nunito font-bold mb-6 px-2"
              style={{
                color: NETWORK_LABEL === 'MAINNET' ? 'rgba(34,197,94,0.85)' : 'rgba(251,191,36,0.85)',
                fontSize:'0.78rem', lineHeight:1.4,
              }}>
              {NETWORK_LABEL === 'MAINNET'
                ? 'Your wallet will sign a real GALA transfer to the game treasury. Gems credit after the transfer confirms on-chain.'
                : 'TESTNET — sign with testnet GALA only. Gems credit after the chain confirms the transfer.'}
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
              {submitting ? 'SIGNING & SUBMITTING…' : `SIGN & PAY · ${pendingPack.gala} GALA`}
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
