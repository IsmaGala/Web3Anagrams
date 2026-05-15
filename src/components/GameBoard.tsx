import { useGameStore, selectCurrentLevel, selectFoundCount, selectProgress, selectCurrentWordState } from '../store/gameStore'
import Wheel from './Wheel'
import WordGrid from './WordGrid'
import ShopModal from './ShopModal'
import DailyTimer from './DailyTimer'
import { DailyWinOverlay, DailyLoseOverlay, DailyQuitConfirmOverlay } from './DailyOverlays'
import LevelCompleteOverlay from './LevelCompleteOverlay'
import SfxToggle from './SfxToggle'
import Toast from './Toast'
import { playSfx } from '../utils/sfx'

export default function GameBoard() {
  const gameMode    = useGameStore(s => s.gameMode)
  const goToSplash  = useGameStore(s => s.goToSplash)
  const goToLevelSelect = useGameStore(s => (s as any).goToLevelSelect)
  const dailyComplete   = useGameStore(s => s.dailyComplete)
  const dailyFailed     = useGameStore(s => s.dailyFailed)
  const requestQuitDaily = useGameStore(s => s.requestQuitDaily)
  const level       = useGameStore(selectCurrentLevel)
  const foundCount  = useGameStore(selectFoundCount)
  const progress    = useGameStore(selectProgress)
  const score       = useGameStore(s => s.score)
  const hints       = useGameStore(s => s.hints)
  const gemsBalance = useGameStore(s => s.gemsBalance)
  const currentWord = useGameStore(s => s.currentWord)
  const wordDef     = useGameStore(s => s.wordDef)
  const message     = useGameStore(s => s.message)
  const messageType = useGameStore(s => s.messageType)
  const currentLevelIndex = useGameStore(s => s.currentLevelIndex)
  const levels      = useGameStore(s => s.levels)
  const wordState   = useGameStore(selectCurrentWordState)
  const openShop    = useGameStore(s => s.openShop)
  const useHint     = useGameStore(s => s.useHint)
  const isDaily     = gameMode === 'daily'

  const msgColor = messageType === 'great' ? '#a78bfa' : messageType === 'error' ? '#f87171' : 'rgba(196,181,253,0.7)'

  function handleBack() {
    playSfx('uiTap')
    if (isDaily) {
      // Mid-daily: ask before abandoning. If the round already resolved
      // (win/lose overlay showing) just exit cleanly.
      if (dailyComplete || dailyFailed) goToSplash()
      else requestQuitDaily()
    } else {
      goToLevelSelect()
    }
  }

  return (
    <div className={`min-h-screen flex flex-col items-center pb-6 ${isDaily ? 'daily-mode' : ''}`}
      style={{ background: isDaily
        ? 'linear-gradient(180deg,#431407 0%,#1c0a00 100%)'
        : 'linear-gradient(180deg,#2e1065 0%,#1a0533 60%,#0d0220 100%)' }}>

      {/* ── TOP BAR ── */}
      <div className="w-full max-w-sm flex items-center gap-2 px-4 pt-4 pb-3">

        {/* Back */}
        <button onClick={handleBack} className="btn-3d flex items-center gap-1 px-4 py-2"
          style={{ background:'linear-gradient(160deg,#4c1d95,#3b0764)',
            border:'3px solid #7c3aed', borderBottom:'3px solid #2e1065',
            boxShadow:'0 4px 0 #1e0050', borderRadius:'12px',
            color:'#e9d5ff', fontFamily:'Fredoka One,cursive', fontSize:'0.9rem',
            ...(isDaily && { background:'linear-gradient(160deg,#92400e,#78350f)',
              border:'3px solid #f59e0b', borderBottom:'3px solid #451a03',
              boxShadow:'0 4px 0 #451a03', color:'#fde68a' }) }}>
          ‹
        </button>

        {/* Level badge */}
        <div className="flex-1 flex items-center justify-center">
          <div className="px-4 py-1.5 rounded-full font-fredoka text-sm"
            style={{ background:'rgba(255,255,255,0.08)', border:'2px solid rgba(255,255,255,0.15)',
              color: isDaily ? '#fbbf24' : '#c4b5fd' }}>
            {isDaily ? '🏆 DAILY' : `LEVEL ${currentLevelIndex + 1}/${levels.length} · ${level?.theme}`}
          </div>
        </div>

        {/* Score chip */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-fredoka"
          style={{ background:'rgba(255,255,255,0.07)', border:'2px solid rgba(255,255,255,0.12)',
            boxShadow:'0 3px 0 rgba(0,0,0,0.3)' }}>
          <span style={{ color:'#fbbf24' }}>⭐</span>
          <span className="text-sm text-white">{score}</span>
        </div>

        {/* SFX mute toggle */}
        <SfxToggle variant={isDaily ? 'daily' : 'single'} size="sm" />
      </div>

      {/* ── GEMS BAR (single only) ── */}
      {!isDaily && (
        <div className="w-full max-w-sm px-4 mb-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
            style={{ background:'rgba(0,0,0,0.3)', border:'3px solid rgba(167,139,250,0.25)',
              boxShadow:'0 4px 0 rgba(0,0,0,0.4)' }}>
            <span className="font-fredoka text-lg" style={{ color:'#a78bfa' }}>◈</span>
            <span className="font-fredoka text-base" style={{ color:'#a78bfa' }}>{gemsBalance.toLocaleString()}</span>
            <span className="font-nunito font-bold text-xs" style={{ color:'rgba(167,139,250,0.5)' }}>GEMS</span>
            <button onClick={openShop} className="btn-3d ml-auto px-4 py-1.5"
              style={{ background:'linear-gradient(160deg,#7c3aed,#6d28d9)',
                border:'2px solid #a78bfa', borderBottom:'2px solid #4c1d95',
                boxShadow:'0 3px 0 #3b0764', borderRadius:'10px',
                color:'#fff', fontFamily:'Fredoka One,cursive', fontSize:'0.8rem' }}>
              + HINTS
            </button>
          </div>
        </div>
      )}

      {/* ── PROGRESS + FOUND ── */}
      <div className="w-full max-w-sm px-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-4 rounded-full overflow-hidden"
            style={{ background:'rgba(0,0,0,0.35)', border:'2px solid rgba(255,255,255,0.1)', padding:'2px' }}>
            <div className="progress-fill h-full rounded-full" style={{ width:`${progress*100}%` }} />
          </div>
          <div className="font-fredoka text-sm px-3 py-1 rounded-xl"
            style={{ background:'rgba(255,255,255,0.08)', color: isDaily ? '#fbbf24' : '#a78bfa',
              border:'2px solid rgba(255,255,255,0.1)' }}>
            {foundCount}/{level?.words.length ?? 0}
          </div>
          {!isDaily && (
            <button onClick={useHint} className="btn-3d flex items-center gap-1.5 px-3 py-1.5"
              style={{ background:'linear-gradient(160deg,#7c3aed,#6d28d9)',
                border:'2px solid #a78bfa', borderBottom:'2px solid #4c1d95',
                boxShadow:'0 3px 0 #3b0764', borderRadius:'10px',
                color:'#fff', fontFamily:'Fredoka One,cursive', fontSize:'0.85rem' }}>
              💡 {hints}
            </button>
          )}
        </div>
      </div>

      {/* ── DAILY TIMER ── */}
      <DailyTimer />

      {/* ── WORD GRID ── */}
      <WordGrid />

      {/* ── CURRENT WORD ── */}
      <div className={`current-word text-center mb-1 ${wordState}`}>
        {currentWord || '_ _ _'}
      </div>

      {/* ── DEFINITION ── */}
      <p className="font-nunito font-bold text-center px-6 mb-1"
        style={{ fontSize:'0.72rem', color:'rgba(196,181,253,0.45)', minHeight:16, fontStyle:'italic' }}>
        {wordDef}
      </p>

      {/* ── MESSAGE ── */}
      <p className="font-fredoka text-center mb-2" style={{ fontSize:'1.1rem', minHeight:28, color: msgColor }}>
        {message}
      </p>

      {/* ── WHEEL ── */}
      <Wheel />

      {/* Modals */}
      <ShopModal />
      <LevelCompleteOverlay />
      <DailyWinOverlay />
      <DailyLoseOverlay />
      <DailyQuitConfirmOverlay />
      <Toast />
    </div>
  )
}
