import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { WORLDS } from '../data/worldData'
import type { World } from '../data/worlds'

// Premium worlds storefront. Each entry shows a card with name/subtitle/
// description/level count/cost. Locked worlds show an "UNLOCK FOR X GALA"
// button which opens a confirmation modal; on confirm we call
// gameStore.purchaseWorld() which deducts GALA and persists the unlock.
// Already-owned worlds show an "ENTER →" button that opens the world's
// level select grid.

export default function PremiumWorlds() {
  const goToSplash      = useGameStore(s => s.goToSplash)
  const setScreen       = useGameStore(s => (s as any).setScreen)
  const setWorldId      = useGameStore(s => (s as any).setWorldId)
  const purchaseWorld   = useGameStore(s => s.purchaseWorld)
  const galaBalance     = useGameStore(s => s.galaBalance)
  const isPremiumUnlocked = useProgressStore(s => s.isPremiumUnlocked)

  const [confirmWorld, setConfirmWorld] = useState<World | null>(null)

  const premiumWorlds = WORLDS.filter(w => w.premium)

  function handlePlay(world: World) {
    setWorldId(world.id)
    setScreen('levelSelect')
  }

  function handleConfirmPurchase() {
    if (!confirmWorld) return
    const ok = purchaseWorld(confirmWorld.id, confirmWorld.cost ?? 0)
    setConfirmWorld(null)
    // If purchase succeeded, immediately take the player into the world.
    if (ok) {
      setWorldId(confirmWorld.id)
      setScreen('levelSelect')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-10 px-4"
      style={{ background:'linear-gradient(180deg,#042f2e 0%,#0d2438 60%,#0d0220 100%)' }}>

      {/* Back */}
      <div className="self-start mb-5">
        <button onClick={goToSplash} className="btn-3d flex items-center gap-2 px-5 py-3"
          style={{ background:'linear-gradient(160deg,#0e7490,#155e75)',
            border:'3px solid #22d3ee', borderBottom:'3px solid #042f2e',
            boxShadow:'0 5px 0 #042f2e', borderRadius:'14px',
            color:'#cffafe', fontFamily:'Fredoka One,cursive', fontSize:'1rem' }}>
          ‹ MENU
        </button>
      </div>

      <h1 className="font-fredoka text-4xl text-center mb-1" style={{ color:'#22d3ee', textShadow:'0 4px 24px rgba(34,211,238,0.4)' }}>
        PREMIUM
      </h1>
      <p className="font-nunito font-bold text-sm mb-2"
        style={{ color:'rgba(207,250,254,0.5)', letterSpacing:'2px' }}>
        BUY NEW WORLDS WITH GALA
      </p>

      {/* GALA balance chip */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full mb-7"
        style={{ background:'rgba(34,211,238,0.08)', border:'2px solid rgba(34,211,238,0.25)' }}>
        <span style={{ color:'#22d3ee' }}>◈</span>
        <span className="font-fredoka text-base" style={{ color:'#22d3ee' }}>{galaBalance.toLocaleString()}</span>
        <span className="font-nunito font-bold text-xs" style={{ color:'rgba(207,250,254,0.4)' }}>GALA</span>
      </div>

      {/* Premium world cards */}
      <div className="w-full max-w-sm flex flex-col gap-5">
        {premiumWorlds.map(world => {
          const owned = isPremiumUnlocked(world.id)
          const cost  = world.cost ?? 0
          const canAfford = galaBalance >= cost

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
                {owned ? (
                  <span className="font-fredoka text-xs px-3 py-1 rounded-full"
                    style={{ background:'rgba(34,211,238,0.2)', color:'#67e8f9',
                      border:`2px solid ${world.color}66`, letterSpacing:'1px' }}>
                    OWNED
                  </span>
                ) : (
                  <div className="text-right">
                    <div className="font-fredoka text-base" style={{ color: world.color }}>◈ {cost.toLocaleString()}</div>
                    <div className="font-nunito font-bold text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>{world.levelCount} levels</div>
                  </div>
                )}
              </div>

              <p className="font-nunito font-bold text-xs mb-4 leading-snug"
                style={{ color:'rgba(255,255,255,0.6)' }}>
                {world.description}
              </p>

              {owned ? (
                <button onClick={() => handlePlay(world)} className="btn-3d w-full py-3"
                  style={{
                    background: `linear-gradient(160deg,${world.color},${world.color}cc)`,
                    border: `3px solid ${world.color}`,
                    borderBottom: `3px solid ${world.color}66`,
                    boxShadow: `0 5px 0 ${world.color}33`,
                    borderRadius:'14px',
                    color:'#fff', fontFamily:'Fredoka One,cursive', fontSize:'1.05rem', letterSpacing:'1px',
                  }}>
                  ENTER ›
                </button>
              ) : (
                <button onClick={() => setConfirmWorld(world)} className="btn-3d w-full py-3"
                  disabled={!canAfford}
                  style={{
                    background: canAfford
                      ? 'linear-gradient(160deg,#0e7490,#155e75)'
                      : 'linear-gradient(160deg,#374151,#1f2937)',
                    border: `3px solid ${canAfford ? '#22d3ee' : 'rgba(255,255,255,0.15)'}`,
                    borderBottom: `3px solid ${canAfford ? '#042f2e' : 'rgba(0,0,0,0.4)'}`,
                    boxShadow: `0 5px 0 ${canAfford ? '#042f2e' : 'rgba(0,0,0,0.4)'}`,
                    borderRadius:'14px',
                    color: canAfford ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontFamily:'Fredoka One,cursive', fontSize:'1rem', letterSpacing:'1px',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                  }}>
                  {canAfford ? `UNLOCK · ${cost.toLocaleString()} GALA` : 'NOT ENOUGH GALA'}
                </button>
              )}
            </div>
          )
        })}

        {premiumWorlds.length === 0 && (
          <p className="font-nunito font-bold text-center"
            style={{ color:'rgba(207,250,254,0.3)' }}>
            No premium worlds available yet. Check back soon.
          </p>
        )}
      </div>

      {/* Purchase-confirm modal */}
      {confirmWorld && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6"
          style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>
          <div className="w-full max-w-xs text-center slide-up">
            <div className="text-7xl mb-3" style={{ filter:`drop-shadow(0 6px 20px ${confirmWorld.color}aa)` }}>
              {confirmWorld.icon}
            </div>
            <h2 className="font-fredoka text-3xl mb-2" style={{ color: confirmWorld.color }}>
              UNLOCK {confirmWorld.name.toUpperCase()}?
            </h2>
            <p className="font-nunito font-bold mb-2 px-2" style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem' }}>
              {(confirmWorld.cost ?? 0).toLocaleString()} GALA will be spent.
            </p>
            <p className="font-nunito font-bold mb-6 px-2" style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.78rem' }}>
              After this you'll own {confirmWorld.levelCount} levels in the Premium section. Purchases persist on this device.
            </p>

            <button onClick={handleConfirmPurchase} className="btn-3d w-full py-3 mb-3"
              style={{
                background:`linear-gradient(160deg,${confirmWorld.color},${confirmWorld.color}cc)`,
                border:`4px solid ${confirmWorld.color}`,
                borderBottom:`4px solid ${confirmWorld.color}66`,
                boxShadow:`0 6px 0 ${confirmWorld.color}33`,
                borderRadius:'18px', color:'#fff',
                fontFamily:'Fredoka One,cursive', fontSize:'1.1rem',
              }}>
              CONFIRM · ◈ {(confirmWorld.cost ?? 0).toLocaleString()}
            </button>

            <button onClick={() => setConfirmWorld(null)} className="btn-3d w-full py-3"
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
