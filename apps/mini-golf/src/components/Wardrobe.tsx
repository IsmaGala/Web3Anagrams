// Ball + club skin picker. Mirrors wordchain's Wardrobe but for golf cosmetics.

import { useGameStore } from '../store/gameStore'
import { useCosmeticsStore, BALL_ITEMS, CLUB_ITEMS } from '../store/cosmeticsStore'
import type { BallSkinId, ClubSkinId } from '../types'

export default function Wardrobe() {
  const goToWorldSelect = useGameStore(s => s.goToWorldSelect)
  const ballSkin    = useCosmeticsStore(s => s.ballSkin)
  const clubSkin    = useCosmeticsStore(s => s.clubSkin)
  const ownsBall    = useCosmeticsStore(s => s.ownsBall)
  const ownsClub    = useCosmeticsStore(s => s.ownsClub)
  const setBallSkin = useCosmeticsStore(s => s.setBallSkin)
  const setClubSkin = useCosmeticsStore(s => s.setClubSkin)

  function ItemCard<T extends string>({
    item, selected, owned, onSelect,
  }: { item: { id: T; label: string; description: string; price?: number; color: string }; selected: boolean; owned: boolean; onSelect: () => void }) {
    return (
      <button
        onClick={owned ? onSelect : undefined}
        className="btn-3d flex flex-col items-center p-4 rounded-2xl"
        style={{
          background: selected
            ? 'linear-gradient(160deg, #4c1d95, #3b0764)'
            : 'linear-gradient(160deg, #1f2937, #111827)',
          border: `3px solid ${selected ? '#a78bfa' : owned ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
          borderBottom: `3px solid ${selected ? '#2e1065' : 'rgba(0,0,0,0.4)'}`,
          boxShadow: `0 4px 0 ${selected ? '#1e0050' : 'rgba(0,0,0,0.3)'}`,
          opacity: owned ? 1 : 0.5,
          cursor: owned ? 'pointer' : 'default',
        }}
      >
        {/* Preview swatch */}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: item.color, boxShadow: `0 0 12px ${item.color}66`, marginBottom: 6 }} />
        <div className="font-fredoka text-base" style={{ color: selected ? '#c4b5fd' : '#fff' }}>{item.label}</div>
        <div className="font-nunito font-bold text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.description}</div>
        {!owned && (
          <div className="mt-2 font-fredoka text-sm" style={{ color: '#fbbf24' }}>
            {item.price ? `${item.price} 💎` : '🏆 Event'}
          </div>
        )}
        {selected && <div className="mt-2 text-xs font-nunito font-bold" style={{ color: '#a78bfa' }}>EQUIPPED</div>}
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(160deg, #1a1a3a, #0d0d1f)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={goToWorldSelect}
          className="font-fredoka text-lg px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#c4b5fd' }}>
          ←
        </button>
        <h1 className="font-fredoka text-3xl" style={{ color: '#c4b5fd' }}>👗 WARDROBE</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">

        {/* Balls */}
        <section>
          <h2 className="font-fredoka text-xl mb-3" style={{ color: '#86efac' }}>⚪ BALLS</h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.values(BALL_ITEMS)).map(item => (
              <ItemCard
                key={item.id}
                item={item}
                selected={ballSkin === item.id}
                owned={ownsBall(item.id as BallSkinId)}
                onSelect={() => setBallSkin(item.id as BallSkinId)}
              />
            ))}
          </div>
        </section>

        {/* Clubs */}
        <section>
          <h2 className="font-fredoka text-xl mb-3" style={{ color: '#fbbf24' }}>🏌️ CLUBS</h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.values(CLUB_ITEMS)).map(item => (
              <ItemCard
                key={item.id}
                item={item}
                selected={clubSkin === item.id}
                owned={ownsClub(item.id as ClubSkinId)}
                onSelect={() => setClubSkin(item.id as ClubSkinId)}
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
