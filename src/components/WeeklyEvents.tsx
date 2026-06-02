import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useWalletStore } from '../store/walletStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { getWheelSkin, type WheelSkinId } from '../skins'
import { WORLDS } from '../data/worldData'
import type { World, WorldId } from '../data/worlds'
import { formatWeekCountdown, eventPhase, currentWeekId, timeToNextPhaseChange, startWeekIdFromDate } from '../utils/gameUtils'
import { playSfx } from '../utils/sfx'
import { useScreenBackdrop } from '../utils/screenBackdrop'
import { api } from '../utils/apiClient'
import WalletConnectModal from './WalletConnectModal'

// Weekly Events hub. Lists every world flagged as `event:true`. Each card
// shows: name/subtitle/description, level count, cost, current-week unlock
// status, and a "resets in" countdown to the next epoch-anchored week
// boundary. Tapping "OPEN LEADERBOARD" toggles an inline panel with a
// placeholder ("backend coming online soon"), the player's local scores for
// this event, and a CLAIM REWARD button gated on having completed at least
// one level this week (and not yet claimed it).

// ── REWARD TIER MODEL ───────────────────────────────────────────────────
// Rank-1 reward is event-specific (the marquee skin lives in the world's
// `eventReward.firstPlaceSkin`). Ranks 2 and 3 are uniform across events.
// `rewardsFor(world)` is called per-render rather than memoized — it's a
// 3-element array literal, cheaper to recompute than to cache.
interface RewardTier {
  rank:  1 | 2 | 3
  gems:  number
  hints: number
  /** Wheel skin granted on first claim. Tier 1 only (and only when the
   *  event declares one — `firstPlaceSkin` is optional on World). */
  skin?: WheelSkinId
  icon:  string
}

function rewardsFor(world: World | undefined): RewardTier[] {
  const firstSkin = world?.eventReward?.firstPlaceSkin
  return [
    { rank: 1, gems: 500, hints: 0,  skin: firstSkin, icon: '🥇' },
    { rank: 2, gems: 250, hints: 25,                 icon: '🥈' },
    { rank: 3, gems: 150, hints: 15,                 icon: '🥉' },
  ]
}

interface EventCardEntry {
  world:    World
  weekId:   number
  /** 'active'   — this is THIS week's event (running now, or just finished
   *              and waiting for the claim window).
   *  'upcoming' — this is NEXT week's event. Preview only; no purchase,
   *              no play, no leaderboard.
   *  'past'     — a past week the player entered but hasn't claimed. */
  kind:     'active' | 'upcoming' | 'past'
}

export default function WeeklyEvents() {
  const goToSplash             = useGameStore(s => s.goToSplash)
  const setScreen              = useGameStore(s => (s as any).setScreen)
  const setWorldId             = useGameStore(s => (s as any).setWorldId)
  const purchaseEvent          = useGameStore(s => s.purchaseEvent)
  const showToast              = useGameStore(s => s.showToast)
  const gemsBalance            = useGameStore(s => s.gemsBalance)
  const isEventUnlockedForWeek = useProgressStore(s => s.isEventUnlockedForWeek)
  const getPendingClaimWeeks   = useProgressStore(s => s.getPendingClaimWeeks)
  // Subscribe to eventState so the entries list re-computes when the player
  // unlocks or claims, without each helper needing its own selector.
  useProgressStore(s => s.eventState)

  // Wallet gating — events are leaderboard-attached identity content, so we
  // require a connected wallet before letting the player unlock or enter.
  // Without this, a player could spend Gems on an event with no way to be
  // credited on the leaderboard or claim a reward, which is a dead-end UX.
  const walletAddress = useWalletStore(s => s.address)
  const [showWalletModal, setShowWalletModal] = useState(false)
  // After the player connects from inside the events page, replay the action
  // they originally tapped so the flow continues instead of forcing them to
  // tap the button a second time. `pendingAction` records that intent.
  const pendingAction = useRef<{ kind: 'play' | 'purchase'; world: World } | null>(null)

  const [confirmEvent, setConfirmEvent] = useState<World | null>(null)
  // Track which (worldId, weekId) tuple has its leaderboard panel open.
  // The composite key avoids "all the cards for one world toggle together"
  // when a world has both a current and past entry visible.
  const [showLeaderboard, setShowLeaderboard] = useState<string | null>(null)
  // Phase-aware countdown — ticks every second toward whichever boundary
  // we're approaching:
  //   ACTIVE  → counts down to Sun 00:00 PST (event end)
  //   SETTLED → counts down to Mon 16:00 PST (next event start)
  // Note we read `phase` from eventPhase() on every tick rather than at mount
  // because the countdown can naturally cross a boundary while the page is
  // open, and we want the label/numbers to flip without a manual refresh.
  const [countdown, setCountdown] = useState(timeToNextPhaseChange())
  useEffect(() => {
    const id = setInterval(() => setCountdown(timeToNextPhaseChange()), 1000)
    return () => clearInterval(id)
  }, [])

  const phase = eventPhase()
  const thisWeek = currentWeekId()

  // Derived after entries are built — see below for use in the countdown pill.
  // Declared here so TypeScript sees it before the return statement, but
  // entries is populated synchronously above so this is always up to date.
  let hasActiveEvent = false
  let hasUpcomingEvent = false

  // Build the list of cards to render. Each event world is scheduled to be
  // ACTIVE on exactly one week, controlled by its `startDate`. From the
  // events page's point of view, on any given day we may see:
  //
  //   • The world whose startDate maps to THIS week (active or settling)
  //   • The world whose startDate maps to NEXT week (upcoming preview)
  //   • Any number of past weeks the player entered but didn't claim
  //
  // Worlds whose scheduled week is in the past with no pending claim
  // disappear entirely (matches the "you lose access" rule for events
  // that finish without participation).
  const eventWorlds = WORLDS.filter(w => w.event)
  const entries: EventCardEntry[] = []
  for (const world of eventWorlds) {
    const startWid = world.startDate ? startWeekIdFromDate(world.startDate) : thisWeek
    const isThisWeeksEvent = startWid === thisWeek
    const isNextWeeksEvent = startWid === thisWeek + 1
    const unlockedThisWeek = isEventUnlockedForWeek(world.id, thisWeek)

    // Active card — this week's event. Visible if we're in active phase
    // (anyone can still buy in) OR the player already entered (settled
    // phase "claim now" affordance for participants).
    if (isThisWeeksEvent && (phase === 'active' || unlockedThisWeek)) {
      entries.push({ world, weekId: thisWeek, kind: 'active' })
    }
    // Upcoming preview — shown regardless of phase. Settled phase is
    // actually prime real estate for "look what's coming next" since the
    // current event is winding down. At the Mon 16:00 PST boundary, this
    // world's `isNextWeeksEvent` flips to `isThisWeeksEvent` on the next
    // 1-second tick, so the card transitions from preview to active
    // without any handcrafted state-machine.
    if (isNextWeeksEvent) {
      entries.push({ world, weekId: startWid, kind: 'upcoming' })
    }
    // Past stacked claims, regardless of scheduling.
    const pendingPast = getPendingClaimWeeks(world.id).filter(w => w < thisWeek)
    for (const pw of pendingPast) {
      entries.push({ world, weekId: pw, kind: 'past' })
    }
  }

  hasActiveEvent   = entries.some(e => e.kind === 'active')
  hasUpcomingEvent = entries.some(e => e.kind === 'upcoming')

  // Gate guard — if no wallet is connected, queue the action and pop the
  // connect modal. The modal calls `connectAndLogin` under the hood; on
  // success our useEffect below picks up the new walletAddress and replays
  // the queued action so the player doesn't have to tap twice.
  function requireWallet(action: { kind: 'play' | 'purchase'; world: World }): boolean {
    if (walletAddress) return true
    pendingAction.current = action
    playSfx('uiTap')
    setShowWalletModal(true)
    return false
  }

  function handlePlay(world: World) {
    if (!requireWallet({ kind: 'play', world })) return
    playSfx('uiTap')
    setWorldId(world.id)
    setScreen('levelSelect')
  }

  function handleUnlockTap(world: World) {
    if (!requireWallet({ kind: 'purchase', world })) return
    playSfx('uiTap')
    setConfirmEvent(world)
  }

  async function handleConfirmPurchase() {
    if (!confirmEvent) return
    // Defensive double-check — by the time the player taps CONFIRM, the
    // wallet should be connected, but a stale modal could in theory show
    // up after a disconnect. Re-route through the same gate to keep the
    // rule airtight.
    if (!walletAddress) {
      pendingAction.current = { kind: 'purchase', world: confirmEvent }
      setConfirmEvent(null)
      setShowWalletModal(true)
      return
    }
    // purchaseEvent is now async — server round-trip via /api/economy/spend.
    const target = confirmEvent
    setConfirmEvent(null)
    const ok = await purchaseEvent(target.id, target.cost ?? 0)
    if (ok) {
      setWorldId(target.id)
      setScreen('levelSelect')
    }
  }

  // Replay the queued action once the player finishes connecting. We only
  // act on the address transitioning from falsy → truthy: if the player
  // disconnects from elsewhere we just clear the queue without doing
  // anything surprising.
  useEffect(() => {
    if (!walletAddress) return
    const queued = pendingAction.current
    if (!queued) return
    pendingAction.current = null
    if (queued.kind === 'play') {
      showToast('✓ Wallet connected · entering event')
      setWorldId(queued.world.id)
      setScreen('levelSelect')
    } else {
      // For a purchase, drop the player into the confirmation modal — they
      // still get to see the cost summary and bail out if they want to.
      setConfirmEvent(queued.world)
    }
  }, [walletAddress, setScreen, setWorldId, showToast])

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-10 px-4"
      style={{ background: useScreenBackdrop('linear-gradient(180deg,#0c4a6e 0%,#0a2540 60%,#0d0220 100%)') }}>

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

      {/* Phase-aware countdown. Only shown when there is actually an active
          or upcoming event — avoids a misleading "EVENT ENDS IN" timer
          during weeks when no event is scheduled. */}
      {(hasActiveEvent || hasUpcomingEvent) && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-full mb-2"
          style={{
            background: hasActiveEvent ? 'rgba(14,165,233,0.1)' : 'rgba(167,139,250,0.1)',
            border:     hasActiveEvent ? '2px solid rgba(14,165,233,0.3)' : '2px solid rgba(167,139,250,0.3)',
          }}>
          <span className="font-nunito font-bold text-xs" style={{ color: hasActiveEvent ? 'rgba(186,230,253,0.5)' : 'rgba(196,181,253,0.55)' }}>
            {hasActiveEvent ? 'EVENT ENDS IN' : 'NEXT EVENT IN'}
          </span>
          <span className="font-fredoka text-base" style={{ color: hasActiveEvent ? '#7dd3fc' : '#c4b5fd' }}>
            {formatWeekCountdown(countdown)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2 rounded-full mb-7"
        style={{ background:'rgba(34,211,238,0.08)', border:'2px solid rgba(34,211,238,0.25)' }}>
        <span style={{ color:'#22d3ee' }}>◈</span>
        <span className="font-fredoka text-base" style={{ color:'#22d3ee' }}>{gemsBalance.toLocaleString()}</span>
        <span className="font-nunito font-bold text-xs" style={{ color:'rgba(207,250,254,0.4)' }}>GEMS</span>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-5">
        {entries.map(({ world, weekId, kind }) => {
          const cost      = world.cost ?? 0
          const canAfford = gemsBalance >= cost
          const cardKey   = `${world.id}:${weekId}:${kind}`
          const isOpen    = showLeaderboard === cardKey
          const isActive   = kind === 'active'
          const isUpcoming = kind === 'upcoming'
          // The "entered" flag is only meaningful for an active-this-week card.
          const enteredCurrent = isActive && isEventUnlockedForWeek(world.id, weekId)
          // Active card is "finished" once we're in settled phase — the play
          // affordance disappears and the leaderboard claim becomes the focus.
          const isFinished = isActive && phase === 'settled'

          return (
            <div key={cardKey} className="btn-3d w-full text-left"
              style={{
                background: world.gradient,
                border: `4px solid ${world.color}`,
                borderBottom: `4px solid ${world.color}88`,
                boxShadow: `0 8px 0 ${world.color}44, 0 0 28px ${world.color}33`,
                borderRadius:'20px', padding:'20px',
                // Past and upcoming cards are subtly dimmer than the active
                // card so the player's eye is drawn to what they can play now.
                opacity: isActive ? 1 : 0.88,
              }}>

              <div className="flex items-center gap-4 mb-3">
                <span className="text-4xl" style={{ filter:`drop-shadow(0 4px 8px ${world.color}77)` }}>
                  {world.icon}
                </span>
                <div className="flex-1">
                  <div className="font-fredoka text-xl text-white">{world.name}</div>
                  <div className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.55)' }}>{world.subtitle}</div>
                </div>
                {isUpcoming ? (
                  <span className="font-fredoka text-xs px-3 py-1 rounded-full"
                    style={{ background:'rgba(0,0,0,0.35)', color:'#fcd34d',
                      border:`2px solid ${world.color}66`, letterSpacing:'1px' }}>
                    COMING NEXT
                  </span>
                ) : isFinished || kind === 'past' ? (
                  <span className="font-fredoka text-xs px-3 py-1 rounded-full"
                    style={{ background:'rgba(0,0,0,0.35)', color:'#fde68a',
                      border:`2px solid ${world.color}66`, letterSpacing:'1px' }}>
                    FINISHED
                  </span>
                ) : enteredCurrent ? (
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

              {/* Description shown for active + upcoming (preview info), hidden
                  for past cards where it's just visual noise. */}
              {(isActive || isUpcoming) && (
                <p className="font-nunito font-bold text-xs mb-4 leading-snug"
                  style={{ color:'rgba(255,255,255,0.65)' }}>
                  {world.description}
                </p>
              )}

              {/* Action row — depends on kind, phase, and entry status. */}
              {isUpcoming ? (
                // Upcoming events: preview only. No purchase, no play, no
                // leaderboard. The phase-aware countdown at the top of the
                // page is doing the timing communication; here we just say
                // "starts Mon 4pm PST" so the player knows when to come back.
                <div className="w-full py-3 mb-1 rounded-xl text-center"
                  style={{
                    background:'rgba(0,0,0,0.35)',
                    border:`3px dashed ${world.color}55`,
                    color:`${world.color}cc`, fontFamily:'Fredoka One,cursive',
                    fontSize:'0.9rem', letterSpacing:'1px',
                  }}>
                  STARTS MON 4:00 PM PST · {cost} GEMS
                </div>
              ) : isFinished || kind === 'past' ? (
                <div className="w-full py-3 mb-2 rounded-xl text-center"
                  style={{
                    background:'rgba(0,0,0,0.35)',
                    border:`3px dashed ${world.color}55`,
                    color:'rgba(255,255,255,0.7)', fontFamily:'Fredoka One,cursive',
                    fontSize:'0.95rem', letterSpacing:'1px',
                  }}>
                  EVENT ENDED · CHECK LEADERBOARD BELOW
                </div>
              ) : enteredCurrent ? (
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
                <button onClick={() => handleUnlockTap(world)} disabled={!canAfford}
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
                  {canAfford
                    ? walletAddress
                      ? `UNLOCK · ${cost} GEMS`
                      : `CONNECT WALLET · ${cost} GEMS`
                    : 'NOT ENOUGH GEMS'}
                </button>
              )}

              {/* Leaderboard toggle — hidden for upcoming cards (no data to
                  show yet). Past and active cards keep the toggle. */}
              {!isUpcoming && (
                <button onClick={() => { playSfx('uiTap'); setShowLeaderboard(isOpen ? null : cardKey) }}
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
              )}

              {isOpen && !isUpcoming && (
                <LeaderboardPanel
                  worldId={world.id}
                  accent={world.color}
                  weekId={isActive ? undefined : weekId}
                />
              )}
            </div>
          )
        })}

        {entries.length === 0 && (
          <p className="font-nunito font-bold text-center"
            style={{ color:'rgba(186,230,253,0.3)' }}>
            {phase === 'settled'
              ? 'No events to claim. The next event starts Monday 4pm PST.'
              : 'No events running this week. Check back soon.'}
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
              {confirmEvent.cost ?? 0} Gems will be spent.
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

      {/* Wallet gate modal — popped when a wallet-less player taps a
          purchase or play button. On successful connect the useEffect
          above resumes whichever action they originally tapped. If they
          cancel out of the modal we discard the queued intent so they're
          not surprised by a delayed action later. */}
      <WalletConnectModal
        open={showWalletModal}
        onClose={() => {
          // If the player closed the modal without connecting, drop the
          // queued action — they explicitly opted out of this flow.
          if (!walletAddress) pendingAction.current = null
          setShowWalletModal(false)
        }}
      />
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

export function LeaderboardPanel({ worldId, accent, weekId }: { worldId: WorldId; accent: string; weekId?: number }) {
  const getTotalScore         = useProgressStore(s => s.getTotalScore)
  const getCompletedCount     = useProgressStore(s => s.getCompletedCount)
  const claimEventReward      = useProgressStore(s => s.markEventRewardClaimed)
  const isClaimedForWeek      = useProgressStore(s => s.isEventClaimedForWeek)
  // Subscribe to eventState so a claim mutation re-renders the panel.
  useProgressStore(s => s.eventState)
  const showToast             = useGameStore(s => s.showToast)
  // Wallet store — needed so this component re-renders when login state flips.
  const walletAddress         = useWalletStore(s => s.address)
  const jwt                   = useWalletStore(s => s.jwt)

  // Which week does this panel represent? Defaults to "the current one".
  // Past-week panels are rendered for entered events whose competition window
  // has closed — see the stacked-cards layout in the main events component.
  const thisWeek   = currentWeekId()
  const targetWeek = weekId ?? thisWeek
  const isPastWeek = targetWeek < thisWeek

  const score        = getTotalScore(worldId)
  const completed    = getCompletedCount(worldId)
  const worldMeta    = WORLDS.find(w => w.id === worldId)
  const totalLevels  = worldMeta?.levels.length ?? 0
  const worldIcon    = worldMeta?.icon ?? '🏆'
  const claimed      = isClaimedForWeek(worldId, targetWeek)

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
        // Past weeks are fetched explicitly with ?week=N. Current week
        // requests omit the param so the server's idea of "now" wins —
        // which is harmless because the server's currentWeekId matches the
        // client's (both are epoch-anchored, timezone-free).
        const url = isPastWeek
          ? `/api/leaderboard/${encodeURIComponent(worldId)}?week=${targetWeek}`
          : `/api/leaderboard/${encodeURIComponent(worldId)}`
        const data = await api.get<LeaderboardResponse>(url)
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
  // a freshly-submitted run is reflected, when the manual refresh button is
  // tapped, or when the target week changes (e.g. a past-week card mounts).
  }, [worldId, jwt, score, refreshTick, targetWeek, isPastWeek])

  // Per-event reward tiers. Lookup is by rank — only matters when the
  // server reports a top-3 placement.
  const tiers      = rewardsFor(worldMeta)
  // Rank-driven reward — if the server returned a top-3 rank for the player,
  // they're eligible to claim that tier. The phase gate ("settled or later")
  // protects mid-event claims for the CURRENT week. For past weeks the gate
  // is automatically satisfied — by definition a past week's competition has
  // ended, so a participant can still claim any time. See gameUtils.eventPhase.
  const phase      = eventPhase()
  const serverRank = board?.you?.rank ?? null
  const rewardTier = serverRank && serverRank <= 3 ? tiers.find(r => r.rank === serverRank) : null
  const claimWindowOpen = isPastWeek || phase === 'settled'
  const eligible   = !!rewardTier && !claimed && claimWindowOpen

  function handleClaim() {
    if (!eligible || !rewardTier) return
    // Credit gems + hints in one setState so the gem counter and hint
    // counter animate together rather than in two ticks.
    useGameStore.setState(s => ({
      gemsBalance: (s as any).gemsBalance + rewardTier.gems,
      hints:       s.hints + rewardTier.hints,
    }) as any)
    // Skin grant — only on first-ever claim of this skin. `grantSkin`
    // returns true only if the player didn't already own it, so a player
    // who wins the same skin twice (replay events, multiple weeks)
    // still gets gems + hints but isn't double-counted as a fresh unlock.
    let grantedFreshSkin = false
    if (rewardTier.skin) {
      grantedFreshSkin = useCosmeticsStore.getState().grantSkin(rewardTier.skin)
      // Auto-apply the new skin for the celebratory beat. Players can
      // swap back via the picker — ownership is permanent regardless.
      if (grantedFreshSkin) useCosmeticsStore.getState().setWheelSkin(rewardTier.skin)
    }
    claimEventReward(worldId, targetWeek)
    // Toast lists exactly what landed in the player's account — keeps
    // expectation aligned with the tile grid above.
    const parts: string[] = [`+${rewardTier.gems} gems`]
    if (rewardTier.hints) parts.push(`+${rewardTier.hints} hints`)
    if (grantedFreshSkin && rewardTier.skin) {
      parts.push(`+${getWheelSkin(rewardTier.skin).label} skin`)
    }
    showToast(`✓ Rank #${rewardTier.rank} · ${parts.join(' · ')}`)
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
          LEADERBOARD
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

      {/* Reward tiers — gems on every tier, skin on rank 1, hints on
          ranks 2/3. Multi-line layout keeps the small tiles readable
          without truncating either reward component. */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {tiers.map(r => {
          const isYourRank = serverRank === r.rank
          return (
            <div key={r.rank} className="rounded-lg p-2 text-center"
              style={{
                background: isYourRank ? `${accent}33` : 'rgba(255,255,255,0.05)',
                border: isYourRank
                  ? `1.5px solid ${accent}`
                  : '1.5px solid rgba(255,255,255,0.1)',
              }}>
              <div className="text-xl leading-none mb-1">{r.icon}</div>
              <div className="font-fredoka text-[0.65rem] leading-tight"
                style={{ color: '#fde68a' }}>
                <div>{r.gems} gems</div>
                {r.skin && (
                  <div style={{ color: '#a5f3fc' }}>
                    + {getWheelSkin(r.skin).label} skin
                  </div>
                )}
                {r.hints > 0 && (
                  <div>+ {r.hints} hints</div>
                )}
              </div>
            </div>
          )
        })}
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

      {/* Local-progress summary row — only meaningful for the CURRENT week's
          panel. For past weeks the player's per-level progress was wiped
          when they entered the new week, so the local count/score numbers
          would be misleading. The server leaderboard rows above still show
          their authoritative score for the past week. */}
      {!isPastWeek && (
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
      )}

      {/* Claim button — enabled when server-rank ≤ 3, not yet claimed, and
          the claim window is open (settled phase OR past week). */}
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
          ✓ REWARD CLAIMED
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
              than a generic catch-all. For a past week we surface the
              player's final rank (no climbing possible — competition's over).
              For the current week we surface either "wait for week end" or
              the actual gap to top-3 so they know what they're shooting for. */}
          {eligible && rewardTier
            ? `CLAIM RANK #${rewardTier.rank} · +${rewardTier.gems} GEMS`
            : !walletAddress
              ? 'CONNECT WALLET TO QUALIFY'
              : !jwt
                ? 'SIGN IN TO QUALIFY'
                : serverRank === null
                  ? (isPastWeek ? 'NO REWARD — DID NOT FINISH A LEVEL' : 'PLAY A LEVEL TO QUALIFY')
                  : isPastWeek
                    ? `FINAL RANK · #${serverRank}`
                    : serverRank <= 3 && phase === 'active'
                      ? 'EVENT IN PROGRESS · CLAIM AT WEEK END'
                      : `#${serverRank} · CLIMB ${serverRank - 3} ${serverRank - 3 === 1 ? 'SPOT' : 'SPOTS'}`}
        </button>
      )}
    </div>
  )
}
