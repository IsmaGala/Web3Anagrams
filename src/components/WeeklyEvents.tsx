import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { WORLDS } from '../data/worldData'
import type { World, WorldId } from '../data/worlds'
import { timeToNextWeek, formatWeekCountdown } from '../utils/gameUtils'

// Weekly Events hub. Lists every world flagged as `event:true`. Each card
// shows: name/subtitle/description, level count, cost, current-week unlock
// status, and a "resets in" countdown to the next epoch-anchored week
// boundary. Tapping "OPEN LEADERBOARD" toggles an inline panel with a
// placeholder ("backend coming online soon"), the player's local scores for
// this event, and a CLAIM REWARD button gated on having completed at least
// one level this week (and not yet claimed it).

const REWARDS: { rank: number; label: string; hints: number; icon: string }[] = [
  { rank: 1, label: '100 hints',  hints: 100, icon: '🥇' },
  { rank: 2, label: '25 hints',   hints: 25,  icon: '🥈' },
  { rank: 3, label: '5 hints',    hints: 5,   icon: '🥉' },
]

// Until a real backend is wired, every successful weekly entry pays out the
// 3rd-place participation reward (5 hints) on claim. When you plug a server
// in, replace this with the actual final rank lookup.
const PLACEHOLDER_RANK = 3

export default function WeeklyEvents() {
  const goToSplash             = useGameStore(s => s.goToSplash)
  const setScreen              = useGameStore(s => (s as any).setScreen)
  const setWorldId             = useGameStore(s => (s as any).setWorldId)
  const purchaseEvent          = useGameStore(s => s.purchaseEvent)
  const galaBalance            = useGameStore(s => s.galaBalance)
  const isEventUnlockedThisWeek = useProgressStore(s => s.isEventUnlockedThisWeek)

  const [confirmEvent, setConfirmEvent] = useState<World | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState<WorldId | null>(null)
  const [countdown, setCountdown] = useState(timeToNextWeek())

  // Tick the countdown once per second so the player can see the reset clock.
  useEffect(() => {
    const id = setInterval(() => setCountdown(timeToNextWeek()), 1000)
    return () => clearInterval(id)
  }, [])

  const events = WORLDS.filter(w => w.event)

  function handlePlay(world: World) {
    setWorldId(world.id)
    setScreen('levelSelect')
  }

  function handleConfirmPurchase() {
    if (!confirmEvent) return
    const ok = purchaseEvent(confirmEvent.id, confirmEvent.cost ?? 0)
    setConfirmEvent(null)
    if (ok) {
      setWorldId(confirmEvent.id)
      setScreen('levelSelect')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-10 px-4"
      style={{ background:'linear-gradient(180deg,#0c4a6e 0%,#0a2540 60%,#0d0220 100%)' }}>

      <div className="self-start mb-5">
        <button onClick={goToSplash} className="btn-3d flex items-center gap-2 px-5 py-3"
          style={{ background:'linear-gradient(160deg,#075985,#0c4a6e)',
            border:'3px solid #0ea5e9', borderBottom:'3px solid #0c4a6e',
            boxShadow:'0 5px 0 #082f49', borderRadius:'14px',
            color:'#bae6fd', fontFamily:'Fredoka One,cursive', fontSize:'1rem' }}>
          ‹ MENU
        </button>
      </div>

      <h1 className="font-fredoka text-4xl text-center mb-1"
        style={{ color:'#0ea5e9', textShadow:'0 4px 24px rgba(14,165,233,0.4)' }}>
        WEEKLY EVENTS
      </h1>
      <p className="font-nunito font-bold text-sm mb-2"
        style={{ color:'rgba(186,230,253,0.5)', letterSpacing:'2px' }}>
        ROTATING WORLDS · LEADERBOARD REWARDS
      </p>

      <div className="flex items-center gap-3 px-4 py-2 rounded-full mb-2"
        style={{ background:'rgba(14,165,233,0.1)', border:'2px solid rgba(14,165,233,0.3)' }}>
        <span className="font-nunito font-bold text-xs" style={{ color:'rgba(186,230,253,0.5)' }}>RESETS IN</span>
        <span className="font-fredoka text-base" style={{ color:'#7dd3fc' }}>{formatWeekCountdown(countdown)}</span>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 rounded-full mb-7"
        style={{ background:'rgba(34,211,238,0.08)', border:'2px solid rgba(34,211,238,0.25)' }}>
        <span style={{ color:'#22d3ee' }}>◈</span>
        <span className="font-fredoka text-base" style={{ color:'#22d3ee' }}>{galaBalance.toLocaleString()}</span>
        <span className="font-nunito font-bold text-xs" style={{ color:'rgba(207,250,254,0.4)' }}>GALA</span>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-5">
        {events.map(world => {
          const unlocked  = isEventUnlockedThisWeek(world.id)
          const cost      = world.cost ?? 0
          const canAfford = galaBalance >= cost
          const isOpen    = showLeaderboard === world.id

          return (
            <div key={world.id} className="btn-3d w-full text-left"
              style={{
                background: world.gradient,
                border: `4px solid ${world.color}`,
                borderBottom: `4px solid ${world.color}88`,
                boxShadow: `0 8px 0 ${world.color}44, 0 0 28px ${world.color}33`,
                borderRadius:'20px', padding:'20px',
              }}>

              <div className="flex items-center gap-4 mb-3">
                <span className="text-4xl" style={{ filter:`drop-shadow(0 4px 8px ${world.color}77)` }}>
                  {world.icon}
                </span>
                <div className="flex-1">
                  <div className="font-fredoka text-xl text-white">{world.name}</div>
                  <div className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.55)' }}>{world.subtitle}</div>
                </div>
                {unlocked ? (
                  <span className="font-fredoka text-xs px-3 py-1 rounded-full"
                    style={{ background:'rgba(14,165,233,0.2)', color:'#7dd3fc',
                      border:`2px solid ${world.color}66`, letterSpacing:'1px' }}>
                    OPEN
                  </span>
                ) : (
                  <div className="text-right">
                    <div className="font-fredoka text-base" style={{ color: world.color }}>◈ {cost}</div>
                    <div className="font-nunito font-bold text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>{world.levelCount} levels</div>
                  </div>
                )}
              </div>

              <p className="font-nunito font-bold text-xs mb-4 leading-snug"
                style={{ color:'rgba(255,255,255,0.65)' }}>
                {world.description}
              </p>

              {unlocked ? (
                <button onClick={() => handlePlay(world)} className="btn-3d w-full py-3 mb-2"
                  style={{
                    background: `linear-gradient(160deg,${world.color},${world.color}cc)`,
                    border: `3px solid ${world.color}`,
                    borderBottom: `3px solid ${world.color}66`,
                    boxShadow: `0 5px 0 ${world.color}33`,
                    borderRadius:'14px',
                    color:'#fff', fontFamily:'Fredoka One,cursive', fontSize:'1.05rem', letterSpacing:'1px',
                  }}>
                  ENTER EVENT ›
                </button>
              ) : (
                <button onClick={() => setConfirmEvent(world)} disabled={!canAfford}
                  className="btn-3d w-full py-3 mb-2"
                  style={{
                    background: canAfford
                      ? 'linear-gradient(160deg,#0e7490,#155e75)'
                      : 'linear-gradient(160deg,#374151,#1f2937)',
                    border: `3px solid ${canAfford ? '#22d3ee' : 'rgba(255,255,255,0.15)'}`,
                    borderBottom: `3px solid ${canAfford ? '#0c4a6e' : 'rgba(0,0,0,0.4)'}`,
                    boxShadow: `0 5px 0 ${canAfford ? '#0c4a6e' : 'rgba(0,0,0,0.4)'}`,
                    borderRadius:'14px',
                    color: canAfford ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontFamily:'Fredoka One,cursive', fontSize:'1rem', letterSpacing:'1px',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                  }}>
                  {canAfford ? `UNLOCK · ${cost} GALA` : 'NOT ENOUGH GALA'}
                </button>
              )}

              <button onClick={() => setShowLeaderboard(isOpen ? null : world.id)}
                className="btn-3d w-full py-2"
                style={{
                  background:'rgba(0,0,0,0.3)',
                  border:'2px solid rgba(255,255,255,0.15)',
                  borderBottom:'2px solid rgba(0,0,0,0.3)',
                  borderRadius:'12px',
                  color:'#cffafe', fontFamily:'Fredoka One,cursive', fontSize:'0.85rem',
                  letterSpacing:'1px',
                }}>
                {isOpen ? '✕ HIDE LEADERBOARD' : '🏆 OPEN LEADERBOARD'}
              </button>

              {isOpen && (
                <LeaderboardPanel worldId={world.id} accent={world.color} />
              )}
            </div>
          )
        })}

        {events.length === 0 && (
          <p className="font-nunito font-bold text-center"
            style={{ color:'rgba(186,230,253,0.3)' }}>
            No events running this week. Check back soon.
          </p>
        )}
      </div>

      {/* Reward / unlock-payment confirmation modal */}
      {confirmEvent && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
          <div className="w-full max-w-xs text-center slide-up">
            <div className="text-7xl mb-3" style={{ filter:`drop-shadow(0 6px 20px ${confirmEvent.color}aa)` }}>
              {confirmEvent.icon}
            </div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color: confirmEvent.color }}>
              ENTER {confirmEvent.name.toUpperCase()}?
            </h2>
            <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem' }}>
              {confirmEvent.cost ?? 0} GALA will be spent.
            </p>
            <p className="font-nunito font-bold mb-6 px-2" style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.78rem' }}>
              Access expires when this week's event ends. Complete levels to qualify for leaderboard rewards.
            </p>

            <button onClick={handleConfirmPurchase} className="btn-3d w-full py-3 mb-3"
              style={{
                background:`linear-gradient(160deg,${confirmEvent.color},${confirmEvent.color}cc)`,
                border:`4px solid ${confirmEvent.color}`,
                borderBottom:`4px solid ${confirmEvent.color}66`,
                boxShadow:`0 6px 0 ${confirmEvent.color}33`,
                borderRadius:'18px', color:'#fff',
                fontFamily:'Fredoka One,cursive', fontSize:'1.1rem',
              }}>
              CONFIRM · ◈ {confirmEvent.cost ?? 0}
            </button>

            <button onClick={() => setConfirmEvent(null)} className="btn-3d w-full py-3"
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

// ── Inline leaderboard panel ────────────────────────────────────────────────
// Renders inside an event card when the leaderboard is toggled open. Also
// exported so we can mount it inside LevelSelect later if needed.

export function LeaderboardPanel({ worldId, accent }: { worldId: WorldId; accent: string }) {
  const getTotalScore         = useProgressStore(s => s.getTotalScore)
  const getCompletedCount     = useProgressStore(s => s.getCompletedCount)
  const claimEventReward      = useProgressStore(s => s.markEventRewardClaimed)
  const isRewardClaimed       = useProgressStore(s => s.isEventRewardClaimedThisWeek)
  const showToast             = useGameStore(s => s.showToast)

  const score     = getTotalScore(worldId)
  const completed = getCompletedCount(worldId)
  const totalLevels = (WORLDS.find(w => w.id === worldId)?.levels.length) ?? 0
  const claimed   = isRewardClaimed(worldId)
  const eligible  = completed > 0 && !claimed

  function handleClaim() {
    if (!eligible) return
    // Placeholder logic until backend supplies real rank. Grant the rank-3
    // hint pack as a participation reward. Replace with rank-driven REWARDS
    // lookup once a real leaderboard is wired up.
    const reward = REWARDS.find(r => r.rank === PLACEHOLDER_RANK)!
    useGameStore.setState(s => ({ hints: s.hints + reward.hints }) as any)
    claimEventReward(worldId)
    showToast(`✓ Rank #${reward.rank} reward claimed · +${reward.hints} hints`)
  }

  return (
    <div className="mt-3 p-3 rounded-xl"
      style={{ background:'rgba(0,0,0,0.4)', border:`2px solid ${accent}44` }}>

      <div className="font-fredoka text-sm mb-2" style={{ color: accent, letterSpacing:'1.5px' }}>
        LEADERBOARD
      </div>

      {/* Backend-pending notice */}
      <p className="font-nunito font-bold text-xs mb-3"
        style={{ color:'rgba(255,255,255,0.45)', lineHeight:1.45 }}>
        Global rankings come online once the leaderboard backend is connected. Until then your
        score is saved locally and claim pays out the participation reward.
      </p>

      {/* Reward tiers */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {REWARDS.map(r => (
          <div key={r.rank} className="rounded-lg p-2 text-center"
            style={{ background:'rgba(255,255,255,0.05)', border:'1.5px solid rgba(255,255,255,0.1)' }}>
            <div className="text-xl leading-none mb-0.5">{r.icon}</div>
            <div className="font-fredoka text-xs" style={{ color:'#fde68a' }}>{r.label}</div>
          </div>
        ))}
      </div>

      {/* Player row */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-3"
        style={{ background:`${accent}22`, border:`1.5px solid ${accent}66` }}>
        <div className="flex items-center gap-2">
          <span className="font-fredoka text-xs px-1.5 py-0.5 rounded"
            style={{ background:'rgba(0,0,0,0.4)', color:'#fff' }}>YOU</span>
          <span className="font-nunito font-bold text-xs" style={{ color:'rgba(255,255,255,0.65)' }}>
            {completed}/{totalLevels} levels
          </span>
        </div>
        <span className="font-fredoka text-sm" style={{ color: accent }}>
          ⭐ {score.toLocaleString()}
        </span>
      </div>

      {/* Claim button */}
      {claimed ? (
        <button disabled className="btn-3d w-full py-2"
          style={{
            background:'linear-gradient(160deg,#374151,#1f2937)',
            border:'2px solid rgba(255,255,255,0.15)',
            borderBottom:'2px solid rgba(0,0,0,0.4)',
            boxShadow:'0 3px 0 rgba(0,0,0,0.4)',
            borderRadius:'10px',
            color:'rgba(255,255,255,0.5)', fontFamily:'Fredoka One,cursive', fontSize:'0.85rem',
          }}>
          ✓ REWARD CLAIMED THIS WEEK
        </button>
      ) : (
        <button onClick={handleClaim} disabled={!eligible} className="btn-3d w-full py-2"
          style={{
            background: eligible
              ? `linear-gradient(160deg,${accent},${accent}cc)`
              : 'linear-gradient(160deg,#374151,#1f2937)',
            border: `2px solid ${eligible ? accent : 'rgba(255,255,255,0.15)'}`,
            borderBottom: `2px solid ${eligible ? `${accent}66` : 'rgba(0,0,0,0.4)'}`,
            boxShadow: `0 3px 0 ${eligible ? `${accent}44` : 'rgba(0,0,0,0.4)'}`,
            borderRadius:'10px',
            color: eligible ? '#fff' : 'rgba(255,255,255,0.5)',
            fontFamily:'Fredoka One,cursive', fontSize:'0.85rem', letterSpacing:'1px',
            cursor: eligible ? 'pointer' : 'not-allowed',
          }}>
          {eligible ? 'CLAIM REWARD' : (completed === 0 ? 'COMPLETE A LEVEL TO QUALIFY' : 'NOTHING TO CLAIM')}
        </button>
      )}
    </div>
  )
}
