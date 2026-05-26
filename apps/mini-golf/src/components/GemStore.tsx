// Gem store — same packs approach as wordchain.
// TODO: wire to actual purchase flow via economyClient.

import { useGameStore } from '../store/gameStore'
import { playSfx } from '@gala-games/metagame'

interface GemPack {
  id: string; label: string; gems: number; price: string; icon: string; popular?: boolean
}

const PACKS: GemPack[] = [
  { id: 'small',  label: 'Starter',   gems: 100,  price: '$0.99',  icon: '💎' },
  { id: 'medium', label: 'Classic',   gems: 300,  price: '$2.49',  icon: '💎💎', popular: true },
  { id: 'large',  label: 'Pro',       gems: 750,  price: '$4.99',  icon: '💎💎💎' },
  { id: 'mega',   label: 'Champion',  gems: 2000, price: '$9.99',  icon: '👑' },
]

export default function GemStore() {
  const goToWorldSelect = useGameStore(s => s.goToWorldSelect)
  const gemsBalance     = useGameStore(s => s.gemsBalance)

  function handlePurchase(pack: GemPack) {
    // TODO: integrate GalaChain / GUSDC payment
    playSfx('purchase')
    alert(`Purchase ${pack.label} (${pack.gems} 💎) for ${pack.price} — payment flow coming soon!`)
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(160deg, #0c1a2e, #060d17)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={goToWorldSelect}
            className="font-fredoka text-lg px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#93c5fd' }}>
            ←
          </button>
          <h1 className="font-fredoka text-3xl" style={{ color: '#93c5fd' }}>💎 GEM STORE</h1>
        </div>
        <div className="font-fredoka text-xl px-4 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#fbbf24' }}>
          {gemsBalance} 💎
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="font-nunito font-bold text-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Gems unlock premium courses, balls, and clubs.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {PACKS.map(pack => (
            <button
              key={pack.id}
              onClick={() => handlePurchase(pack)}
              className="btn-3d relative flex flex-col items-center p-5 rounded-2xl"
              style={{
                background: pack.popular ? 'linear-gradient(160deg, #1e3a5f, #0f2040)' : 'linear-gradient(160deg, #1f2937, #111827)',
                border: `3px solid ${pack.popular ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                borderBottom: `3px solid ${pack.popular ? '#1e3a5f' : 'rgba(0,0,0,0.4)'}`,
                boxShadow: `0 5px 0 ${pack.popular ? '#1e3a5f' : 'rgba(0,0,0,0.3)'}`,
              }}
            >
              {pack.popular && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 font-fredoka text-xs px-2 py-0.5 rounded-full"
                  style={{ background: '#3b82f6', color: '#fff' }}>
                  POPULAR
                </div>
              )}
              <div className="text-3xl mb-2">{pack.icon}</div>
              <div className="font-fredoka text-xl mb-1" style={{ color: '#fbbf24' }}>{pack.gems} 💎</div>
              <div className="font-nunito font-bold text-sm mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{pack.label}</div>
              <div className="font-fredoka text-base" style={{ color: '#93c5fd' }}>{pack.price}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
