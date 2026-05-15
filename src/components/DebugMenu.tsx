import { useState } from 'react'
import { useGameStore, wipeEconomy } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { WORLDS } from '../data/worldData'
import type { WorldId } from '../data/worlds'

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

const DEV = (import.meta as any).env?.DEV === true

export default function DebugMenu() {
  if (!DEV) return null

  const [open, setOpen] = useState(false)
  const [galaInput, setGalaInput] = useState('')
  const [hintsInput, setHintsInput] = useState('')

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
    const next = new Set<string>(lvl.words)
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
      </div>
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
