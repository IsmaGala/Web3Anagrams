import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { formatTime, timerClass, DAILY_DURATION } from '../utils/gameUtils'

export default function DailyTimer() {
  const gameMode         = useGameStore(s => s.gameMode)
  const screen           = useGameStore(s => s.screen)
  const dailySecondsLeft = useGameStore(s => s.dailySecondsLeft)
  const dailyComplete    = useGameStore(s => s.dailyComplete)
  const dailyFailed      = useGameStore(s => s.dailyFailed)
  const tickTimer        = useGameStore(s => s.tickTimer)

  useEffect(() => {
    if (gameMode !== 'daily' || screen !== 'game' || dailyComplete || dailyFailed) return
    const id = setInterval(tickTimer, 1000)
    return () => clearInterval(id)
  }, [gameMode, screen, dailyComplete, dailyFailed, tickTimer])

  if (gameMode !== 'daily') return null

  const cls = timerClass(dailySecondsLeft)
  const pct = (dailySecondsLeft / DAILY_DURATION) * 100

  return (
    <div className="w-full max-w-sm px-4 mb-3">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{ background:'rgba(0,0,0,0.4)', border:'3px solid rgba(249,115,22,0.25)',
          boxShadow:'0 5px 0 rgba(0,0,0,0.4)' }}>
        <span className="text-2xl">⏱</span>
        <div className="flex-1">
          <div className="w-full h-3 rounded-full overflow-hidden"
            style={{ background:'rgba(0,0,0,0.4)', border:'2px solid rgba(255,255,255,0.08)' }}>
            <div className={`timer-track-fill h-full rounded-full ${cls}`} style={{ width:`${pct}%` }} />
          </div>
        </div>
        <span className={`timer-display ${cls}`}>{formatTime(dailySecondsLeft)}</span>
      </div>
    </div>
  )
}
