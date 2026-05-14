import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useWalletStore } from '../store/walletStore'
import { getStreak, timeToMidnight } from '../utils/gameUtils'
import { shortAddress } from '../utils/wallet'
import { playSfx } from '../utils/sfx'
import SfxToggle from './SfxToggle'
import WalletConnectModal from './WalletConnectModal'

// Wraps a click handler with the menu-confirm tap SFX. Keeps every button's
// onClick site short.
function tap<T extends any[]>(fn: (...args: T) => void) {
  return (...args: T) => { playSfx('uiTap'); fn(...args) }
}

export default function Splash() {
  const goToGame       = useGameStore(s => s.goToGame)
  const goToPremium    = useGameStore(s => s.goToPremium)
  const goToEvents     = useGameStore(s => s.goToEvents)
  const payToRetryDaily= useGameStore(s => s.payToRetryDaily)
  const galaBalance    = useGameStore(s => s.galaBalance)
  const hints          = useGameStore(s => s.hints)
  // Sub to the raw dailyAttempt field so React re-renders when it flips
  // (calling the selector inside the component is cheap; the getter handles
  // the "is today's attempt stale?" check for us).
  useProgressStore(s => s.dailyAttempt)
  const todaysAttempt  = useProgressStore(s => s.getTodaysDailyAttempt)()

  const walletAddress  = useWalletStore(s => s.address)
  const walletDisconnect = useWalletStore(s => s.disconnect)
  const [showWalletModal, setShowWalletModal] = useState(false)
  // Disconnect now wipes local state (progress, premium, economy) so a stray
  // tap on the pill is destructive-feeling. The confirmation modal makes the
  // action explicit and reassures the player their data is safe on the server.
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [countdown, setCountdown] = useState(timeToMidnight())
  const streak = getStreak()

  useEffect(() => {
    const id = setInterval(() => setCountdown(timeToMidnight()), 1000)
    return () => clearInterval(id)
  }, [])

  // Daily card state machine
  const dailyState: 'available' | 'won' | 'lost' = !todaysAttempt
    ? 'available'
    : todaysAttempt.status === 'won' ? 'won' : 'lost'

  const canAffordRetry = galaBalance >= 1

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0d0220 100%)' }}>

      <div className="absolute z-20" style={{ top: 16, right: 16 }}>
        <SfxToggle variant="splash" />
      </div>

      <div className="splash-blob blob1" />
      <div className="splash-blob blob2" />
      <div className="splash-blob blob3" />

      {[...Array(18)].map((_, i) => (
        <div key={i} className="absolute rounded-full bg-white"
          style={{ width: Math.random()*3+1, height: Math.random()*3+1,
            top: `${Math.random()*90}%`, left: `${Math.random()*100}%`,
            opacity: Math.random()*0.6+0.2,
            animation: `pulse ${2+Math.random()*3}s ease infinite`, animationDelay: `${Math.random()*3}s` }} />
      ))}

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-5 py-6">
        <div className="mb-2 text-6xl" style={{ filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))', animation:'bounce 2s ease infinite alternate' }}>
          ⬡
        </div>
        <h1 className="font-fredoka text-center mb-1 shimmer-text"
          style={{ fontSize:'2.4rem', letterSpacing:'2px', lineHeight:1.1 }}>
          NFT<br/>WORDCHAIN
        </h1>
        <p className="font-nunito font-bold text-sm tracking-widest mb-3 uppercase"
          style={{ color:'rgba(196,181,253,0.5)' }}>
          by Gala Games
        </p>

        {/* Currency strip — always visible so the player has constant context
            on their gala balance and hint count without entering a sub-screen.
            Pulls live values from gameStore; updates as they're spent/earned. */}
        <div className="flex items-center gap-3 mb-4 px-4 py-1 rounded-full"
          style={{ background:'rgba(0,0,0,0.25)', border:'1.5px solid rgba(167,139,250,0.15)' }}>
          <span className="flex items-center gap-1.5">
            <span style={{ color:'#22d3ee' }}>◈</span>
            <span className="font-fredoka text-sm" style={{ color:'#e9d5ff' }}>{galaBalance.toLocaleString()}</span>
          </span>
          <span style={{ color:'rgba(167,139,250,0.35)' }}>·</span>
          <span className="flex items-center gap-1.5">
            <span style={{ fontSize:'0.85rem' }}>💡</span>
            <span className="font-fredoka text-sm" style={{ color:'#fde68a' }}>{hints}</span>
          </span>
        </div>

        {/* Wallet pill — opens connect modal when empty, shows address +
            disconnect when connected. When disconnected, a value-prop
            microcaption explains what connecting does so a new player has
            a reason to tap. */}
        {walletAddress ? (
          <div className="flex items-center gap-2 mb-5 px-4 py-2 rounded-full"
            style={{ background:'rgba(124,58,237,0.15)', border:'2px solid rgba(167,139,250,0.4)' }}>
            <span style={{ color:'#a78bfa' }}>◈</span>
            <span className="font-nunito font-bold text-sm" style={{ color:'#c4b5fd', letterSpacing:'1px' }}>
              {shortAddress(walletAddress)}
            </span>
            <button onClick={tap(() => setShowDisconnectConfirm(true))}
              className="font-nunito font-bold text-xs ml-1 px-2 py-0.5 rounded-full"
              style={{ background:'rgba(0,0,0,0.3)', color:'rgba(196,181,253,0.7)',
                border:'1px solid rgba(167,139,250,0.3)' }}>
              DISCONNECT
            </button>
          </div>
        ) : (
          <>
            <button onClick={tap(() => setShowWalletModal(true))}
              className="flex items-center gap-2 mb-1.5 px-5 py-2 rounded-full"
              style={{ background:'rgba(255,255,255,0.07)', border:'2px solid rgba(167,139,250,0.3)',
                cursor:'pointer' }}>
              <span style={{ color:'#a78bfa' }}>◈</span>
              <span className="font-nunito font-bold text-sm" style={{ color:'rgba(196,181,253,0.85)', letterSpacing:'2px' }}>
                CONNECT WALLET
              </span>
              <span className="text-xs">›</span>
            </button>
            <p className="font-nunito text-center mb-4 px-2"
              style={{ color:'rgba(196,181,253,0.45)', fontSize:'0.72rem', lineHeight:1.4 }}>
              Save progress across devices · Compete for weekly rewards
            </p>
          </>
        )}

        <button onClick={tap(() => goToGame('single'))} className="btn-3d w-full mb-3"
          style={{ background:'linear-gradient(160deg, #7c3aed, #6d28d9)',
            border:'4px solid #a78bfa', borderBottom:'4px solid #4c1d95',
            boxShadow:'0 8px 0 #3b0764, 0 0 30px rgba(124,58,237,0.4)',
            borderRadius:'20px', padding:'16px 22px' }}>
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🎮</span>
            <span className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>SINGLE PLAYER</span>
            <span className="ml-auto text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* Daily — three visual modes */}
        {dailyState === 'available' && (
          <button onClick={tap(() => goToGame('daily'))} className="btn-3d w-full mb-3"
            style={{ background:'linear-gradient(160deg, #d97706, #b45309)',
              border:'4px solid #fbbf24', borderBottom:'4px solid #78350f',
              boxShadow:'0 8px 0 #451a03, 0 0 30px rgba(217,119,6,0.4)',
              borderRadius:'20px', padding:'16px 22px' }}>
            <div className="flex items-center gap-4">
              <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🏆</span>
              <div className="flex-1 text-left">
                <div className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>DAILY</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.6)' }}>RESETS</span>
                  <span className="font-fredoka text-sm" style={{ color:'#fde68a' }}>{countdown}</span>
                  {streak > 0 && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background:'rgba(0,0,0,0.25)', color:'#fde68a' }}>
                      🔥{streak}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
            </div>
          </button>
        )}

        {dailyState === 'won' && (
          <div className="btn-3d w-full mb-3"
            style={{ background:'linear-gradient(160deg, rgba(217,119,6,0.35), rgba(180,83,9,0.25))',
              border:'4px solid rgba(251,191,36,0.4)', borderBottom:'4px solid rgba(120,53,15,0.4)',
              boxShadow:'0 6px 0 rgba(0,0,0,0.4)',
              borderRadius:'20px', padding:'16px 22px', cursor:'default' }}>
            <div className="flex items-center gap-4">
              <span className="text-4xl">✓</span>
              <div className="flex-1 text-left">
                <div className="font-fredoka text-xl" style={{ color:'#fde68a', letterSpacing:'1px' }}>DAILY DONE</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.55)' }}>NEXT IN</span>
                  <span className="font-fredoka text-sm" style={{ color:'#fde68a' }}>{countdown}</span>
                  {streak > 0 && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background:'rgba(0,0,0,0.25)', color:'#fde68a' }}>
                      🔥{streak}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {dailyState === 'lost' && (
          <button onClick={tap(payToRetryDaily)} disabled={!canAffordRetry} className="btn-3d w-full mb-3"
            style={{
              background: canAffordRetry
                ? 'linear-gradient(160deg, #7f1d1d, #991b1b)'
                : 'linear-gradient(160deg, #3f3f46, #18181b)',
              border:`4px solid ${canAffordRetry ? '#f87171' : 'rgba(255,255,255,0.15)'}`,
              borderBottom:`4px solid ${canAffordRetry ? '#450a0a' : 'rgba(0,0,0,0.4)'}`,
              boxShadow:`0 8px 0 ${canAffordRetry ? '#450a0a' : 'rgba(0,0,0,0.4)'}, 0 0 28px ${canAffordRetry ? 'rgba(248,113,113,0.3)' : 'transparent'}`,
              borderRadius:'20px', padding:'16px 22px',
              cursor: canAffordRetry ? 'pointer' : 'not-allowed',
            }}>
            <div className="flex items-center gap-4">
              <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>💀</span>
              <div className="flex-1 text-left">
                <div className="font-fredoka text-xl" style={{ color: canAffordRetry ? '#fecaca' : 'rgba(255,255,255,0.5)', letterSpacing:'1px' }}>
                  DAILY FAILED
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-bold" style={{ color: canAffordRetry ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)' }}>
                    {canAffordRetry ? 'RETRY · ◈ 1' : 'NEED 1 GALA · RESETS'}
                  </span>
                  <span className="font-fredoka text-sm" style={{ color:'#fda4af' }}>{countdown}</span>
                </div>
              </div>
              <span className="text-2xl" style={{ color: canAffordRetry ? '#fecaca' : 'rgba(255,255,255,0.3)' }}>›</span>
            </div>
          </button>
        )}

        <button onClick={tap(goToPremium)} className="btn-3d w-full mb-3"
          style={{ background:'linear-gradient(160deg, #0e7490, #155e75)',
            border:'4px solid #22d3ee', borderBottom:'4px solid #042f2e',
            boxShadow:'0 8px 0 #042f2e, 0 0 30px rgba(34,211,238,0.4)',
            borderRadius:'20px', padding:'16px 22px' }}>
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🛸</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>PREMIUM</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color:'rgba(207,250,254,0.7)' }}>
                UNLOCK NEW WORLDS WITH GALA
              </div>
            </div>
            <span className="text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        <button onClick={tap(goToEvents)} className="btn-3d w-full mb-5"
          style={{ background:'linear-gradient(160deg, #075985, #0c4a6e)',
            border:'4px solid #0ea5e9', borderBottom:'4px solid #082f49',
            boxShadow:'0 8px 0 #082f49, 0 0 30px rgba(14,165,233,0.4)',
            borderRadius:'20px', padding:'16px 22px' }}>
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🌊</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>WEEKLY EVENTS</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color:'rgba(186,230,253,0.7)' }}>
                LEADERBOARD HINT-PACK REWARDS
              </div>
            </div>
            <span className="text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        <p className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.2)', letterSpacing:'2px' }}>
          NFT WORDCHAIN v1.0
        </p>
      </div>

      <WalletConnectModal open={showWalletModal} onClose={() => setShowWalletModal(false)} />

      {/* Disconnect confirmation — disconnect now wipes local state, so we
          double-check before pulling the trigger. The message reassures the
          player their data is safe on the server (which it is, courtesy of
          flushPush in walletStore.disconnect). */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
          <div className="w-full max-w-xs text-center slide-up">
            <div className="text-6xl mb-3" style={{ filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))' }}>◈</div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color:'#c4b5fd' }}>DISCONNECT?</h2>
            <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem' }}>
              Your progress is saved on the server.
            </p>
            <p className="font-nunito font-bold mb-6 px-2" style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.78rem', lineHeight:1.4 }}>
              Reconnecting this wallet on any device will restore your levels, premium worlds, and event scores.
            </p>

            <button
              onClick={tap(() => { setShowDisconnectConfirm(false); walletDisconnect() })}
              className="btn-3d w-full py-3 mb-3"
              style={{
                background:'linear-gradient(160deg,#991b1b,#7f1d1d)',
                border:'4px solid #f87171', borderBottom:'4px solid #450a0a',
                boxShadow:'0 6px 0 #450a0a', borderRadius:'18px', color:'#fff',
                fontFamily:'Fredoka One,cursive', fontSize:'1.1rem',
              }}>
              DISCONNECT
            </button>

            <button onClick={tap(() => setShowDisconnectConfirm(false))} className="btn-3d w-full py-3"
              style={{
                background:'linear-gradient(160deg,#4c1d95,#3b0764)',
                border:'4px solid #7c3aed', borderBottom:'4px solid #2e1065',
                boxShadow:'0 6px 0 #1e0050', borderRadius:'18px', color:'#e9d5ff',
                fontFamily:'Fredoka One,cursive', fontSize:'1rem',
              }}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
