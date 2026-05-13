import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { WORLDS } from '../data/worldData'
import type { WorldId } from '../data/worlds'
import { LeaderboardPanel } from './WeeklyEvents'

export default function LevelSelect() {
  const setScreen         = useGameStore(s => (s as any).setScreen)
  const worldId           = useGameStore(s => (s as any).selectedWorldId) as WorldId
  const loadWorldLevels   = useGameStore(s => s.loadWorldLevels)
  const isLevelUnlocked   = useProgressStore(s => s.isLevelUnlocked)
  const getCompletedCount = useProgressStore(s => s.getCompletedCount)
  const getTotalScore     = useProgressStore(s => s.getTotalScore)
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  const world = WORLDS.find(w => w.id === worldId)
  if (!world) return null

  // Back button destination: events worlds → events hub, premium → premium,
  // everything else → worldSelect.
  const backScreen = world.event ? 'events' : world.premium ? 'premium' : 'worldSelect'
  const backLabel  = world.event ? 'EVENTS' : world.premium ? 'PREMIUM' : 'WORLDS'

  const completed  = getCompletedCount(worldId)
  const totalScore = getTotalScore(worldId)

  function handleLevelClick(levelIndex: number) {
    if (!world) return
    const state = isLevelUnlocked(worldId, levelIndex)
    if (state === 0) return
    loadWorldLevels(world.levels)
    useGameStore.setState({
      currentLevelIndex: levelIndex, score: 0,
      screen: 'game', gameMode: 'single',
      _worldId: worldId, selectedWorldId: worldId,
    } as any)
    setTimeout(() => useGameStore.getState().initLevel(), 0)
  }

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-10 px-4"
      style={{ background:'linear-gradient(180deg,#2e1065 0%,#1a0533 60%,#0d0220 100%)' }}>

      {/* Back — destination depends on whether we came from PREMIUM, EVENTS, or WORLDS */}
      <div className="self-start mb-5 flex items-center gap-2 w-full max-w-sm">
        <button onClick={() => setScreen(backScreen)}
          className="btn-3d flex items-center gap-2 px-5 py-3"
          style={{ background:'linear-gradient(160deg,#4c1d95,#3b0764)',
            border:'3px solid #7c3aed', borderBottom:'3px solid #2e1065',
            boxShadow:'0 5px 0 #1e0050', borderRadius:'14px',
            color:'#e9d5ff', fontFamily:'Fredoka One,cursive', fontSize:'1rem' }}>
          ‹ {backLabel}
        </button>
        {world.event && (
          <button onClick={() => setShowLeaderboard(s => !s)}
            className="btn-3d ml-auto flex items-center gap-1 px-4 py-3"
            style={{ background:'linear-gradient(160deg,#075985,#0c4a6e)',
              border:'3px solid #0ea5e9', borderBottom:'3px solid #082f49',
              boxShadow:'0 5px 0 #082f49', borderRadius:'14px',
              color:'#bae6fd', fontFamily:'Fredoka One,cursive', fontSize:'0.9rem' }}>
            🏆 {showLeaderboard ? 'HIDE' : 'BOARD'}
          </button>
        )}
      </div>
      {world.event && showLeaderboard && (
        <div className="w-full max-w-sm mb-5">
          <LeaderboardPanel worldId={world.id} accent={world.color} />
        </div>
      )}

      {/* World header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-5xl" style={{ filter:`drop-shadow(0 4px 12px ${world.color}88)` }}>{world.icon}</span>
        <div>
          <h1 className="font-fredoka text-3xl" style={{ color: world.color }}>{world.name.toUpperCase()}</h1>
          <p className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.4)' }}>{world.subtitle}</p>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex gap-3 mb-7">
        {[
          { label:'✓', val: completed, unit:'done' },
          { label:'📋', val: world.levelCount, unit:'total' },
          { label:'⭐', val: totalScore.toLocaleString(), unit:'score' },
        ].map(s => (
          <div key={s.unit} className="flex flex-col items-center px-4 py-2 rounded-2xl"
            style={{ background:'rgba(255,255,255,0.07)', border:`2px solid ${world.color}44`,
              boxShadow:`0 4px 0 ${world.color}22` }}>
            <span className="font-fredoka text-xl" style={{ color: world.color }}>{s.val}</span>
            <span className="font-nunito font-bold text-xs" style={{ color:'rgba(255,255,255,0.35)', letterSpacing:'1px' }}>{s.unit.toUpperCase()}</span>
          </div>
        ))}
      </div>

      {/* Level grid */}
      <div className="w-full max-w-sm grid grid-cols-4 gap-3">
        {world.levels.map((level, i) => {
          const state       = isLevelUnlocked(worldId, i)
          const isCompleted = state === 2
          const isUnlocked  = state >= 1
          const isLocked    = state === 0

          return (
            <button key={i} onClick={() => handleLevelClick(i)} disabled={isLocked}
              className="btn-3d aspect-square flex flex-col items-center justify-center gap-1"
              style={{
                background: isCompleted
                  ? `linear-gradient(160deg, ${world.color}cc, ${world.color}88)`
                  : isUnlocked
                    ? 'linear-gradient(160deg,#4c1d95,#2e1065)'
                    : 'rgba(255,255,255,0.04)',
                border: isCompleted
                  ? `3px solid ${world.color}`
                  : isUnlocked
                    ? '3px solid #7c3aed'
                    : '3px solid rgba(255,255,255,0.07)',
                borderBottom: isCompleted
                  ? `3px solid ${world.color}66`
                  : isUnlocked ? '3px solid #3b0764' : '3px solid rgba(0,0,0,0.3)',
                boxShadow: isCompleted
                  ? `0 5px 0 ${world.color}44, 0 0 14px ${world.color}33`
                  : isUnlocked ? '0 5px 0 #1e0050' : '0 3px 0 rgba(0,0,0,0.3)',
                borderRadius:'16px',
                opacity: isLocked ? 0.45 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              }}>
              <span className="text-xl leading-none">
                {isCompleted ? '✓' : isLocked ? '🔒' : '▶'}
              </span>
              <span className="font-fredoka text-sm leading-none"
                style={{ color: isCompleted ? '#fff' : isUnlocked ? '#c4b5fd' : 'rgba(255,255,255,0.25)' }}>
                {i + 1}
              </span>
              {isUnlocked && (
                <span className="font-nunito font-bold text-center"
                  style={{
                    // Scale font down for longer themes so MATERIUM/UNDERWORLD/RESURRECTION
                    // still fit inside the square tile without truncation.
                    fontSize: level.theme.length > 10 ? '0.42rem'
                            : level.theme.length > 8  ? '0.48rem'
                            : '0.55rem',
                    lineHeight: 1.05,
                    color: isCompleted ? 'rgba(255,255,255,0.85)' : 'rgba(196,181,253,0.65)',
                    maxWidth: '95%',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    letterSpacing: '0.5px',
                  }}>
                  {level.theme}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-8 font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.2)', letterSpacing:'1px' }}>
        Complete a level to unlock the next
      </p>
    </div>
  )
}
