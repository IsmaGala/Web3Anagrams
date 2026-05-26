import { useGameStore } from '../store/gameStore'
import { playSfx } from '../utils/sfx'

// Celebration popup shown exactly once when a wallet connects for the
// first time and the server grants the first-wallet welcome bundle.
// Mirrors the visual style of WorldRewardOverlay so the reward moment
// feels consistent with world-completion bounties.

export default function WelcomeBonusOverlay() {
  const bonus  = useGameStore(s => s.pendingWelcomeBonus)
  const screen = useGameStore(s => s.screen)
  const setPending = useGameStore(s => s.setPendingWelcomeBonus)

  if (!bonus) return null
  // Don't overlay on top of an active game level — let the level finish first.
  if (screen === 'game') return null

  function handleClaim() {
    playSfx('purchase')
    setPending(null)
  }

  const accentColor = '#a78bfa' // violet — distinct from world reward gold/cyan

  return (
    <div
      className="fixed inset-0 z-[260] flex flex-col items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }}
    >
      <div className="w-full max-w-xs text-center slide-up">

        {/* Icon */}
        <div
          className="text-7xl mb-3"
          style={{
            animation: 'bounce 0.6s ease infinite alternate',
            filter: `drop-shadow(0 6px 28px ${accentColor}cc)`,
          }}
        >
          🎁
        </div>

        <p
          className="font-nunito font-bold text-xs mb-1 uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.55)', letterSpacing: '3px' }}
        >
          Welcome Bonus
        </p>
        <h2
          className="font-fredoka text-3xl mb-1"
          style={{ color: accentColor, textShadow: `0 4px 24px ${accentColor}66` }}
        >
          WALLET CONNECTED!
        </h2>
        <p
          className="font-nunito font-bold text-sm mb-5 px-2"
          style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}
        >
          Here's a welcome gift to get you started. Your rewards are already
          in your account.
        </p>

        {/* Reward badges — Gems row + Hints row */}
        <div className="flex flex-col gap-3 mb-6">

          {/* Gems */}
          <div
            className="flex items-center justify-center gap-3 mx-auto py-3 px-6 rounded-2xl"
            style={{
              background: `linear-gradient(160deg, ${accentColor}33, rgba(0,0,0,0.4))`,
              border: `3px solid ${accentColor}88`,
              boxShadow: `0 6px 0 rgba(0,0,0,0.35), 0 0 28px ${accentColor}33`,
              width: 'fit-content',
              minWidth: '160px',
            }}
          >
            <span
              className="text-3xl"
              style={{ color: '#22d3ee', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}
            >
              ◈
            </span>
            <span
              className="font-fredoka text-3xl text-white"
              style={{ textShadow: '0 3px 0 rgba(0,0,0,0.35)' }}
            >
              +{bonus.gems} Gems
            </span>
          </div>

          {/* Hints */}
          <div
            className="flex items-center justify-center gap-3 mx-auto py-3 px-6 rounded-2xl"
            style={{
              background: 'linear-gradient(160deg, rgba(251,191,36,0.2), rgba(0,0,0,0.4))',
              border: '3px solid rgba(251,191,36,0.55)',
              boxShadow: '0 6px 0 rgba(0,0,0,0.35), 0 0 28px rgba(251,191,36,0.2)',
              width: 'fit-content',
              minWidth: '160px',
            }}
          >
            <span
              className="text-3xl"
              style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}
            >
              💡
            </span>
            <span
              className="font-fredoka text-3xl text-white"
              style={{ textShadow: '0 3px 0 rgba(0,0,0,0.35)' }}
            >
              +{bonus.hints} Hints
            </span>
          </div>
        </div>

        <button
          onClick={handleClaim}
          className="btn-3d w-full py-4"
          style={{
            background: `linear-gradient(160deg, ${accentColor}, ${accentColor}cc)`,
            border: `4px solid ${accentColor}`,
            borderBottom: `4px solid ${accentColor}55`,
            boxShadow: `0 8px 0 ${accentColor}44, 0 0 28px ${accentColor}55`,
            borderRadius: '20px',
            color: '#fff',
            fontFamily: 'Fredoka One, cursive',
            fontSize: '1.3rem',
            letterSpacing: '1.5px',
          }}
        >
          AWESOME, LET'S PLAY!
        </button>
      </div>
    </div>
  )
}
