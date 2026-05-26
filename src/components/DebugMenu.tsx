import { useState } from 'react'
import { useGameStore, wipeEconomy } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { useWalletStore } from '../store/walletStore'
import { WHEEL_SKIN_LIST, getWheelSkin } from '../skins'
import { WORLDS } from '../data/worldData'
import type { World, WorldId } from '../data/worlds'
import { currentWeekId, startWeekIdFromDate } from '../utils/gameUtils'

// ── All localStorage keys the game owns ─────────────────────────────────────
// Keep in sync with any new keys added to the stores / sfx.ts.
const ALL_LOCAL_KEYS = [
  'wc_progress_v1',
  'wc_premium_unlocks_v1',
  'wc_event_state_v1',
  'wc_daily_attempt_v1',
  'wc_economy_v1',
  'wc_world_completion_claimed_v1',
  'wc_welcome_bonus_v1',
  'wc_cosmetics_v2',
  'wc_cosmetics_v1',   // legacy
  'wc_sfx_muted',
  'wc_onboarding_seen_v1',
] as const

// ── Event-schedule helper ────────────────────────────────────────────────
// Walks every world flagged as `event:true`, parses its Monday startDate
// into a real Date, and returns the rows that fall inside a sliding
// horizon: [today - 7d, today + daysAhead]. The 7-day look-back keeps
// currently-active events visible (their startDate is already in the
// past, but they're still playable). Each row is tagged with a phase
// derived from the same weekId math the rest of the app uses, so the
// label here matches what WeeklyEvents would show.
interface ScheduleRow {
  world: World
  phase: 'active' | 'upcoming' | 'past'
  start: Date
  end:   Date
}

function getEventSchedule(daysAhead = 30): ScheduleRow[] {
  const now           = new Date()
  const horizonStart  = now.getTime() - 7  * 86_400_000
  const horizonEnd    = now.getTime() + daysAhead * 86_400_000
  const thisWeek      = currentWeekId(now)
  const out: ScheduleRow[] = []

  for (const w of WORLDS) {
    if (!w.event || !w.startDate) continue
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w.startDate)
    if (!m) continue
    // Local-time Date — the dev panel is a local-developer affordance,
    // we don't need to roundtrip through PST here. The phase tag below
    // comes from startWeekIdFromDate which DOES use PST anchoring, so
    // the displayed phase still matches the production rules.
    const start  = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
    const endMs  = start.getTime() + 7 * 86_400_000
    if (endMs < horizonStart || start.getTime() > horizonEnd) continue

    const eventWeek = startWeekIdFromDate(w.startDate)
    const phase: ScheduleRow['phase'] =
      eventWeek < thisWeek ? 'past'
        : eventWeek === thisWeek ? 'active'
        : 'upcoming'

    out.push({ world: w, phase, start, end: new Date(endMs) })
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Dev-only debug panel. Renders nothing in production builds because the
// import.meta.env.DEV check below short-circuits at the top of the component
// (and Vite's tree-shaker will drop the rest of the bundle in prod).
//
// What it gives you:
//   • Navigation — jump straight to splash / worldSelect / premium / any
//     world's level select.
//   • Economy   — bump Gems & hints up/down by common amounts, or set to
//     an exact number.
//   • Progress  — unlock-all / complete-all / wipe per-world, plus a
//     grant-or-revoke for the premium-unlock map.
//   • Game     — when an active round is on screen, fast-forward to win or
//     lose; for daily, trigger win/lose overlay.

// Visible in local dev OR when VITE_ENABLE_DEBUG=true is set on the deployment.
// Set it on the testnet Vercel project; never set it on production.
const DEV = (import.meta as any).env?.DEV === true
         || (import.meta as any).env?.VITE_ENABLE_DEBUG === 'true'

export default function DebugMenu() {
  if (!DEV) return null

  const [open, setOpen] = useState(false)
  const [galaInput, setGalaInput] = useState('')
  const [hintsInput, setHintsInput] = useState('')
  // 30-day event schedule panel — collapsed by default to keep the menu
  // compact, expanded on demand so devs can verify the rotation.
  const [showSchedule, setShowSchedule] = useState(false)
  // Testnet full-wipe state
  const [resetStatus, setResetStatus]   = useState<'idle' | 'wiping' | 'done' | 'error'>('idle')
  const [resetMsg, setResetMsg]         = useState('')
  const [adminSecret, setAdminSecret]   = useState('')

  // Game store fields we surface
  const screen          = useGameStore(s => s.screen)
  const gameMode        = useGameStore(s => s.gameMode)
  const gemsBalance     = useGameStore(s => s.gemsBalance)
  const hints           = useGameStore(s => s.hints)
  const currentLevelIdx = useGameStore(s => s.currentLevelIndex)
  const worldId         = useGameStore(s => (s as any).selectedWorldId) as WorldId
  const setScreen       = useGameStore(s => (s as any).setScreen)
  const setWorldId      = useGameStore(s => (s as any).setWorldId)
  const goToSplash      = useGameStore(s => s.goToSplash)
  const goToPremium     = useGameStore(s => s.goToPremium)
  const loadWorldLevels = useGameStore(s => s.loadWorldLevels)
  const initLevel       = useGameStore(s => s.initLevel)
  const triggerDailyWin = useGameStore(s => s.triggerDailyWin)
  const triggerDailyLose= useGameStore(s => s.triggerDailyLose)

  // Progress store
  const markLevelComplete   = useProgressStore(s => s.markLevelComplete)
  const markPremiumUnlocked = useProgressStore(s => s.markPremiumUnlocked)
  const isPremiumUnlocked   = useProgressStore(s => s.isPremiumUnlocked)
  const resetProgress       = useProgressStore(s => s.reset)
  const unlockEventForWeek  = useProgressStore(s => s.unlockEventForWeek)
  const isEventUnlocked     = useProgressStore(s => s.isEventUnlockedThisWeek)
  const forceEventReset     = useProgressStore(s => s.forceEventReset)
  const goToEvents          = useGameStore(s => s.goToEvents)
  const clearDailyAttempt   = useProgressStore(s => s.clearDailyAttempt)
  const setDailyAttempt     = useProgressStore(s => s.setDailyAttempt)
  const todaysDailyAttempt  = useProgressStore(s => s.getTodaysDailyAttempt)()

  // Cosmetics — wheel-skin picker. Reading the id keeps this component
  // subscribed to skin changes so the active button highlight stays in sync.
  const wheelSkinId    = useCosmeticsStore(s => s.wheelSkin)
  const setWheelSkin   = useCosmeticsStore(s => s.setWheelSkin)

  // Wallet — needed for the testnet full-wipe so we know which address to
  // delete on the server.
  const walletAddress  = useWalletStore(s => (s as any).address ?? (s as any).walletAddress ?? '') as string
  const jwt            = useWalletStore(s => (s as any).jwt ?? '') as string

  // ─── Action helpers ────────────────────────────────────────────────────
  function addGala(n: number) {
    useGameStore.setState({ gemsBalance: Math.max(0, gemsBalance + n) })
  }
  function setGalaExact(n: number) {
    useGameStore.setState({ gemsBalance: Math.max(0, n) })
  }
  function addHints(n: number) {
    useGameStore.setState({ hints: Math.max(0, hints + n) })
  }
  function setHintsExact(n: number) {
    useGameStore.setState({ hints: Math.max(0, n) })
  }

  function jumpToWorld(id: WorldId) {
    const w = WORLDS.find(x => x.id === id)
    if (!w) return
    setWorldId(id)
    setScreen('levelSelect')
  }

  function unlockAll(id: WorldId) {
    const w = WORLDS.find(x => x.id === id)
    if (!w) return
    // Marking a level "completed" with score 0 still unlocks the next one.
    // We use score 0 so the player's actual high scores aren't overwritten
    // by debug operations on un-played levels.
    for (let i = 0; i < w.levels.length; i++) markLevelComplete(id, i, 0)
  }
  function completeAll(id: WorldId) {
    const w = WORLDS.find(x => x.id === id)
    if (!w) return
    for (let i = 0; i < w.levels.length; i++) markLevelComplete(id, i, 1000)
  }
  function unlockAllPremium() {
    WORLDS.filter(w => w.premium).forEach(w => markPremiumUnlocked(w.id))
  }

  function completeCurrentLevel() {
    const w = WORLDS.find(x => x.id === worldId)
    if (!w) return
    const lvl = w.levels[currentLevelIdx]
    if (!lvl) return
    // Fill foundWords with every primary word, save progress, and pop the
    // appropriate overlay (daily → triggerDailyWin, single → level-complete).
    // After the bundle strip, `lvl.words` is undefined in production builds —
    // this debug helper is only useful for legacy dev builds that still ship
    // answer keys, so we default to an empty set when stripped.
    const next = new Set<string>(lvl.words ?? [])
    useGameStore.setState({ foundWords: next, score: 1000 } as any)
    markLevelComplete(worldId, currentLevelIdx, 1000)
    setTimeout(() => {
      if (gameMode === 'daily') triggerDailyWin()
      else useGameStore.setState({ _levelComplete: true } as any)
    }, 50)
  }

  function jumpToLevelInWorld(id: WorldId, levelIndex: number) {
    const w = WORLDS.find(x => x.id === id)
    if (!w || !w.levels[levelIndex]) return
    setWorldId(id)
    loadWorldLevels(w.levels)
    useGameStore.setState({
      currentLevelIndex: levelIndex, score: 0,
      screen: 'game', gameMode: 'single',
      _worldId: id, selectedWorldId: id,
    } as any)
    setTimeout(() => initLevel(), 0)
  }

  // ─── Testnet gem / hint grant ────────────────────────────────────────
  // Calls /api/admin/grant-gems — bypasses GalaChain entirely.
  // Use when the fee payer wallet is empty or testnet GALA is unavailable.
  const [grantGemsAmt,  setGrantGemsAmt]  = useState('1000')
  const [grantHintsAmt, setGrantHintsAmt] = useState('0')
  const [grantStatus,   setGrantStatus]   = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [grantMsg,      setGrantMsg]      = useState('')

  async function serverGrantBalance() {
    if (grantStatus === 'busy') return
    if (!adminSecret) { setGrantMsg('Enter ADMIN_SECRET first (see TESTNET RESET section above).'); setGrantStatus('error'); return }
    if (!jwt)         { setGrantMsg('No JWT — connect a wallet first.'); setGrantStatus('error'); return }
    const gems  = parseInt(grantGemsAmt,  10) || 0
    const hints = parseInt(grantHintsAmt, 10) || 0
    if (gems === 0 && hints === 0) { setGrantMsg('Set at least one amount > 0.'); setGrantStatus('error'); return }
    setGrantStatus('busy')
    setGrantMsg('Granting…')
    try {
      const r = await fetch('/api/admin/grant-gems', {  // → api/admin/[action].ts
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-admin-secret': adminSecret,
          'Authorization':  `Bearer ${jwt}`,
        },
        body: JSON.stringify({ gems, hints }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setGrantMsg(`Error ${r.status}: ${j?.error ?? 'unknown'}`); setGrantStatus('error'); return }
      // Apply new balances directly to the store so the UI updates instantly
      // without needing a full pull (same pattern as pullAndApply balances override).
      useGameStore.setState({ gemsBalance: j.newBalance.gems, hints: j.newBalance.hints } as any)
      setGrantMsg(`✅ Done! Balance: ${j.newBalance.gems.toLocaleString()} gems · ${j.newBalance.hints} hints`)
      setGrantStatus('done')
      setTimeout(() => { setGrantStatus('idle'); setGrantMsg('') }, 4000)
    } catch (e: any) {
      setGrantMsg(`Network error: ${e?.message ?? String(e)}`)
      setGrantStatus('error')
    }
  }

  // ─── Testnet full wipe ────────────────────────────────────────────────
  // 1. DELETE all server rows for this wallet via /api/admin/reset-player
  // 2. Clear every localStorage key the game owns
  // 3. Hard-reload so all stores re-hydrate from scratch (blank state)
  async function fullTestnetWipe() {
    if (resetStatus === 'wiping') return
    const addr = walletAddress || ''
    if (!addr) {
      setResetMsg('No wallet connected — connect a wallet first.')
      setResetStatus('error')
      return
    }
    if (!adminSecret) {
      setResetMsg('Enter ADMIN_SECRET first.')
      setResetStatus('error')
      return
    }
    const confirmed = window.confirm(
      `⚠️ FULL TESTNET WIPE\n\nThis will permanently delete ALL server data for:\n${addr}\n\nAnd clear all localStorage for this browser.\n\nThis cannot be undone. Continue?`
    )
    if (!confirmed) return

    setResetStatus('wiping')
    setResetMsg('Deleting server data…')

    try {
      const resp = await fetch('/api/admin/reset-player', {  // → api/admin/[action].ts
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-admin-secret': adminSecret,
          ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ address: addr }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setResetMsg(`Server error ${resp.status}: ${json?.error ?? 'unknown'}`)
        setResetStatus('error')
        return
      }

      // Server cleared — now wipe localStorage
      setResetMsg('Clearing localStorage…')
      for (const key of ALL_LOCAL_KEYS) {
        try { localStorage.removeItem(key) } catch {}
      }

      const d = json.deleted ?? {}
      setResetMsg(
        `✅ Done! Deleted: ${d.player_state ?? 0} profile, ` +
        `${d.player_balances ?? 0} balance, ` +
        `${d.balance_transactions ?? 0} txns, ` +
        `${d.scores ?? 0} scores. ` +
        `Reloading in 2s…`
      )
      setResetStatus('done')
      setTimeout(() => window.location.reload(), 2000)

    } catch (e: any) {
      setResetMsg(`Network error: ${e?.message ?? String(e)}`)
      setResetStatus('error')
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed z-[1000] font-fredoka"
        style={{
          right: 12, bottom: 12,
          background: 'linear-gradient(160deg,#1e293b,#0f172a)',
          color: '#a5f3fc',
          border: '2px solid #06b6d4',
          borderBottom: '2px solid #164e63',
          borderRadius: 12,
          padding: '6px 12px',
          fontSize: '0.85rem',
          boxShadow: '0 3px 0 #164e63, 0 0 12px rgba(6,182,212,0.4)',
          letterSpacing: '1px',
          cursor: 'pointer',
        }}>
        🐛 DEV
      </button>
    )
  }

  const btn: React.CSSProperties = {
    background: 'linear-gradient(160deg,#334155,#1e293b)',
    color: '#e2e8f0',
    border: '2px solid #475569',
    borderBottom: '2px solid #0f172a',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: '0.72rem',
    fontFamily: 'Nunito,sans-serif',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 0 #0f172a',
  }
  const btnDanger: React.CSSProperties = { ...btn, border:'2px solid #b91c1c', borderBottom:'2px solid #450a0a', boxShadow:'0 2px 0 #450a0a', color:'#fecaca', background:'linear-gradient(160deg,#7f1d1d,#450a0a)' }
  const btnAccent: React.CSSProperties = { ...btn, border:'2px solid #06b6d4', borderBottom:'2px solid #164e63', boxShadow:'0 2px 0 #164e63', color:'#a5f3fc', background:'linear-gradient(160deg,#0891b2,#155e75)' }
  const header: React.CSSProperties = { color:'#67e8f9', fontFamily:'Fredoka One,cursive', fontSize:'0.75rem', letterSpacing:'2px', margin:'10px 0 4px' }
  const subtle: React.CSSProperties = { color:'rgba(226,232,240,0.55)', fontSize:'0.7rem', fontFamily:'Nunito,sans-serif', fontWeight:700 }
  const input: React.CSSProperties = {
    background:'rgba(0,0,0,0.4)', border:'1px solid #475569', borderRadius:6,
    color:'#e2e8f0', padding:'3px 6px', fontSize:'0.75rem', width:80,
    fontFamily:'Nunito,sans-serif',
  }

  return (
    <div className="fixed z-[1000]"
      style={{
        right: 12, bottom: 12, top: 12,
        width: 280,
        background: 'linear-gradient(180deg,#0f172a,#020617)',
        border: '2px solid #06b6d4',
        borderRadius: 14,
        boxShadow: '0 6px 0 #164e63, 0 0 32px rgba(6,182,212,0.25)',
        padding: 12,
        overflowY: 'auto',
        fontFamily: 'Nunito,sans-serif',
      }}>

      <div className="flex items-center justify-between mb-2">
        <span className="font-fredoka" style={{ color:'#67e8f9', letterSpacing:'2px' }}>🐛 DEV MENU</span>
        <button onClick={() => setOpen(false)} style={btn}>✕</button>
      </div>

      <div style={subtle}>
        screen: <b style={{color:'#a5f3fc'}}>{screen}</b> · world: <b style={{color:'#a5f3fc'}}>{worldId}</b> · L{currentLevelIdx + 1} · mode: {gameMode}
      </div>
      <div style={subtle}>
        GEMS <b style={{color:'#fbbf24'}}>{gemsBalance.toLocaleString()}</b> · hints <b style={{color:'#a78bfa'}}>{hints}</b>
      </div>
      <div style={{ ...subtle, wordBreak:'break-all' }}>
        wallet: <b style={{color: walletAddress ? '#86efac' : '#f87171'}}>
          {walletAddress || 'not connected'}
        </b>
      </div>

      {/* ── TESTNET FULL WIPE ─────────────────────────────────────── */}
      <div style={{
        ...header,
        color: '#f87171',
        borderBottom: '1px solid rgba(248,113,113,0.3)',
      }}>
        ⚠️ TESTNET RESET
      </div>
      <div style={{ ...subtle, marginBottom: 4 }}>
        Wipes ALL server + localStorage data for the connected wallet.
        Requires <code style={{color:'#fbbf24'}}>ADMIN_SECRET</code>.
      </div>
      <div className="flex gap-1 items-center mb-1">
        <input
          type="password"
          placeholder="ADMIN_SECRET"
          value={adminSecret}
          onChange={e => setAdminSecret(e.target.value)}
          style={{
            ...input,
            flex: 1,
            borderColor: adminSecret ? '#475569' : '#7f1d1d',
          }}
        />
      </div>
      <button
        style={{
          ...btnDanger,
          width: '100%',
          opacity: resetStatus === 'wiping' ? 0.6 : 1,
          background: resetStatus === 'wiping'
            ? 'linear-gradient(160deg,#7f1d1d,#450a0a)'
            : 'linear-gradient(160deg,#dc2626,#7f1d1d)',
          border: '2px solid #ef4444',
          borderBottom: '2px solid #7f1d1d',
          boxShadow: '0 2px 0 #7f1d1d, 0 0 10px rgba(239,68,68,0.4)',
          letterSpacing: '1px',
        }}
        disabled={resetStatus === 'wiping' || resetStatus === 'done'}
        onClick={fullTestnetWipe}
      >
        {resetStatus === 'wiping' ? '⏳ wiping…'
          : resetStatus === 'done' ? '✅ done — reloading'
          : '🗑️ FULL WIPE (server + local)'}
      </button>
      {resetMsg && (
        <div style={{
          ...subtle,
          marginTop: 4,
          color: resetStatus === 'error' ? '#f87171' : resetStatus === 'done' ? '#86efac' : '#a5f3fc',
          wordBreak: 'break-word',
        }}>
          {resetMsg}
        </div>
      )}
      {resetStatus === 'error' && (
        <button style={{ ...btn, marginTop: 4 }} onClick={() => { setResetStatus('idle'); setResetMsg('') }}>
          dismiss
        </button>
      )}

      <div style={header}>NAV</div>
      <div className="flex flex-wrap gap-1">
        <button style={btn} onClick={goToSplash}>splash</button>
        <button style={btn} onClick={() => setScreen('worldSelect')}>worlds</button>
        <button style={btn} onClick={goToPremium}>premium</button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {WORLDS.filter(w => !w.comingSoon).map(w => (
          <button key={w.id} style={btn} onClick={() => jumpToWorld(w.id)}>
            {w.icon} {w.id}
          </button>
        ))}
      </div>

      <div style={header}>JUMP TO LEVEL (current world)</div>
      <div className="flex flex-wrap gap-1">
        {(WORLDS.find(w => w.id === worldId)?.levels ?? []).map((_, i) => (
          <button key={i} style={btn} onClick={() => jumpToLevelInWorld(worldId, i)}>L{i+1}</button>
        ))}
      </div>

      {/* ── SERVER GRANT (testnet GalaChain bypass) ──────────────────── */}
      <div style={{ ...header, color: '#86efac', borderBottom: '1px solid rgba(134,239,172,0.3)' }}>
        💎 SERVER GRANT (no GALA needed)
      </div>
      <div style={{ ...subtle, marginBottom: 4 }}>
        Credits gems/hints directly on the server — bypasses GalaChain.
        Requires ADMIN_SECRET + connected wallet.
      </div>
      <div className="flex gap-1 items-center mb-1">
        <span style={subtle}>Gems</span>
        <input style={{ ...input, width: 70 }} value={grantGemsAmt}
          onChange={e => setGrantGemsAmt(e.target.value)} placeholder="1000" />
        <span style={subtle}>Hints</span>
        <input style={{ ...input, width: 50 }} value={grantHintsAmt}
          onChange={e => setGrantHintsAmt(e.target.value)} placeholder="0" />
        <button
          style={{ ...btnAccent, opacity: grantStatus === 'busy' ? 0.6 : 1 }}
          disabled={grantStatus === 'busy'}
          onClick={serverGrantBalance}>
          {grantStatus === 'busy' ? '⏳' : 'grant →server'}
        </button>
      </div>
      {grantMsg && (
        <div style={{
          ...subtle, marginBottom: 4,
          color: grantStatus === 'error' ? '#f87171' : grantStatus === 'done' ? '#86efac' : '#a5f3fc',
        }}>
          {grantMsg}
          {grantStatus === 'error' && (
            <button style={{ ...btn, marginLeft: 6 }}
              onClick={() => { setGrantStatus('idle'); setGrantMsg('') }}>×</button>
          )}
        </div>
      )}

      <div style={header}>ECONOMY · GEMS</div>
      <div className="flex flex-wrap gap-1 mb-1">
        <button style={btnDanger} onClick={wipeEconomy} title="Reset Gems + hints to fresh-player defaults (0 / 3) and clear wc_economy_v1">
          wipe economy
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        <button style={btnAccent} onClick={() => addGala(100)}>+100</button>
        <button style={btnAccent} onClick={() => addGala(1000)}>+1k</button>
        <button style={btnAccent} onClick={() => addGala(10000)}>+10k</button>
        <button style={btnDanger} onClick={() => addGala(-100)}>-100</button>
        <button style={btnDanger} onClick={() => addGala(-1000)}>-1k</button>
        <button style={btnDanger} onClick={() => setGalaExact(0)}>=0</button>
      </div>
      <div className="flex gap-1 mt-1 items-center">
        <input style={input} placeholder="exact"
          value={galaInput} onChange={e => setGalaInput(e.target.value)} />
        <button style={btn} onClick={() => { const n = parseInt(galaInput); if (!isNaN(n)) setGalaExact(n) }}>set</button>
      </div>

      <div style={header}>ECONOMY · HINTS</div>
      <div className="flex flex-wrap gap-1">
        <button style={btnAccent} onClick={() => addHints(1)}>+1</button>
        <button style={btnAccent} onClick={() => addHints(5)}>+5</button>
        <button style={btnAccent} onClick={() => addHints(20)}>+20</button>
        <button style={btnDanger} onClick={() => addHints(-1)}>-1</button>
        <button style={btnDanger} onClick={() => setHintsExact(0)}>=0</button>
      </div>
      <div className="flex gap-1 mt-1 items-center">
        <input style={input} placeholder="exact"
          value={hintsInput} onChange={e => setHintsInput(e.target.value)} />
        <button style={btn} onClick={() => { const n = parseInt(hintsInput); if (!isNaN(n)) setHintsExact(n) }}>set</button>
      </div>

      <div style={header}>WHEEL SKIN</div>
      <div className="flex flex-wrap gap-1">
        {WHEEL_SKIN_LIST.map(s => {
          const active = s.id === wheelSkinId
          return (
            <button key={s.id}
              style={active ? btnAccent : btn}
              onClick={() => setWheelSkin(s.id)}
              title={s.description}>
              {active ? '● ' : ''}{s.label}
            </button>
          )
        })}
      </div>

      <div style={header}>PROGRESS (current world: {worldId})</div>
      <div className="flex flex-wrap gap-1">
        <button style={btnAccent} onClick={() => unlockAll(worldId)}>unlock all</button>
        <button style={btnAccent} onClick={() => completeAll(worldId)}>complete all</button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        <button style={btnDanger} onClick={resetProgress}>RESET ALL</button>
      </div>

      <div style={header}>PREMIUM WORLDS</div>
      <div className="flex flex-col gap-1">
        {WORLDS.filter(w => w.premium).map(w => {
          const owned = isPremiumUnlocked(w.id)
          return (
            <div key={w.id} className="flex items-center gap-1">
              <span style={{ ...subtle, flex:1, color: owned ? '#86efac' : 'rgba(226,232,240,0.55)' }}>
                {w.icon} {w.name} {owned ? '✓' : ''}
              </span>
              <button style={btn} onClick={() => markPremiumUnlocked(w.id)}>grant</button>
            </div>
          )
        })}
        <button style={btnAccent} onClick={unlockAllPremium}>grant ALL premium</button>
      </div>

      <div style={header}>WEEKLY EVENTS</div>
      <div className="flex flex-wrap gap-1">
        <button style={btn} onClick={goToEvents}>open events</button>
        <button style={showSchedule ? btnAccent : btn}
          onClick={() => setShowSchedule(s => !s)}
          title="List every event running in the next 30 days, with phase + reward skin">
          {showSchedule ? '✕ hide 30d schedule' : '📅 30d schedule'}
        </button>
      </div>

      {showSchedule && (
        // Scrollable in case the rotation ever grows past the panel height.
        // Phase color codes match the rest of the UI: cyan=active,
        // amber=upcoming, gray=past.
        <div className="flex flex-col gap-1 mt-1"
          style={{
            background:'rgba(0,0,0,0.35)',
            border:'1px solid rgba(34,211,238,0.25)',
            borderRadius:8, padding:6, maxHeight:240, overflowY:'auto',
          }}>
          {(() => {
            const rows = getEventSchedule(30)
            if (rows.length === 0) {
              return (
                <div style={{ ...subtle, textAlign:'center', padding:'6px 0' }}>
                  No events scheduled in this window.
                </div>
              )
            }
            return rows.map(({ world, phase, start, end }) => {
              const skinId = world.eventReward?.firstPlaceSkin
              const phaseColor =
                phase === 'active'   ? '#67e8f9' :
                phase === 'upcoming' ? '#fbbf24' :
                                       'rgba(226,232,240,0.45)'
              return (
                <div key={world.id} className="flex flex-col"
                  style={{
                    background:'rgba(255,255,255,0.04)',
                    border:`1px solid ${phaseColor}33`,
                    borderLeft:`3px solid ${phaseColor}`,
                    borderRadius:6, padding:'4px 6px',
                  }}>
                  <div className="flex items-center justify-between" style={{ gap:6 }}>
                    <span style={{
                      ...subtle, color:'#e2e8f0', flex:1,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                    }}>
                      {world.icon} <b>{world.name}</b>
                    </span>
                    <span className="font-fredoka" style={{
                      color: phaseColor, fontSize:'0.6rem', letterSpacing:'1.5px',
                    }}>
                      {phase.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ ...subtle, fontSize:'0.65rem', marginTop:2 }}>
                    {formatShortDate(start)} → {formatShortDate(end)}
                    {skinId && (
                      <>
                        <span style={{ color:'rgba(226,232,240,0.4)' }}> · </span>
                        <span style={{ color:'#a5f3fc' }}>
                          🥇 {getWheelSkin(skinId).label}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      <div className="flex flex-col gap-1 mt-1">
        {WORLDS.filter(w => w.event).map(w => {
          const open = isEventUnlocked(w.id)
          return (
            <div key={w.id} className="flex items-center gap-1">
              <span style={{ ...subtle, flex:1, color: open ? '#7dd3fc' : 'rgba(226,232,240,0.55)' }}>
                {w.icon} {w.name} {open ? '✓ open' : '(locked)'}
              </span>
              <button style={btn} onClick={() => unlockEventForWeek(w.id)}>grant</button>
              <button style={btnDanger} onClick={() => forceEventReset(w.id)}>reset</button>
            </div>
          )
        })}
      </div>

      <div style={header}>DAILY LOCKOUT</div>
      <div style={subtle}>
        today: <b style={{color:'#a5f3fc'}}>{todaysDailyAttempt ? todaysDailyAttempt.status : 'available'}</b>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        <button style={btn}        onClick={clearDailyAttempt}>clear</button>
        <button style={btnAccent}  onClick={() => setDailyAttempt('won')}>set won</button>
        <button style={btnDanger}  onClick={() => setDailyAttempt('lost')}>set lost</button>
      </div>

      <div style={header}>GAME (current round)</div>
      <div className="flex flex-wrap gap-1">
        <button style={btnAccent} onClick={completeCurrentLevel}
          disabled={screen !== 'game'}>complete level</button>
        <button style={btnAccent} onClick={triggerDailyWin}
          disabled={gameMode !== 'daily'}>daily WIN</button>
        <button style={btnDanger} onClick={triggerDailyLose}
          disabled={gameMode !== 'daily'}>daily LOSE</button>
      </div>
    </div>
  )
}
