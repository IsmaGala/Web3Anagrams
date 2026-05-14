import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useWalletStore } from '../store/walletStore'
import { WORLDS } from '../data/worldData'
import type { World, WorldId } from '../data/worlds'
import { timeToNextWeek, formatWeekCountdown } from '../utils/gameUtils'
import { playSfx } from '../utils/sfx'
import { api } from '../utils/apiClient'

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
    playSfx('uiTap')
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
        <button onClick={() => { playSfx('uiTap'); goToSplash() }} className="btn-3d flex items-center gap-2 px-5 py-3"
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
                <button onClick={() => { playSfx('uiTap'); setConfirmEvent(world) }} disabled={!canAfford}
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

              <button onClick={() => { playSfx('uiTap'); setShowLeaderboard(isOpen ? null : world.id) }}
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

interface LeaderboardEntry { rank: number; address: string; score: number }
interface LeaderboardResponse { event: string; week: number; top: LeaderboardEntry[]; you: LeaderboardEntry | null }

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function LeaderboardPanel({ worldId, accent }: { worldId: WorldId; accent: string }) {
  const getTotalScore         = useProgressStore(s => s.getTotalScore)
  const getCompletedCount     = useProgressStore(s => s.getCompletedCount)
  const claimEventReward      = useProgressStore(s => s.markEventRewardClaimed)
  const isRewardClaimed       = useProgressStore(s => s.isEventRewardClaimedThisWeek)
  const showToast             = useGameStore(s => s.showToast)
  // Wallet store — needed so this component re-renders when login state flips.
  const walletAddress         = useWalletStore(s => s.address)
  const jwt                   = useWalletStore(s => s.jwt)

  const score        = getTotalScore(worldId)
  const completed    = getCompletedCount(worldId)
  const worldMeta    = WORLDS.find(w => w.id === worldId)
  const totalLevels  = worldMeta?.levels.length ?? 0
  const worldIcon    = worldMeta?.icon ?? '🏆'
  const claimed      = isRewardClaimed(worldId)

  // Server-side data
  const [board, setBoard] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  // Bumping `refreshTick` re-runs the fetch effect. Used by the manual
  // refresh button so a player can poll for new entries without closing
  // and reopening the panel.
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const data = await api.get<LeaderboardResponse>(`/api/leaderboard/${encodeURIComponent(worldId)}`)
        if (!cancelled) setBoard(data)
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Could not load leaderboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // Re-fetch when the player's JWT changes (login/logout) so the `you` row
  // appears or disappears appropriately, when their local score changes so
  // a freshly-submitted run is reflected, or when the manual refresh button
  // is tapped.
  }, [worldId, jwt, score, refreshTick])

  // Rank-driven reward — if the server returned a top-3 rank for the player,
  // they're eligible to claim that tier; otherwise no reward this week.
  const serverRank = board?.you?.rank ?? null
  const rewardTier = serverRank && serverRank <= 3 ? REWARDS.find(r => r.rank === serverRank) : null
  const eligible   = !!rewardTier && !claimed

  function handleClaim() {
    if (!eligible || !rewardTier) return
    useGameStore.setState(s => ({ hints: s.hints + rewardTier.hints }) as any)
    claimEventReward(worldId)
    showToast(`✓ Rank #${rewardTier.rank} reward claimed · +${rewardTier.hints} hints`)
  }

  return (
    <div className="mt-3 p-3 rounded-xl"
      style={{ background:'rgba(0,0,0,0.4)', border:`2px solid ${accent}44` }}>

      {/* Header row — title on the left, manual refresh on the right. The
          refresh button bumps `refreshTick`, which is in the fetch effect's
          dep list. Disabled while a fetch is already in flight so a player
          can't pile up requests. */}
      <div className="flex items-center justify-between mb-2">
        <div className="font-fredoka text-sm" style={{ color: accent, letterSpacing:'1.5px' }}>
          LEADERBOARD {board && <span style={{ color:'rgba(255,255,255,0.4)' }}>· WEEK {board.week}</span>}
        </div>
        <button
          onClick={() => { playSfx('uiTap'); setRefreshTick(t => t + 1) }}
          disabled={loading}
          aria-label="Refresh leaderboard"
          className="rounded-full px-2 py-1 text-xs font-bold"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${accent}44`,
            color: loading ? 'rgba(255,255,255,0.3)' : `${accent}cc`,
            cursor: loading ? 'wait' : 'pointer',
          }}>
          <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>↻</span>
        </button>
      </div>

      {/* Login nudge — visible until the player connects + signs in. */}
      {!walletAddress && (
        <p className="font-nunito font-bold text-xs mb-3"
          style={{ color:'rgba(255,255,255,0.5)', lineHeight:1.45 }}>
          Connect a wallet on the splash to submit your score and appear on the leaderboard.
        </p>
      )}
      {walletAddress && !jwt && (
        <p className="font-nunito font-bold text-xs mb-3"
          style={{ color:'rgba(255,255,255,0.5)', lineHeight:1.45 }}>
          You're connected but not signed in. Reconnect on the splash to refresh your session.
        </p>
      )}

      {/* Reward tiers */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {REWARDS.map(r => (
          <div key={r.rank} className="rounded-lg p-2 text-center"
            style={{
              background: serverRank === r.rank ? `${accent}33` : 'rgba(255,255,255,0.05)',
              border: serverRank === r.rank
                ? `1.5px solid ${accent}`
                : '1.5px solid rgba(255,255,255,0.1)',
            }}>
            <div className="text-xl leading-none mb-0.5">{r.icon}</div>
            <div className="font-fredoka text-xs" style={{ color:'#fde68a' }}>{r.label}</div>
          </div>
        ))}
      </div>

      {/* Top entries from the server */}
      {loading && (
        // Three faded skeleton rows that mirror the entry layout. Pulses
        // gently so the player gets a "something is happening" signal
        // without us needing a spinner widget.
        <div className="flex flex-col gap-1 mb-3" aria-label="Loading leaderboard">
          {[0, 1, 2].map(i => (
            <div key={i}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 animate-pulse"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
              <div className="flex items-center gap-2">
                <span className="inline-block rounded"
                  style={{ width: 18, height: 10, background: 'rgba(255,255,255,0.12)' }} />
                <span className="inline-block rounded"
                  style={{ width: 90, height: 10, background: 'rgba(255,255,255,0.10)' }} />
              </div>
              <span className="inline-block rounded"
                style={{ width: 48, height: 10, background: 'rgba(255,255,255,0.10)' }} />
            </div>
          ))}
        </div>
      )}
      {error && !loading && (
        <p className="font-nunito font-bold text-xs mb-2 px-2 py-1 rounded"
          style={{ background:'rgba(127,29,29,0.35)', border:'1px solid #b91c1c', color:'#fecaca' }}>
          ⚠ {error}
        </p>
      )}
      {board && board.top.length === 0 && !loading && !error && (
        // Visual empty state — fresh-week card with the event icon and an
        // encouraging line. More inviting than a flat "no scores yet" text.
        <div className="flex flex-col items-center text-center py-4 mb-3 rounded-xl"
          style={{ background: `${accent}11`, border: `1.5px dashed ${accent}55` }}>
          <span className="text-3xl mb-1" style={{ filter: `drop-shadow(0 4px 8px ${accent}55)` }}>
            {worldIcon}
          </span>
          <p className="font-fredoka text-xs" style={{ color: `${accent}`, letterSpacing: '1px' }}>
            FRESH WEEK
          </p>
          <p className="font-nunito font-bold text-xs mt-0.5"
            style={{ color:'rgba(255,255,255,0.55)' }}>
            No scores yet — finish a level to claim rank #1.
          </p>
        </div>
      )}
      {board && board.top.length > 0 && (
        <div className="flex flex-col gap-1 mb-3">
          {board.top.slice(0, 10).map(entry => {
            const isYou = !!walletAddress && entry.address.toLowerCase() === walletAddress.toLowerCase()
            return (
              <div key={entry.address + ':' + entry.rank}
                className="flex items-center justify-between rounded-lg px-2 py-1.5"
                style={{
                  background: isYou ? `${accent}22` : 'rgba(255,255,255,0.04)',
                  border:     isYou ? `1.5px solid ${accent}66` : '1px solid rgba(255,255,255,0.06)',
                }}>
                <div className="flex items-center gap-2">
                  <span className="font-fredoka text-xs"
                    style={{ color: entry.rank <= 3 ? '#fde68a' : 'rgba(255,255,255,0.6)', minWidth: 24 }}>
                    #{entry.rank}
                  </span>
                  <span className="font-nunito font-bold text-xs"
                    style={{ color: isYou ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                    {isYou ? 'YOU' : shortAddr(entry.address)}
                  </span>
                </div>
                <span className="font-fredoka text-xs" style={{ color: isYou ? accent : 'rgba(255,255,255,0.55)' }}>
                  ⭐ {entry.score.toLocaleString()}
                </span>
              </div>
            )
          })}
          {/* Sticky "where you stand" row — only when the player has a rank
              that's outside the top 10. Inside top 10 they're already
              highlighted in the list above; this avoids double-rendering. */}
          {board.you && board.you.rank > 10 && (
            <>
              <div className="text-center font-fredoka text-xs my-0.5"
                style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '2px' }}>
                · · ·
              </div>
              <div className="flex items-center justify-between rounded-lg px-2 py-1.5"
                style={{
                  background: `${accent}22`,
                  border:     `1.5px solid ${accent}66`,
                }}>
                <div className="flex items-center gap-2">
                  <span className="font-fredoka text-xs"
                    style={{ color: 'rgba(255,255,255,0.85)', minWidth: 24 }}>
                    #{board.you.rank}
                  </span>
                  <span className="font-nunito font-bold text-xs" style={{ color:'#fff' }}>
                    YOU
                  </span>
                </div>
                <span className="font-fredoka text-xs" style={{ color: accent }}>
                  ⭐ {board.you.score.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Local-progress summary row (always visible). */}
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

      {/* Claim button — only enabled when server-rank ≤ 3 and not yet claimed. */}
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
          {/* Disabled-state copy reads the player's exact situation rather
              than a generic catch-all. The "climb N spots" string surfaces
              the actual gap to top-3 so the player knows what they're
              shooting for instead of just "keep climbing". */}
          {eligible && rewardTier
            ? `CLAIM RANK #${rewardTier.rank} · +${rewardTier.hints} HINTS`
            : !walletAddress
              ? 'CONNECT WALLET TO QUALIFY'
              : !jwt
                ? 'SIGN IN TO QUALIFY'
                : serverRank === null
                  ? 'PLAY A LEVEL TO QUALIFY'
                  : `#${serverRank} · CLIMB ${serverRank - 3} ${serverRank - 3 === 1 ? 'SPOT' : 'SPOTS'}`}
        </button>
      )}
    </div>
  )
}
