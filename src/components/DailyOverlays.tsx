import { useGameStore, selectCurrentLevel } from '../store/gameStore'
import { randomFlavor, DAILY_DURATION, formatTime } from '../utils/gameUtils'
import { useRef } from 'react'

export function DailyWinOverlay() {
  const show        = useGameStore(s => s.dailyComplete)
  const goToSplash  = useGameStore(s => s.goToSplash)
  const foundWords  = useGameStore(s => s.foundWords)
  const level       = useGameStore(selectCurrentLevel)
  const secondsLeft = useGameStore(s => s.dailySecondsLeft)

  if (!show) return null

  const timeUsed = DAILY_DURATION - secondsLeft
  const found    = level ? level.words.filter(w => foundWords.has(w)).length : 0
  const total    = level?.words.length ?? 0

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
      <div className="w-full max-w-xs text-center slide-up">
        <div className="text-7xl mb-4" style={{ animation:'bounce 0.6s ease infinite alternate' }}>🏆</div>
        <h2 className="font-fredoka text-4xl mb-1 gradient-text-daily">CHAIN COMPLETE!</h2>
        <p className="font-nunito font-bold mb-4" style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.9rem' }}>
          {found}/{total} words · {formatTime(timeUsed)}
        </p>

        {/* Reward — 5 hints (GALA is no longer awarded; hints are the only sink, so we keep the economy closed) */}
        <div className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl mb-6 mx-auto w-fit"
          style={{ background:'linear-gradient(160deg,rgba(217,119,6,0.3),rgba(180,83,9,0.2))',
            border:'3px solid rgba(251,191,36,0.4)', boxShadow:'0 5px 0 rgba(0,0,0,0.4)' }}>
          <span className="text-3xl">💡</span>
          <span className="font-fredoka text-4xl" style={{ color:'#fbbf24' }}>+5 HINTS</span>
        </div>

        <button onClick={goToSplash} className="btn-3d w-full py-4"
          style={{ background:'linear-gradient(160deg,#d97706,#b45309)',
            border:'4px solid #fbbf24', borderBottom:'4px solid #78350f',
            boxShadow:'0 8px 0 #451a03, 0 0 30px rgba(217,119,6,0.5)',
            borderRadius:'20px', color:'#fff',
            fontFamily:'Fredoka One,cursive', fontSize:'1.4rem' }}>
          BACK TO MENU
        </button>
      </div>
    </div>
  )
}

// Shown when the user presses the back button mid-daily. Confirms forfeit
// before leaving — the daily attempt is abandoned but stays unlocked for
// retry until the day's 24h window rolls over at midnight.
export function DailyQuitConfirmOverlay() {
  const show             = useGameStore(s => s.showQuitConfirm)
  const confirmQuitDaily = useGameStore(s => s.confirmQuitDaily)
  const cancelQuitDaily  = useGameStore(s => s.cancelQuitDaily)

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
      <div className="w-full max-w-xs text-center slide-up">
        <div className="text-7xl mb-4">⚠️</div>
        <h2 className="font-fredoka text-3xl mb-2" style={{ color:'#fbbf24' }}>QUIT DAILY?</h2>
        <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.95rem' }}>
          You'll lose this attempt.
        </p>
        <p className="font-nunito font-bold mb-6 px-2" style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.8rem' }}>
          You can retry today's daily from the menu until it resets at midnight.
        </p>

        <button onClick={confirmQuitDaily} className="btn-3d w-full py-3 mb-3"
          style={{ background:'linear-gradient(160deg,#7f1d1d,#991b1b)',
            border:'4px solid #f87171', borderBottom:'4px solid #450a0a',
            boxShadow:'0 6px 0 #450a0a',
            borderRadius:'18px', color:'#fff',
            fontFamily:'Fredoka One,cursive', fontSize:'1.1rem' }}>
          QUIT &amp; LOSE ATTEMPT
        </button>

        <button onClick={cancelQuitDaily} className="btn-3d w-full py-3"
          style={{ background:'linear-gradient(160deg,#4c1d95,#3b0764)',
            border:'4px solid #7c3aed', borderBottom:'4px solid #2e1065',
            boxShadow:'0 6px 0 #1e0050',
            borderRadius:'18px', color:'#e9d5ff',
            fontFamily:'Fredoka One,cursive', fontSize:'1.1rem' }}>
          KEEP PLAYING
        </button>
      </div>
    </div>
  )
}

export function DailyLoseOverlay() {
  const show       = useGameStore(s => s.dailyFailed)
  const goToSplash = useGameStore(s => s.goToSplash)
  const foundWords = useGameStore(s => s.foundWords)
  const level      = useGameStore(selectCurrentLevel)
  const flavorRef  = useRef(randomFlavor())

  if (!show) return null

  const found = level ? level.words.filter(w => foundWords.has(w)).length : 0
  const total = level?.words.length ?? 0

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.9)', backdropFilter:'blur(14px)' }}>
      <div className="w-full max-w-xs text-center slide-up">
        <div className="text-7xl mb-4">💀</div>
        <h2 className="font-fredoka text-4xl mb-2" style={{ color:'#f87171' }}>TIME'S UP</h2>
        <p className="font-nunito font-bold italic mb-2 px-4" style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.9rem' }}>
          "{flavorRef.current}"
        </p>
        <p className="font-nunito font-bold mb-6" style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.8rem' }}>
          {found} of {total} words found
        </p>

        <button onClick={goToSplash} className="btn-3d w-full py-4"
          style={{ background:'linear-gradient(160deg,#7f1d1d,#991b1b)',
            border:'4px solid #f87171', borderBottom:'4px solid #450a0a',
            boxShadow:'0 8px 0 #450a0a',
            borderRadius:'20px', color:'#fff',
            fontFamily:'Fredoka One,cursive', fontSize:'1.2rem' }}>
          TRY AGAIN TOMORROW
        </button>
      </div>
    </div>
  )
}
