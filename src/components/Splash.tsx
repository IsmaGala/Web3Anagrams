import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { getStreak, timeToMidnight } from '../utils/gameUtils'
import SfxToggle from './SfxToggle'

export default function Splash() {
  const goToGame    = useGameStore(s => s.goToGame)
  const goToPremium = useGameStore(s => s.goToPremium)
  const [countdown, setCountdown] = useState(timeToMidnight())
  const streak = getStreak()

  useEffect(() => {
    const id = setInterval(() => setCountdown(timeToMidnight()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0d0220 100%)' }}>

      {/* SFX toggle — top-right */}
      <div className="absolute z-20" style={{ top: 16, right: 16 }}>
        <SfxToggle variant="splash" />
      </div>

      <div className="splash-blob blob1" />
      <div className="splash-blob blob2" />
      <div className="splash-blob blob3" />

      {[...Array(18)].map((_, i) => (
        <div key={i} className="absolute rounded-full bg-white"
          style={{ width: Math.random()*3+1, height: Math.random()*3+1,
            top: `${Math.random()*90}%`, left: `${Math.random()*100}%`,
            opacity: Math.random()*0.6+0.2,
            animation: `pulse ${2+Math.random()*3}s ease infinite`, animationDelay: `${Math.random()*3}s` }} />
      ))}

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-5">
        <div className="mb-2 text-6xl" style={{ filter:'drop-shadow(0 6px 20px rgba(167,139,250,0.8))', animation:'bounce 2s ease infinite alternate' }}>
          ⬡
        </div>
        <h1 className="font-fredoka text-center mb-1 shimmer-text"
          style={{ fontSize:'2.8rem', letterSpacing:'2px', lineHeight:1.1 }}>
          NFT<br/>WORDCHAIN
        </h1>
        <p className="font-nunito font-bold text-sm tracking-widest mb-8 uppercase"
          style={{ color:'rgba(196,181,253,0.5)' }}>
          by Gala Games
        </p>

        <div className="flex items-center gap-2 mb-8 px-5 py-2 rounded-full"
          style={{ background:'rgba(255,255,255,0.07)', border:'2px solid rgba(255,255,255,0.12)' }}>
          <span style={{ color:'#a78bfa' }}>◈</span>
          <span className="font-nunito font-bold text-sm" style={{ color:'rgba(255,255,255,0.4)', letterSpacing:'2px' }}>CONNECT WALLET</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background:'rgba(245,158,11,0.2)', color:'#fbbf24', border:'1px solid rgba(245,158,11,0.3)' }}>
            SOON
          </span>
        </div>

        {/* Single Player */}
        <button onClick={() => goToGame('single')} className="btn-3d w-full mb-4"
          style={{ background:'linear-gradient(160deg, #7c3aed, #6d28d9)',
            border:'4px solid #a78bfa', borderBottom:'4px solid #4c1d95',
            boxShadow:'0 8px 0 #3b0764, 0 0 30px rgba(124,58,237,0.4)',
            borderRadius:'20px', padding:'18px 24px' }}>
          <div className="flex items-center gap-4">
            <span className="text-5xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🎮</span>
            <span className="font-fredoka text-2xl text-white" style={{ letterSpacing:'1px' }}>SINGLE PLAYER</span>
            <span className="ml-auto text-3xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* Daily Challenge */}
        <button onClick={() => goToGame('daily')} className="btn-3d w-full mb-4"
          style={{ background:'linear-gradient(160deg, #d97706, #b45309)',
            border:'4px solid #fbbf24', borderBottom:'4px solid #78350f',
            boxShadow:'0 8px 0 #451a03, 0 0 30px rgba(217,119,6,0.4)',
            borderRadius:'20px', padding:'18px 24px' }}>
          <div className="flex items-center gap-4">
            <span className="text-5xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🏆</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-2xl text-white" style={{ letterSpacing:'1px' }}>DAILY</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.6)' }}>RESETS</span>
                <span className="font-fredoka text-sm" style={{ color:'#fde68a' }}>{countdown}</span>
                {streak > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background:'rgba(0,0,0,0.25)', color:'#fde68a' }}>
                    🔥{streak}
                  </span>
                )}
              </div>
            </div>
            <span className="text-3xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        {/* Premium Worlds — paid worlds storefront */}
        <button onClick={goToPremium} className="btn-3d w-full mb-6"
          style={{ background:'linear-gradient(160deg, #0e7490, #155e75)',
            border:'4px solid #22d3ee', borderBottom:'4px solid #042f2e',
            boxShadow:'0 8px 0 #042f2e, 0 0 30px rgba(34,211,238,0.4)',
            borderRadius:'20px', padding:'18px 24px' }}>
          <div className="flex items-center gap-4">
            <span className="text-5xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>🛸</span>
            <div className="flex-1 text-left">
              <div className="font-fredoka text-2xl text-white" style={{ letterSpacing:'1px' }}>PREMIUM</div>
              <div className="font-nunito font-bold text-xs mt-0.5" style={{ color:'rgba(207,250,254,0.7)' }}>
                UNLOCK NEW WORLDS WITH GALA
              </div>
            </div>
            <span className="text-3xl" style={{ color:'rgba(255,255,255,0.5)' }}>›</span>
          </div>
        </button>

        <p className="text-xs font-bold" style={{ color:'rgba(255,255,255,0.2)', letterSpacing:'2px' }}>
          NFT WORDCHAIN v1.0
        </p>
      </div>
    </div>
  )
}
