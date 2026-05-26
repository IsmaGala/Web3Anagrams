import { useState, useEffect, useRef } from 'react'
import { getAddress } from 'ethers'
import { useGameStore } from '../store/gameStore'
import { useWalletStore } from '../store/walletStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { api } from '../utils/apiClient'
import { playSfx } from '../utils/sfx'
import { useScreenBackdrop } from '../utils/screenBackdrop'
import { buildTransferGalaDto, signGalaDto } from '../utils/galaChain'
import { track } from '../utils/analytics'
import { WORLDS } from '../data/worldData'
import {
  currentWeekId, startWeekIdFromDate, eventPhase,
  timeToNextPhaseChange, formatWeekCountdown,
} from '../utils/gameUtils'
import WalletConnectModal from './WalletConnectModal'

// Gem Store — real GalaChain GALA payments.
//
// Flow:
//   1. Player taps a pack card's PAY button.
//   2. If not connected, wallet-connect modal opens; on success the pack
//      they tapped is resumed automatically.
//   3. We build a TransferToken DTO and sign it via personal_sign.
//   4. POST to /api/store/purchase — server re-validates, forwards to
//      GalaChain, credits gems on Status:1.
//
// See docs/galachain/TOKEN_OPS.md "Purchase Pattern (Server-Mediated)".

interface Pack {
  id:    '1k' | '3k' | '10k'
  gems:  number
  /** GALA quantity to transfer, integer decimal string. Keep in sync
   *  with PACK_CATALOG in api/store/purchase.ts — server is authoritative
   *  on price and will refuse mismatches. */
  gala:  string
  label: string
  badge?: string
  glow:  string
}

const PACKS: Pack[] = [
  { id: '1k',  gems: 1000,  gala: '500',  label: '1,000 GEMS',  glow: 'rgba(167,139,250,0.5)' },
  { id: '3k',  gems: 3000,  gala: '1000', label: '3,000 GEMS',  badge: 'BEST VALUE', glow: 'rgba(34,211,238,0.5)' },
  { id: '10k', gems: 10000, gala: '3000', label: '10,000 GEMS', badge: 'BIGGEST',     glow: 'rgba(251,191,36,0.5)' },
]

// Treasury wallet address (gala form: eth|<EIP55>). Set as
// VITE_GAME_TREASURY_ADDRESS in your .env / Vercel env.
const TREASURY = ((import.meta as any).env?.VITE_GAME_TREASURY_ADDRESS ?? '') as string

const NETWORK_LABEL = (((import.meta as any).env?.VITE_GALACHAIN_NETWORK ?? 'testnet') as string).toUpperCase()

interface PurchaseResponse {
  ok:           boolean
  packId:       string
  gemsCredited: number
  newBalance:   number
}

// Derive the currently-active event world (if any) for the skin slot.
// Uses the same week-id logic as the events page so they stay in sync.
function getActiveEventWorld() {
  const phase   = eventPhase()
  const thisWeek = currentWeekId()
  const targetWeek = phase === 'active' ? thisWeek : thisWeek + 1
  return WORLDS.find(w => w.event && w.startDate && startWeekIdFromDate(w.startDate) === targetWeek) ?? null
}

const EVENT_SKIN_GALA = '5000'

export default function GemStore() {
  const goToSplash    = useGameStore(s => s.goToSplash)
  const gemsBalance   = useGameStore(s => s.gemsBalance)
  const showToast     = useGameStore(s => s.showToast)
  const walletAddress = useWalletStore(s => s.address)
  const walletType    = useWalletStore(s => s.walletType)
  const jwt           = useWalletStore(s => s.jwt)
  const ownedSkins    = useCosmeticsStore(s => s.ownedSkins)
  const [pendingPack, setPendingPack]     = useState<Pack | null>(null)
  const [submitting,  setSubmitting]      = useState(false)
  const [showWalletModal, setShowWalletModal] = useState(false)
  // Countdown to next event phase change (skin rotation).
  const [skinCountdown, setSkinCountdown] = useState(timeToNextPhaseChange())
  // Pack queued while wallet-connect modal was open — resumed on connect.
  const pendingAction = useRef<Pack | null>(null)

  const signedIn = !!walletAddress && !!jwt && !!walletType

  // Current event world + its skin reward
  const [activeEvent, setActiveEvent] = useState(getActiveEventWorld)

  useEffect(() => {
    track('shop_opened', { current_gems: gemsBalance, entry_point: 'gem_store' })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh countdown + active event every second.
  useEffect(() => {
    const id = setInterval(() => {
      setSkinCountdown(timeToNextPhaseChange())
      setActiveEvent(getActiveEventWorld())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // After wallet connects, replay the pack the player originally tapped.
  useEffect(() => {
    if (!walletAddress) return
    const queued = pendingAction.current
    if (!queued) return
    pendingAction.current = null
    showToast('✓ Wallet connected')
    setPendingPack(queued)
  }, [walletAddress, showToast])

  function openPurchase(pack: Pack) {
    playSfx('uiTap')
    if (!signedIn) {
      pendingAction.current = pack
      setShowWalletModal(true)
      return
    }
    if (!TREASURY) {
      showToast('Treasury not configured — set VITE_GAME_TREASURY_ADDRESS')
      return
    }
    track('gala_purchase_initiated', {
      pack_id:        pack.id,
      gala_amount:    pack.gala,
      gems_to_credit: pack.gems,
    })
    setPendingPack(pack)
  }

  function closePurchase() {
    if (submitting) return
    setPendingPack(null)
  }

  // Kick off an event-skin GALA purchase without going through the
  // gem pack flow — uses a dedicated 'event-skin' packId server-side
  // so the server can look up and grant the correct skin for this week.
  async function handleEventSkinPurchase() {
    playSfx('uiTap')
    if (!signedIn) {
      pendingAction.current = { id: '1k', gems: 0, gala: EVENT_SKIN_GALA, label: 'EVENT SKIN', glow: 'rgba(251,191,36,0.5)' }
      setShowWalletModal(true)
      return
    }
    if (!TREASURY) {
      showToast('Treasury not configured')
      return
    }
    setSubmitting(true)
    try {
      const fromGala  = `eth|${getAddress(walletAddress!).slice(2)}`
      const dto       = buildTransferGalaDto({ from: fromGala, to: TREASURY, quantity: EVENT_SKIN_GALA })
      const signedDto = await signGalaDto(walletType!, walletAddress!, dto)
      const resp = await api.post<{ ok: boolean; skinId: string; message?: string }>(
        '/api/store/purchase', { packId: 'event-skin', signedDto }
      )
      if (resp.ok) {
        // Grant the skin locally — server has already recorded it.
        useCosmeticsStore.getState().grantSkin(resp.skinId as any)
        showToast(`✓ ${activeEvent?.name ?? 'Event'} skin unlocked!`)
        track('event_skin_purchased', { skinId: resp.skinId, gala: EVENT_SKIN_GALA })
      }
    } catch (e: any) {
      showToast(`⚠ ${e?.message ?? 'Purchase failed'}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmPurchase() {
    if (!pendingPack || !walletAddress || !walletType) return
    setSubmitting(true)
    try {
      const fromGala  = `eth|${getAddress(walletAddress).slice(2)}`
      const dto       = buildTransferGalaDto({ from: fromGala, to: TREASURY, quantity: pendingPack.gala })
      const signedDto = await signGalaDto(walletType, walletAddress, dto)
      const resp = await api.post<PurchaseResponse>('/api/store/purchase', {
        packId: pendingPack.id, signedDto,
      })
      useGameStore.setState({ gemsBalance: resp.newBalance })
      playSfx('purchase')
      showToast(`✓ +${pendingPack.gems.toLocaleString()} Gems credited`)
      setPendingPack(null)
    } catch (e: any) {
      showToast(`⚠ ${e?.message ?? 'Purchase failed'}`)
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
        BUY GEMS WITH GALA
      </p>

      {/* Network pill */}
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

      {/* ── EVENT SKIN CARD ── */}
      {activeEvent && activeEvent.eventReward?.firstPlaceSkin && (() => {
        const skinId    = activeEvent.eventReward!.firstPlaceSkin!
        const alreadyHas = ownedSkins.has(skinId)
        return (
          <div className="w-full max-w-sm mb-4">
            <div className="relative btn-3d w-full text-left"
              style={{
                background: 'linear-gradient(160deg, #1a0533, #2e1065)',
                border: '4px solid rgba(251,191,36,0.7)',
                borderBottom: '4px solid rgba(120,80,0,0.6)',
                boxShadow: '0 8px 0 rgba(30,0,80,0.7), 0 0 32px rgba(251,191,36,0.25)',
                borderRadius: '20px',
                padding: '18px 16px',
              }}>
              {/* LIMITED badge */}
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-fredoka text-xs px-3 py-0.5 rounded-full"
                style={{ background:'linear-gradient(90deg,#b45309,#fbbf24)', color:'#1c1917', letterSpacing:'1px' }}>
                THIS WEEK ONLY
              </span>

              <div className="flex items-center gap-4 mb-1">
                <span className="text-4xl">{activeEvent.icon}</span>
                <div>
                  <div className="font-fredoka text-lg text-white" style={{ letterSpacing:'1px' }}>
                    {activeEvent.name.toUpperCase()} SKIN
                  </div>
                  <div className="font-nunito font-bold text-xs" style={{ color:'rgba(253,230,138,0.7)' }}>
                    WHEEL SKIN · EVENT EXCLUSIVE
                  </div>
                </div>
              </div>

              {/* Countdown */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="font-nunito font-bold text-xs" style={{ color:'rgba(253,230,138,0.55)' }}>
                  CHANGES IN
                </span>
                <span className="font-fredoka text-sm" style={{ color:'#fde68a', letterSpacing:'1px' }}>
                  {formatWeekCountdown(skinCountdown)}
                </span>
              </div>

              {alreadyHas ? (
                <div className="btn-3d w-full py-3 text-center"
                  style={{
                    background:'linear-gradient(160deg,#374151,#1f2937)',
                    border:'3px solid rgba(134,239,172,0.4)',
                    borderBottom:'3px solid rgba(0,0,0,0.4)',
                    boxShadow:'0 4px 0 rgba(0,0,0,0.4)',
                    borderRadius:'12px',
                    color:'#86efac',
                    fontFamily:'Fredoka One,cursive', fontSize:'1rem', letterSpacing:'1px',
                  }}>
                  ✓ ALREADY OWNED
                </div>
              ) : (
                <button onClick={handleEventSkinPurchase} disabled={submitting} className="btn-3d w-full py-3"
                  style={{
                    background: submitting
                      ? 'linear-gradient(160deg,#374151,#1f2937)'
                      : 'linear-gradient(160deg,#b45309,#92400e)',
                    border: `3px solid ${submitting ? 'rgba(255,255,255,0.15)' : '#fbbf24'}`,
                    borderBottom:`3px solid ${submitting ? 'rgba(0,0,0,0.4)' : '#78350f'}`,
                    boxShadow:`0 4px 0 ${submitting ? 'rgba(0,0,0,0.4)' : '#78350f'}`,
                    borderRadius:'12px',
                    color: submitting ? 'rgba(255,255,255,0.5)' : '#fff',
                    fontFamily:'Fredoka One,cursive', fontSize:'1rem', letterSpacing:'1px',
                    cursor: submitting ? 'wait' : 'pointer',
                  }}>
                  {submitting ? 'PROCESSING…' : (signedIn ? `${EVENT_SKIN_GALA} GALA` : `CONNECT WALLET · ${EVENT_SKIN_GALA} GALA`)}
                </button>
              )}
            </div>
          </div>
        )
      })()}

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
              <div className="font-fredoka text-xl text-white">{pack.label}</div>
            </div>

            <button onClick={() => openPurchase(pack)} className="btn-3d w-full py-3"
              style={{
                background: 'linear-gradient(160deg,#c2410c,#9a3412)',
                border: '3px solid #f97316',
                borderBottom: '3px solid #7c2d12',
                boxShadow: '0 4px 0 #7c2d12',
                borderRadius:'12px',
                color: '#fff',
                fontFamily:'Fredoka One,cursive', fontSize:'1rem', letterSpacing:'1px',
              }}>
              {signedIn ? `${pack.gala} GALA` : `CONNECT WALLET · ${pack.gala} GALA`}
            </button>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {pendingPack && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
          <div className="w-full max-w-xs text-center slide-up">
            <div className="text-7xl mb-3" style={{ filter:`drop-shadow(0 6px 20px ${pendingPack.glow})` }}>💎</div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color:'#a78bfa' }}>
              BUY {pendingPack.label}?
            </h2>
            <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem' }}>
              {pendingPack.gala} GALA
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

      {/* Wallet gate */}
      <WalletConnectModal
        open={showWalletModal}
        onClose={() => {
          if (!walletAddress) pendingAction.current = null
          setShowWalletModal(false)
        }}
      />
    </div>
  )
}
                border: '3px solid #f97316',
                borderBottom: '3px solid #7c2d12',
                boxShadow: '0 4px 0 #7c2d12',
                borderRadius:'12px',
                color: '#fff',
                fontFamily:'Fredoka One,cursive', fontSize:'1rem', letterSpacing:'1px',
              }}>
              {signedIn ? `${pack.gala} GALA` : `CONNECT WALLET · ${pack.gala} GALA`}
            </button>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {pendingPack && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
          <div className="w-full max-w-xs text-center slide-up">
            <div className="text-7xl mb-3" style={{ filter:`drop-shadow(0 6px 20px ${pendingPack.glow})` }}>💎</div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color:'#a78bfa' }}>
              BUY {pendingPack.label}?
            </h2>
            <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem' }}>
              {pendingPack.gala} GALA
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

      {/* Wallet gate */}
      <WalletConnectModal
        open={showWalletModal}
        onClose={() => {
          if (!walletAddress) pendingAction.current = null
          setShowWalletModal(false)
        }}
      />
    </div>
  )
}
