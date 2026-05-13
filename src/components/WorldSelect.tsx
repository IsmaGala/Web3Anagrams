import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { WORLDS } from '../data/worldData'
import type { World } from '../data/worlds'

export default function WorldSelect() {
  const setScreen         = useGameStore(s => (s as any).setScreen)
  const setWorldId        = useGameStore(s => (s as any).setWorldId)
  const goToSplash        = useGameStore(s => s.goToSplash)
  const isWorldUnlocked   = useProgressStore(s => s.isWorldUnlocked)
  const getCompletedCount = useProgressStore(s => s.getCompletedCount)

  function handleWorldClick(world: World) {
    if (world.comingSoon || !isWorldUnlocked(world.id)) return
    setWorldId(world.id)
    setScreen('levelSelect')
  }

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-8 px-4"
      style={{ background:'linear-gradient(180deg,#2e1065 0%,#1a0533 60%,#0d0220 100%)' }}>

      {/* Back */}
      <div className="self-start mb-6">
        <button onClick={goToSplash} className="btn-3d flex items-center gap-2 px-5 py-3"
          style={{ background:'linear-gradient(160deg,#4c1d95,#3b0764)',
            border:'3px solid #7c3aed', borderBottom:'3px solid #2e1065',
            boxShadow:'0 5px 0 #1e0050', borderRadius:'14px',
            color:'#e9d5ff', fontFamily:'Fredoka One,cursive', fontSize:'1rem' }}>
          ‹ MENU
        </button>
      </div>

      <h1 className="font-fredoka text-4xl text-center mb-1 shimmer-text">SELECT WORLD</h1>
      <p className="font-nunito font-bold text-sm mb-8" style={{ color:'rgba(196,181,253,0.5)', letterSpacing:'2px' }}>
        COMPLETE 5 LEVELS → UNLOCK NEXT
      </p>

      <div className="w-full max-w-sm flex flex-col gap-5">
        {WORLDS.filter(w => !w.premium && !w.event).map((world, wi, arr) => {
          const unlocked   = isWorldUnlocked(world.id)
          const completed  = getCompletedCount(world.id)
          const progress   = world.levelCount > 0 ? Math.min(completed / world.levelCount, 1) : 0
          const prevWorld  = wi > 0 ? arr[wi - 1] : null
          const prevDone   = prevWorld ? getCompletedCount(prevWorld.id) : 99
          const need       = world.unlockAfter > 0 && !unlocked ? world.unlockAfter - prevDone : 0
          const locked     = !unlocked || world.comingSoon

          return (
            <button key={world.id} onClick={() => handleWorldClick(world)} disabled={locked}
              className="btn-3d w-full text-left"
              style={{
                background: locked
                  ? 'linear-gradient(160deg,#1e1040,#150a30)'
                  : world.gradient,
                border: `4px solid ${locked ? 'rgba(255,255,255,0.1)' : world.color}`,
                borderBottom: `4px solid ${locked ? 'rgba(0,0,0,0.4)' : world.color}88`,
                boxShadow: locked ? '0 6px 0 rgba(0,0,0,0.4)' : `0 8px 0 ${world.color}44, 0 0 24px ${world.color}22`,
                borderRadius:'20px', padding:'20px',
                opacity: locked ? 0.7 : 1,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}>

              <div className="flex items-center gap-4 mb-3">
                <span className="text-4xl" style={{ filter: locked ? 'grayscale(1) brightness(0.5)' : `drop-shadow(0 4px 8px ${world.color}66)` }}>
                  {locked && !world.comingSoon ? '🔒' : world.icon}
                </span>
                <div className="flex-1">
                  <div className="font-fredoka text-xl text-white">{world.name}</div>
                  <div className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.5)' }}>{world.subtitle}</div>
                </div>
                {!locked && !world.comingSoon && (
                  <div className="text-right">
                    <div className="font-fredoka text-2xl" style={{ color: world.color }}>{completed}</div>
                    <div className="font-nunito font-bold text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>/{world.levelCount}</div>
                  </div>
                )}
                {world.comingSoon && (
                  <span className="font-fredoka text-sm px-3 py-1 rounded-full"
                    style={{ background:'rgba(168,85,247,0.25)', color:'#c4b5fd', border:'2px solid rgba(168,85,247,0.4)' }}>
                    SOON
                  </span>
                )}
              </div>

              {/* Progress or lock msg */}
              {world.comingSoon ? (
                <div className="font-nunito font-bold text-sm text-center py-1" style={{ color:'rgba(196,181,253,0.4)', letterSpacing:'2px' }}>
                  ✦ NEW WORLD INCOMING ✦
                </div>
              ) : !unlocked ? (
                <div className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.35)' }}>
                  🔒 Need {need} more level{need !== 1 ? 's' : ''} in previous world
                </div>
              ) : (
                <div>
                  <div className="w-full h-3 rounded-full overflow-hidden mb-1"
                    style={{ background:'rgba(0,0,0,0.3)', border:'2px solid rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width:`${progress*100}%`, background: world.color,
                        boxShadow:`0 0 10px ${world.color}` }} />
                  </div>
                  {completed === world.levelCount && (
                    <div className="font-fredoka text-sm text-center" style={{ color: world.color }}>✓ COMPLETE!</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
