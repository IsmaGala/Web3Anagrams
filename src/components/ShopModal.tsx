import { useGameStore } from '../store/gameStore'
import type { HintPack } from '../types'

const PACKS: HintPack[] = [
  { id:'starter', label:'STARTER',  icon:'💡', hints:5,   cost:100,  desc:'5 hints' },
  { id:'pro',     label:'PRO',      icon:'⚡', hints:25,  cost:400,  popular:true, desc:'25 hints' },
  { id:'whale',   label:'WHALE',    icon:'💎', hints:100, cost:1000, desc:'100 hints' },
]

export default function ShopModal() {
  const showShop    = useGameStore(s => s.showShop)
  const closeShop   = useGameStore(s => s.closeShop)
  const buyPack     = useGameStore(s => s.buyPack)
  const gemsBalance = useGameStore(s => s.gemsBalance)

  if (!showShop) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center pb-0"
      style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) closeShop() }}>

      <div className="w-full max-w-sm rounded-t-3xl slide-up"
        style={{ background:'linear-gradient(180deg,#2e1065,#1a0533)',
          border:'3px solid rgba(167,139,250,0.3)', borderBottom:'none',
          boxShadow:'0 -8px 40px rgba(124,58,237,0.4)', padding:'24px 20px 36px' }}>

        {/* Handle */}
        <div className="w-12 h-1.5 rounded-full mx-auto mb-5" style={{ background:'rgba(255,255,255,0.2)' }} />

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-4xl">💡</span>
          <div>
            <h2 className="font-fredoka text-2xl text-white">HINT SHOP</h2>
            <div className="flex items-center gap-2">
              <span className="font-fredoka text-lg" style={{ color:'#a78bfa' }}>◈ {gemsBalance.toLocaleString()}</span>
              <span className="font-nunito font-bold text-xs" style={{ color:'rgba(167,139,250,0.5)' }}>GEMS</span>
            </div>
          </div>
          <button onClick={closeShop} className="ml-auto btn-3d w-10 h-10 flex items-center justify-center"
            style={{ background:'linear-gradient(160deg,#4c1d95,#3b0764)',
              border:'2px solid #7c3aed', borderBottom:'2px solid #2e1065',
              boxShadow:'0 3px 0 #1e0050', borderRadius:'50%', color:'#c4b5fd',
              fontFamily:'Fredoka One,cursive', fontSize:'1rem' }}>
            ✕
          </button>
        </div>

        {/* Packs */}
        <div className="flex flex-col gap-3">
          {PACKS.map(pack => {
            const canAfford = gemsBalance >= pack.cost
            return (
              <button key={pack.id} onClick={() => canAfford && buyPack(pack.hints, pack.cost)}
                className="btn-3d relative flex items-center gap-4 p-4 text-left"
                style={{
                  background: pack.popular
                    ? 'linear-gradient(160deg,#7c3aed,#6d28d9)'
                    : 'linear-gradient(160deg,#3b0764,#2e1065)',
                  border: `3px solid ${pack.popular ? '#a78bfa' : 'rgba(167,139,250,0.3)'}`,
                  borderBottom: `3px solid ${pack.popular ? '#4c1d95' : 'rgba(0,0,0,0.4)'}`,
                  boxShadow: pack.popular ? '0 5px 0 #3b0764, 0 0 20px rgba(124,58,237,0.4)' : '0 5px 0 rgba(0,0,0,0.5)',
                  borderRadius:'16px',
                  opacity: canAfford ? 1 : 0.5,
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                }}>
                {pack.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-fredoka text-xs px-3 py-0.5 rounded-full"
                    style={{ background:'linear-gradient(90deg,#f59e0b,#fbbf24)', color:'#1c1917' }}>
                    BEST VALUE
                  </span>
                )}
                <span className="text-4xl" style={{ filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>{pack.icon}</span>
                <div className="flex-1">
                  <div className="font-fredoka text-xl text-white">{pack.label}</div>
                  <div className="font-nunito font-bold text-sm" style={{ color:'rgba(196,181,253,0.6)' }}>{pack.desc}</div>
                </div>
                <div className="text-right">
                  <div className="font-fredoka text-xl" style={{ color:'#fbbf24' }}>{pack.cost.toLocaleString()}</div>
                  <div className="font-nunito font-bold text-xs" style={{ color:'rgba(251,191,36,0.5)' }}>GEMS</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
