import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useWalletStore } from '../store/walletStore'
import { useScreenBackdrop } from '../utils/screenBackdrop'
import { WORLDS } from '../data/worldData'
import {
  getStreak, timeToMidnight,
  eventPhase, currentWeekId, startWeekIdFromDate,
  timeToNextPhaseChange, formatCountdownShort,
  DAILY_RETRY_COST,
} from '../utils/gameUtils'
import { shortAddress } from '../utils/wallet'
import { playSfx } from '../utils/sfx'
import SfxToggle from './SfxToggle'
import BgmToggle from './BgmToggle'
import WalletConnectModal from './WalletConnectModal'
import DiscordConnect from './DiscordConnect'
import { startBgm } from '../utils/bgm'

// Wraps a click handler with the menu-confirm tap SFX. Keeps every button's
// onClick site short.
function tap<T extends any[]>(fn: (...args: T) => void) {
  return (...args: T) => { playSfx('uiTap'); fn(...args) }
}

export default function Splash() {
  const goToGame       = useGameStore(s => s.goToGame)
  const goToEvents     = useGameStore(s => s.goToEvents)
  const goToStore      = useGameStore(s => s.goToStore)
  const goToWardrobe   = useGameStore(s => s.goToWardrobe)
  const payToRetryDaily= useGameStore(s => s.payToRetryDaily)
  const gemsBalance    = useGameStore(s => s.gemsBalance)
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
  // Action queued while wallet-connect modal is open — resumed on connect.
  const pendingAction = useRef<'single' | 'daily' | null>(null)
  const [countdown, setCountdown] = useState(timeToMidnight())
  // Separate ticker for the event-phase countdown surfaced on the WEEKLY
  // EVENTS button caption. Same 1Hz cadence as the daily countdown.
  const [eventCountdown, setEventCountdown] = useState(timeToNextPhaseChange())
  const streak = getStreak()

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(timeToMidnight())
      setEventCountdown(timeToNextPhaseChange())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Start BGM on the first pointer interaction — satisfies browser autoplay
  // policy. startBgm() is idempotent so the listener can fire only once.
  useEffect(() => {
    function onFirstGesture() {
      startBgm()
      window.removeEventListener('pointerdown', onFirstGesture)
    }
    window.addEventListener('pointerdown', onFirstGesture)
    return () => window.removeEventListener('pointerdown', onFirstGesture)
  }, [])

  // After wallet connects, replay whichever action the player originally tapped.
  useEffect(() => {
    if (!walletAddress) return
    const queued = pendingAction.current
    if (!queued) return
    pendingAction.current = null
    goToGame(queued)
  }, [walletAddress, goToGame])

  // Dynamic caption for the Weekly Events button. Memoized against the
  // inputs that actually change — event scheduling + phase — so we don't
  // recompute on every unrelated re-render.

  // The events caption depends on phase + the currently-scheduled active or
  // upcoming event world. We recompute on every countdown tick (via the
  // eventCountdown dep) so the time fragment stays fresh.
  const eventCaption = useMemo(() => {
    const phase = eventPhase()
    const thisWeek = currentWeekId()
    // ACTIVE phase: the event that started this week is the headline.
    // SETTLED phase: the headline is whichever event is starting next.
    const targetWeek = phase === 'active' ? thisWeek : thisWeek + 1
    const event = WORLDS.find(w => w.event && w.startDate && startWeekIdFromDate(w.startDate) === targetWeek)
    if (!event) return 'EXCLUSIVE SKINS · GEMS · HINTS'
    const verb = phase === 'active' ? 'ENDS' : 'STARTS'
    return `${event.name.toUpperCase()} · ${verb} IN ${formatCountdownShort(eventCountdown)}`
  }, [eventCountdown])

  // Wallet gate for game entry points. If not connected, queue the action
  // and open the connect modal; the useEffect above replays on connect.
  function requireWalletForGame(mode: 'single' | 'daily') {
    if (walletAddress) { goToGame(mode); return }
    pendingAction.current = mode
    setShowWalletModal(true)
  }

  // Daily card state machine
  const dailyState: 'available' | 'won' | 'lost' = !todaysAttempt
    ? 'available'
    : todaysAttempt.status === 'won' ? 'won' : 'lost'

  const canAffordRetry = gemsBalance >= DAILY_RETRY_COST

  return (
    // Splash is a SCROLLABLE container, not a fixed-position overlay. The
    // previous `fixed inset-0 ... overflow-hidden flex justify-center` setup
    // clipped the logo at the top and made it impossible to scroll down to
    // the buttons on short mobile viewports. Now the page grows with its
    // content and the player can scroll through the menu naturally.
    <div className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden"
      style={{
        background: useScreenBackdrop('linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0d0220 100%)'),
        // iOS momentum scrolling — feels native instead of stuttery.
        WebkitOverflowScrolling: 'touch',
      }}>

      <div className="absolute z-20 flex gap-2" style={{ top: 16, right: 16 }}>
        <BgmToggle variant="splash" />
        <SfxToggle variant="splash" />
      </div>

      <div className="splash-blob blob1" />
      <div className="splash-blob blob2" />
      <div className="splash-blob blob3" />

      {[...Array(18)].map((_, i) => (
        <div key={i} className="absolute rounded-full bg-white pointer-events-none"
          style={{ width: Math.random()*3+1, height: Math.random()*3+1,
            top: `${Math.random()*90}%`, left: `${Math.random()*100}%`,
            opacity: Math.random()*0.6+0.2,
            animation: `pulse ${2+Math.random()*3}s ease infinite`, animationDelay: `${Math.random()*3}s` }} />
      ))}

      {/* Inner column: top padding pushes the logo clear of the iOS notch /
          status bar instead of being clipped by it; the auto margins keep
          the column centered horizontally and let it shrink-wrap vertically
          (no forced justify-center that hides overflow). */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-5 pt-10 pb-8" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top, 0px) + 1rem)' }}>
        <div className="mb-2 text-6xl" style={{ filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))', animation:'bounce 2s ease infinite alternate' }}>
          ⬡
        </div>
        <h1 className="font-fredoka text-center mb-1 shimmer-text"
          style={{ fontSize:'2.4rem', letterSpacing:'2px', lineHeight:1.1 }}>
          G WORDY
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
            <span className="font-fredoka text-sm" style={{ color:'#e9d5ff' }}>{gemsBalance.toLocaleString()}</span>
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
          <>
            <div className="flex items-center gap-2 mb-3 px-4 py-2 rounded-full"
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

            {/* Discord link — only shown when wallet is connected */}
            <DiscordConnect />
          </>
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
            <p className="font-nunito text-center mb-1 px-2"
              style={{ color:'rgba(196,181,253,0.45)', fontSize:'0.72rem', lineHeight:1.4 }}>
              Save progress across devices · Compete for weekly rewards
            </p>
            <p className="font-nunito font-bold text-center mb-4 px-2"
              style={{ color:'rgba(251,191,36,0.75)', fontSize:'0.7rem', letterSpacing:'0.5px' }}>
              🎁 First connection reward: 15 ◈ gems + 5 💡 hints
            </p>
          </>
        )}

        <button onClick={tap(() => requireWalletForGame('single'))} className="btn-3d w-full mb-3 flex items-center gap-2 px-4 py-2"
          style={{ background:'linear-gradient(160deg, #7c3aed, #6d28d9)',
            border:'2.5px solid #a78bfa', borderBottom:'2.5px solid #4c1d95',
            boxShadow:'0 4px 0 #3b0764, 0 0 18px rgba(124,58,237,0.4)',
            borderRadius:'14px', cursor:'pointer' }}>
          <span className="text-xl" style={{ filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>🎮</span>
          <span className="font-fredoka" style={{ color:'#fff', fontSize:'0.95rem', letterSpacing:'1.5px' }}>SINGLE PLAYER</span>
          <span className="ml-auto font-fredoka" style={{ color:'rgba(255,255,255,0.5)', fontSize:'1.05rem', opacity:0.7 }}>›</span>
        </button>

        {/* Daily — compressed to a single-row pill. Three states share the
            same compact pill geometry; only icon, colors, copy, and
            click behavior vary by state. About 40% the vertical weight
            of the old full-block treatment, freeing space for the rest
            of the menu. Premium worlds moved into WorldSelect, so this
            sits directly above the main button stack as the recurring
            "play right now" affordance. */}
        {(() => {
          // Derive per-state visual + behavioral config in one place so the
          // JSX below stays clean. Putting this in a render-time IIFE
          // avoids polluting the component scope with three nearly-
          // identical helper consts.
          const states = {
            available: {
              icon: '🏆',
              label: 'DAILY',
              accent: '#fde68a',
              border: '#fbbf24',
              bg: 'linear-gradient(160deg, #d97706, #b45309)',
              glow: 'rgba(217,119,6,0.4)',
              onClick: () => requireWalletForGame('daily'),
              disabled: false,
              caption: countdown,
              showChevron: true,
            },
            won: {
              icon: '✓',
              label: 'DAILY DONE',
              accent: '#fde68a',
              border: 'rgba(251,191,36,0.4)',
              bg: 'linear-gradient(160deg, rgba(217,119,6,0.30), rgba(180,83,9,0.20))',
              glow: 'transparent',
              onClick: () => {},
              disabled: true,
              caption: countdown,
              showChevron: false,
            },
            lost: {
              icon: '💀',
              label: canAffordRetry ? 'RETRY' : 'DAILY FAILED',
              accent: canAffordRetry ? '#fecaca' : 'rgba(255,255,255,0.5)',
              border: canAffordRetry ? '#f87171' : 'rgba(255,255,255,0.15)',
              bg: canAffordRetry
                ? 'linear-gradient(160deg, #7f1d1d, #991b1b)'
                : 'linear-gradient(160deg, #3f3f46, #18181b)',
              glow: canAffordRetry ? 'rgba(248,113,113,0.3)' : 'transparent',
              onClick: () => { if (canAffordRetry) payToRetryDaily() },
              disabled: !canAffordRetry,
              caption: canAffordRetry ? `◈ ${DAILY_RETRY_COST} · ${countdown}` : countdown,
              showChevron: canAffordRetry,
            },
          } as const
          const s = states[dailyState]
          return (
            <button onClick={tap(s.onClick)} disabled={s.disabled}
              className="btn-3d w-full mb-3 flex items-center gap-2 px-4 py-2"
              style={{
                background: s.bg,
                border: `2.5px solid ${s.border}`,
                borderBottom: `2.5px solid ${s.border}66`,
                boxShadow: `0 4px 0 rgba(0,0,0,0.35), 0 0 18px ${s.glow}`,
                borderRadius: '14px',
                cursor: s.disabled ? 'default' : 'pointer',
              }}>
              <span className="text-xl" aria-hidden>{s.icon}</span>
              <span className="font-fredoka" style={{
                color: s.accent, fontSize: '0.95rem', letterSpacing: '1.5px',
              }}>
                {s.label}
              </span>
              <span className="font-fredoka ml-auto" style={{
                color: s.accent, fontSize: '0.8rem', opacity: 0.9,
              }}>
                {s.caption}
              </span>
              {streak > 0 && dailyState !== 'lost' && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(0,0,0,0.30)', color: '#fde68a',
                    fontSize: '0.7rem', fontWeight: 800,
                  }}>
                  🔥{streak}
                </span>
              )}
              {s.showChevron && (
                <span style={{
                  color: s.accent, fontSize: '1.05rem', opacity: 0.7,
                }}>›</span>
              )}
            </button>
          )
        })()}

        {/* Wardrobe — cosmetic wheel skins. */}
        <button onClick={tap(goToWardrobe)} className="btn-3d w-full mb-3"
          style={{ background:'linear-gradient(160deg, #0e7490, #155e75)',
            border:'4px solid #22d3ee', borderBottom:'4px solid #0c4a6e',
            boxShadow:'0 8px 0 #083344, 0 0 30px rgba(34,211,238,0.35)',
            borderRadius:'20px', padding:'16px 22px' }}>
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>👕</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>WARDROBE</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color:'rgba(165,243,252,0.7)' }}>
                EQUIP WHEEL SKINS
              </div>
            </div>
            <span className="text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        <button onClick={tap(goToEvents)} className="btn-3d w-full mb-3"
          style={{ background:'linear-gradient(160deg, #075985, #0c4a6e)',
            border:'4px solid #0ea5e9', borderBottom:'4px solid #082f49',
            boxShadow:'0 8px 0 #082f49, 0 0 30px rgba(14,165,233,0.4)',
            borderRadius:'20px', padding:'16px 22px' }}>
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>⭐</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>WEEKLY EVENTS</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color:'rgba(186,230,253,0.7)' }}>
                {eventCaption}
              </div>
            </div>
            <span className="text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* Store — buy Gems with GALA or GUSDC tokens. */}
        <button onClick={tap(goToStore)} className="btn-3d w-full mb-5"
          style={{ background:'linear-gradient(160deg, #4c1d95, #3b0764)',
            border:'4px solid #a78bfa', borderBottom:'4px solid #2e1065',
            boxShadow:'0 8px 0 #1e0050, 0 0 30px rgba(167,139,250,0.4)',
            borderRadius:'20px', padding:'16px 22px' }}>
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>💎</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing:'1px' }}>STORE</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color:'rgba(196,181,253,0.7)' }}>
                BUY WITH GALA
              </div>
            </div>
            <span className="text-2xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        <p className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.2)', letterSpacing:'2px' }}>
          G WORDY v1.0
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
