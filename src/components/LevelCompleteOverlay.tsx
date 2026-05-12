import { useGameStore, selectLevelComplete, selectClearLevelComplete } from '../store/gameStore'

export default function LevelCompleteOverlay() {
  const show       = useGameStore(selectLevelComplete)
  const nextLevel  = useGameStore(s => s.nextLevel)
  const goToLevelSelect = useGameStore(s => (s as any).goToLevelSelect)
  const score      = useGameStore(s => s.score)
  const levels     = useGameStore(s => s.levels)
  const idx        = useGameStore(s => s.currentLevelIndex)

  if (!show) return null

  const isLast = idx >= levels.length - 1

  function handleNext() {
    selectClearLevelComplete()
    if (isLast) goToLevelSelect()
    else nextLevel()
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.8)', backdropFilter:'blur(12px)' }}>

      <div className="w-full max-w-xs text-center slide-up">
        <div className="text-7xl mb-4" style={{ animation:'bounce 0.6s ease infinite alternate', filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))' }}>
          🏅
        </div>
        <h2 className="font-fredoka text-4xl mb-1" style={{ color:'#c4b5fd' }}>LEVEL DONE!</h2>
        <p className="font-nunito font-bold text-lg mb-2" style={{ color:'rgba(255,255,255,0.6)' }}>
          Block {idx + 1} confirmed ✓
        </p>

        {/* Score */}
        <div className="flex items-center justify-center gap-2 mb-6 px-6 py-3 rounded-2xl mx-auto w-fit"
          style={{ background:'rgba(255,255,255,0.07)', border:'3px solid rgba(167,139,250,0.3)',
            boxShadow:'0 5px 0 rgba(0,0,0,0.4)' }}>
          <span className="text-2xl">⭐</span>
          <span className="font-fredoka text-3xl text-white">{score.toLocaleString()}</span>
          <span className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.5)' }}>pts</span>
        </div>

        <button onClick={handleNext} className="btn-3d w-full py-4"
          style={{ background:'linear-gradient(160deg,#7c3aed,#6d28d9)',
            border:'4px solid #a78bfa', borderBottom:'4px solid #4c1d95',
            boxShadow:'0 8px 0 #3b0764, 0 0 30px rgba(124,58,237,0.5)',
            borderRadius:'20px', color:'#fff',
            fontFamily:'Fredoka One,cursive', fontSize:'1.4rem' }}>
          {isLast ? '⬡ ALL DONE!' : 'NEXT LEVEL ›'}
        </button>
      </div>
    </div>
  )
}
