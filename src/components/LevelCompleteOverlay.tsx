import { useGameStore, selectLevelComplete, selectClearLevelComplete } from '../store/gameStore'
import { formatTime } from '../utils/gameUtils'

export default function LevelCompleteOverlay() {
  const show       = useGameStore(selectLevelComplete)
  const nextLevel  = useGameStore(s => s.nextLevel)
  const goToLevelSelect = useGameStore(s => (s as any).goToLevelSelect)
  const breakdown  = useGameStore(s => s.lastBreakdown)
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
        <div className="text-7xl mb-3" style={{ animation:'bounce 0.6s ease infinite alternate', filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))' }}>
          🏅
        </div>
        <h2 className="font-fredoka text-4xl mb-1" style={{ color:'#c4b5fd' }}>LEVEL DONE!</h2>
        <p className="font-nunito font-bold text-sm mb-3" style={{ color:'rgba(255,255,255,0.5)' }}>
          Block {idx + 1} confirmed ✓
        </p>

        {/* Score breakdown */}
        {breakdown && (
          <div className="rounded-2xl mb-4 mx-auto"
            style={{ background:'rgba(0,0,0,0.4)', border:'2px solid rgba(167,139,250,0.3)', padding:'12px 14px' }}>
            <ScoreRow label="Words"      value={`+${breakdown.base}`} tone="add" />
            <ScoreRow label={`Misses ×${breakdown.misses}`}     value={`−${breakdown.missesPenalty}`}  tone={breakdown.missesPenalty ? 'sub' : 'neutral'} />
            <ScoreRow label={`Hints ×${breakdown.hintsUsed}`}    value={`−${breakdown.hintsPenalty}`}   tone={breakdown.hintsPenalty ? 'sub' : 'neutral'} />
            <ScoreRow label={`Time ${formatTime(breakdown.elapsedSec)}`} value={breakdown.timeBonus > 0 ? `+${breakdown.timeBonus}` : '0'} tone={breakdown.timeBonus > 0 ? 'add' : 'neutral'} />
            <div className="h-px my-2" style={{ background:'rgba(167,139,250,0.25)' }} />
            <div className="flex items-center justify-between">
              <span className="font-fredoka text-sm" style={{ color:'#c4b5fd', letterSpacing:'1px' }}>FINAL</span>
              <span className="font-fredoka text-2xl text-white">⭐ {breakdown.final.toLocaleString()}</span>
            </div>
          </div>
        )}
        {!breakdown && (
          <div className="flex items-center justify-center gap-2 mb-4 px-6 py-3 rounded-2xl mx-auto w-fit"
            style={{ background:'rgba(255,255,255,0.07)', border:'3px solid rgba(167,139,250,0.3)' }}>
            <span className="text-2xl">⭐</span>
            <span className="font-fredoka text-3xl text-white">{score.toLocaleString()}</span>
          </div>
        )}

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

// Single line of the breakdown card — kept inline to avoid a separate file.
function ScoreRow({ label, value, tone }: { label: string; value: string; tone: 'add' | 'sub' | 'neutral' }) {
  const color = tone === 'add' ? '#a7f3d0' : tone === 'sub' ? '#fca5a5' : 'rgba(255,255,255,0.5)'
  return (
    <div className="flex items-center justify-between" style={{ fontSize:'0.82rem' }}>
      <span className="font-nunito font-bold" style={{ color:'rgba(255,255,255,0.65)' }}>{label}</span>
      <span className="font-fredoka" style={{ color }}>{value}</span>
    </div>
  )
}
