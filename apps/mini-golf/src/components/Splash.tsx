import { useState } from 'react'
import { useWalletStore, WalletConnectModal, unlockSfx } from '@gala-games/metagame'
import { useGameStore } from '../store/gameStore'

export default function Splash() {
  const [walletOpen, setWalletOpen] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  const address    = useWalletStore(s => s.address)
  const disconnect = useWalletStore(s => s.disconnect)

  const goToWorldSelect = useGameStore(s => s.goToWorldSelect)
  const goToLevelSelect = useGameStore(s => s.goToLevelSelect)
  const goToEvents      = useGameStore(s => s.goToEvents)
  const goToStore       = useGameStore(s => s.goToStore)
  const goToWardrobe    = useGameStore(s => s.goToWardrobe)
  const sfxMuted        = useGameStore(s => s.sfxMuted)
  const toggleSfxMuted  = useGameStore(s => s.toggleSfxMuted)
  const gemsBalance     = useGameStore(s => s.gemsBalance)

  function handlePlay() {
    unlockSfx()
    goToWorldSelect()
  }

  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden"
      style={{
        background: 'linear-gradient(180deg, #1a3a1a 0%, #0d2210 60%, #06120a 100%)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* SFX toggle */}
      <div className="absolute z-20" style={{ top: 16, right: 16 }}>
        <button
          onClick={toggleSfxMuted}
          className="px-3 py-2 rounded-xl font-fredoka text-lg"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#86efac', border: '1px solid rgba(255,255,255,0.15)' }}
          aria-label={sfxMuted ? 'Unmute' : 'Mute'}
        >
          {sfxMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Dot grid bg */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #4ade80 1px, transparent 1px)', backgroundSize: '36px 36px' }}
      />

      <div
        className="relative z-10 flex flex-col items-center w-full max-w-sm px-5 pb-8"
        style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top, 0px) + 1rem)' }}
      >
        {/* Logo */}
        <div
          className="mb-2 text-7xl"
          style={{ filter: 'drop-shadow(0 6px 20px rgba(74,222,128,0.8))', animation: 'bounce 2s ease infinite alternate' }}
        >
          ⛳
        </div>
        <h1
          className="font-fredoka text-center mb-1"
          style={{ fontSize: '2.4rem', letterSpacing: '2px', lineHeight: 1.1, color: '#4ade80', textShadow: '0 4px 24px rgba(74,222,128,0.5)' }}
        >
          MINI GOLF
        </h1>
        <p
          className="font-nunito font-bold text-sm tracking-widest mb-4 uppercase"
          style={{ color: 'rgba(134,239,172,0.5)' }}
        >
          by Gala Games
        </p>

        {/* Gem balance strip */}
        <div
          className="flex items-center gap-3 mb-4 px-4 py-1 rounded-full"
          style={{ background: 'rgba(0,0,0,0.25)', border: '1.5px solid rgba(74,222,128,0.15)' }}
        >
          <span className="flex items-center gap-1.5">
            <span style={{ color: '#4ade80' }}>💎</span>
            <span className="font-fredoka text-sm" style={{ color: '#bbf7d0' }}>
              {gemsBalance.toLocaleString()}
            </span>
          </span>
        </div>

        {/* Wallet pill */}
        {address ? (
          <div
            className="flex items-center gap-2 mb-5 px-4 py-2 rounded-full"
            style={{ background: 'rgba(20,83,45,0.4)', border: '2px solid rgba(74,222,128,0.4)' }}
          >
            <span style={{ color: '#4ade80' }}>◈</span>
            <span className="font-nunito font-bold text-sm" style={{ color: '#86efac', letterSpacing: '1px' }}>
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              className="font-nunito font-bold text-xs ml-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.3)', color: 'rgba(134,239,172,0.7)', border: '1px solid rgba(74,222,128,0.3)' }}
            >
              DISCONNECT
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setWalletOpen(true)}
              className="flex items-center gap-2 mb-1.5 px-5 py-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(74,222,128,0.3)', cursor: 'pointer' }}
            >
              <span style={{ color: '#4ade80' }}>◈</span>
              <span className="font-nunito font-bold text-sm" style={{ color: 'rgba(134,239,172,0.85)', letterSpacing: '2px' }}>
                CONNECT WALLET
              </span>
              <span className="text-xs" style={{ color: '#86efac' }}>›</span>
            </button>
            <p
              className="font-nunito text-center mb-4 px-2"
              style={{ color: 'rgba(134,239,172,0.45)', fontSize: '0.72rem', lineHeight: 1.4 }}
            >
              Save progress across devices · Compete for weekly rewards
            </p>
          </>
        )}

        {/* ── PLAY ─────────────────────────────────────────────────────────── */}
        <button
          onClick={handlePlay}
          className="btn-3d w-full mb-3"
          style={{
            background: 'linear-gradient(160deg, #166534, #14532d)',
            border: '4px solid #4ade80',
            borderBottom: '4px solid #052e16',
            boxShadow: '0 8px 0 #052e16, 0 0 30px rgba(74,222,128,0.4)',
            borderRadius: '20px',
            padding: '16px 22px',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>⛳</span>
            <span className="font-fredoka text-xl text-white" style={{ letterSpacing: '1px' }}>PLAY</span>
            <span className="ml-auto text-2xl" style={{ color: 'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* ── DAILY CHALLENGE compact pill ─────────────────────────────────── */}
        <button
          onClick={() => { unlockSfx(); goToLevelSelect('daily') }}
          className="btn-3d w-full mb-3 flex items-center gap-3 px-4"
          style={{
            background: 'linear-gradient(160deg, #92400e, #78350f)',
            border: '2.5px solid #f59e0b',
            borderBottom: '2.5px solid #451a03',
            boxShadow: '0 4px 0 #451a03',
            borderRadius: '14px',
            padding: '10px 16px',
          }}
        >
          <span className="text-xl">☀️</span>
          <span className="font-fredoka" style={{ color: '#fde68a', fontSize: '0.95rem', letterSpacing: '1.5px' }}>
            DAILY CHALLENGE
          </span>
          <span className="font-fredoka ml-auto" style={{ color: '#fde68a', fontSize: '0.8rem', opacity: 0.7 }}>›</span>
        </button>

        {/* ── WEEKLY EVENTS ────────────────────────────────────────────────── */}
        <button
          onClick={goToEvents}
          className="btn-3d w-full mb-3"
          style={{
            background: 'linear-gradient(160deg, #3b1278, #2d0e5e)',
            border: '4px solid #a78bfa',
            borderBottom: '4px solid #1a0840',
            boxShadow: '0 8px 0 #1a0840, 0 0 30px rgba(167,139,250,0.4)',
            borderRadius: '20px',
            padding: '16px 22px',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🏆</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing: '1px' }}>WEEKLY EVENTS</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color: 'rgba(233,213,255,0.7)' }}>
                COMPETE FOR PRIZES
              </div>
            </div>
            <span className="text-2xl" style={{ color: 'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* ── WARDROBE ─────────────────────────────────────────────────────── */}
        <button
          onClick={goToWardrobe}
          className="btn-3d w-full mb-3"
          style={{
            background: 'linear-gradient(160deg, #0e7490, #155e75)',
            border: '4px solid #22d3ee',
            borderBottom: '4px solid #0c4a6e',
            boxShadow: '0 8px 0 #083344, 0 0 30px rgba(34,211,238,0.35)',
            borderRadius: '20px',
            padding: '16px 22px',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>👗</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing: '1px' }}>WARDROBE</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color: 'rgba(165,243,252,0.7)' }}>
                CUSTOMIZE YOUR GEAR
              </div>
            </div>
            <span className="text-2xl" style={{ color: 'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* ── GEM STORE ────────────────────────────────────────────────────── */}
        <button
          onClick={goToStore}
          className="btn-3d w-full mb-5"
          style={{
            background: 'linear-gradient(160deg, #4c1d95, #3b0764)',
            border: '4px solid #a78bfa',
            borderBottom: '4px solid #2e1065',
            boxShadow: '0 8px 0 #1e0050, 0 0 30px rgba(167,139,250,0.4)',
            borderRadius: '20px',
            padding: '16px 22px',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>💎</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-xl text-white" style={{ letterSpacing: '1px' }}>GEM STORE</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color: 'rgba(196,181,253,0.7)' }}>
                BUY WITH GALA OR GUSDC
              </div>
            </div>
            <span className="text-2xl" style={{ color: 'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '2px' }}>
          MINI GOLF v1.0
        </p>
      </div>

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />

      {/* Disconnect confirmation */}
      {showDisconnectConfirm && (
        <div
          className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(14px)' }}
        >
          <div className="w-full max-w-xs text-center slide-up">
            <div
              className="text-6xl mb-3"
              style={{ filter: 'drop-shadow(0 6px 20px rgba(74,222,128,0.8))' }}
            >
              ⛳
            </div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color: '#86efac' }}>DISCONNECT?</h2>
            <p
              className="font-nunito font-bold mb-6 px-2"
              style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', lineHeight: 1.4 }}
            >
              Your progress is saved on the server. Reconnecting will restore all your data.
            </p>
            <button
              onClick={() => { setShowDisconnectConfirm(false); disconnect() }}
              className="btn-3d w-full py-3 mb-3"
              style={{
                background: 'linear-gradient(160deg,#991b1b,#7f1d1d)',
                border: '4px solid #f87171', borderBottom: '4px solid #450a0a',
                boxShadow: '0 6px 0 #450a0a', borderRadius: '18px', color: '#fff',
                fontFamily: 'Fredoka One, cursive', fontSize: '1.1rem',
              }}
            >
              DISCONNECT
            </button>
            <button
              onClick={() => setShowDisconnectConfirm(false)}
              className="btn-3d w-full py-3"
              style={{
                background: 'linear-gradient(160deg,#166534,#14532d)',
                border: '4px solid #4ade80', borderBottom: '4px solid #052e16',
                boxShadow: '0 6px 0 #052e16', borderRadius: '18px', color: '#fff',
                fontFamily: 'Fredoka One, cursive', fontSize: '1rem',
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
