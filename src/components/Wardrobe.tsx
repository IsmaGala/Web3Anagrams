import { useGameStore } from '../store/gameStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { WHEEL_SKIN_LIST, getWheelSkin, type WheelSkinId } from '../skins'
import { WORLDS } from '../data/worldData'
import { playSfx } from '../utils/sfx'
import { useScreenBackdrop } from '../utils/screenBackdrop'

// Wardrobe — cosmetics hub. Shows only skins the player has earned or
// unlocked (via rank #1 in weekly events, or always-owned default).
// No purchase flow here — skins can only be won through events.
// The Gem Store handles the event-skin direct-purchase path.

// Helper: find the event world (if any) whose rank-1 reward is this skin.
// Used to render the "Win [Event Name] to unlock" hint on locked skins
// that have no price (earn-only).
function eventForSkin(skinId: WheelSkinId) {
  return WORLDS.find(w => w.event && w.eventReward?.firstPlaceSkin === skinId)
}

// A 5-tile thumbnail row rendered with the skin's actual CSS palette
// (no canvas / no event handlers — purely decorative). The data-skin
// wrapper triggers the same `[data-skin="..."] .wheel-letter` rules the
// real wheel uses, so previews stay byte-identical with the live look.
function SkinPreview({ skinId, equipped }: { skinId: WheelSkinId; equipped: boolean }) {
  // Five letters spelling out a snippet that reads naturally. The middle
  // tile flips to `.selected` so the preview also showcases the
  // lock-on state, which is the other half of the skin's identity.
  const letters = ['W', 'O', 'R', 'D', 'S']
  return (
    <div data-skin={skinId} className="flex items-center justify-center py-2">
      {letters.map((ch, i) => (
        <div key={i}
          className={`wheel-letter preview ${i === 2 ? 'selected' : ''}`}
          aria-hidden>
          {ch}
        </div>
      ))}
      {/* Off-screen label for screen readers — the visual tiles are aria-hidden. */}
      <span className="sr-only">
        {getWheelSkin(skinId).label} skin preview{equipped ? ' (currently equipped)' : ''}
      </span>
    </div>
  )
}

export default function Wardrobe() {
  const goToSplash    = useGameStore(s => s.goToSplash)
  const showToast     = useGameStore(s => s.showToast)

  // Cosmetics — pull primitives + the owned Set; reads of `ownedSkins`
  // re-render when the Set identity changes (we replace on grant).
  const wheelSkin     = useCosmeticsStore(s => s.wheelSkin)
  const ownedSkins    = useCosmeticsStore(s => s.ownedSkins)
  const setWheelSkin  = useCosmeticsStore(s => s.setWheelSkin)

  const backdrop = useScreenBackdrop(
    'linear-gradient(180deg,#2e1065 0%,#1a0533 60%,#0d0220 100%)'
  )

  function handleEquip(id: WheelSkinId) {
    if (id === wheelSkin) return
    playSfx('uiTap')
    setWheelSkin(id)
    showToast(`✓ Equipped ${getWheelSkin(id).label}`)
  }

  // Only show skins the player actually owns.
  const availableSkins = WHEEL_SKIN_LIST.filter(skin => ownedSkins.has(skin.id))

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 pb-10 px-4"
      style={{ background: backdrop }}>

      {/* ── HEADER ── */}
      <div className="w-full max-w-sm flex items-center gap-2 mb-4">
        <button onClick={goToSplash} className="btn-3d flex items-center px-3 py-2"
          style={{
            background:'linear-gradient(160deg,#4c1d95,#3b0764)',
            border:'3px solid #7c3aed', borderBottom:'3px solid #2e1065',
            boxShadow:'0 4px 0 #1e0050', borderRadius:'12px',
            color:'#e9d5ff', fontFamily:'Fredoka One,cursive', fontSize:'0.9rem',
          }}>
          ‹
        </button>
        <h1 className="flex-1 text-center font-fredoka"
          style={{ color:'#e9d5ff', fontSize:'1.4rem', letterSpacing:'2px' }}>
          WARDROBE
        </h1>
        {/* Spacer to keep title centered */}
        <div style={{ width: 48 }} />
      </div>

      {/* ── SUBHEAD ── */}
      <p className="w-full max-w-sm text-center font-nunito font-bold mb-4 px-2"
        style={{ color:'rgba(196,181,253,0.7)', fontSize:'0.85rem', lineHeight:1.45 }}>
        Wheel skins customize how the letter ring looks. Win rank #1 in a weekly
        event to earn that event's skin.
      </p>

      {/* ── SKIN CARDS ── */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        {availableSkins.length === 0 && (
          <div className="text-center py-10 px-4">
            <div className="text-5xl mb-3">🏆</div>
            <p className="font-fredoka text-lg mb-1" style={{ color:'#c4b5fd' }}>
              No skins yet
            </p>
            <p className="font-nunito font-bold text-sm" style={{ color:'rgba(196,181,253,0.5)', lineHeight:1.5 }}>
              Win rank #1 in a weekly event to earn that event's skin.
              Check the Gem Store to grab the current event skin directly.
            </p>
          </div>
        )}

        {availableSkins.map(skin => {
          const equipped  = wheelSkin === skin.id
          const event     = eventForSkin(skin.id)

          const badge = equipped
            ? { text: 'EQUIPPED', color:'#86efac', bg:'rgba(34,197,94,0.12)' }
            : { text: 'OWNED',    color:'#a5f3fc', bg:'rgba(34,211,238,0.12)' }

          return (
            <div key={skin.id}
              className="rounded-2xl p-3"
              style={{
                background:'rgba(255,255,255,0.06)',
                border: equipped
                  ? '2px solid rgba(134,239,172,0.55)'
                  : '2px solid rgba(167,139,250,0.18)',
                boxShadow: equipped
                  ? '0 0 18px rgba(134,239,172,0.15)'
                  : '0 4px 0 rgba(0,0,0,0.3)',
              }}>

              <div className="flex items-center justify-between mb-1">
                <h2 className="font-fredoka" style={{ color:'#fff', fontSize:'1.05rem', letterSpacing:'1.5px' }}>
                  {skin.label.toUpperCase()}
                </h2>
                <span className="font-fredoka rounded-full px-2 py-0.5"
                  style={{
                    background: badge.bg, color: badge.color,
                    fontSize:'0.6rem', letterSpacing:'1.5px',
                    border: `1px solid ${badge.color}55`,
                  }}>
                  {badge.text}
                </span>
              </div>

              <SkinPreview skinId={skin.id} equipped={equipped} />

              <p className="font-nunito font-bold mt-1 mb-3 px-1"
                style={{ color:'rgba(226,232,240,0.65)', fontSize:'0.78rem', lineHeight:1.4 }}>
                {skin.description}
              </p>

              {/* Source hint — which event this came from */}
              {event && skin.id !== 'default' && (
                <p className="font-nunito font-bold mb-2 px-1"
                  style={{ color:'rgba(196,181,253,0.55)', fontSize:'0.7rem', lineHeight:1.4 }}>
                  {event.icon} Earned from {event.name}
                </p>
              )}

              <button
                onClick={() => handleEquip(skin.id)}
                disabled={equipped}
                className="btn-3d w-full py-2.5"
                style={{
                  borderRadius:'12px',
                  fontFamily:'Fredoka One,cursive',
                  fontSize:'0.95rem', letterSpacing:'1px',
                  cursor: equipped ? 'default' : 'pointer',
                  ...(equipped ? {
                    background:'linear-gradient(160deg,#374151,#1f2937)',
                    border:'2px solid rgba(255,255,255,0.15)',
                    borderBottom:'2px solid rgba(0,0,0,0.4)',
                    boxShadow:'0 3px 0 rgba(0,0,0,0.4)',
                    color:'rgba(255,255,255,0.65)',
                  } : {
                    background:'linear-gradient(160deg,#7c3aed,#6d28d9)',
                    border:'2px solid #a78bfa', borderBottom:'2px solid #4c1d95',
                    boxShadow:'0 3px 0 #4c1d95', color:'#fff',
                  }),
                }}>
                {equipped ? '✓ EQUIPPED' : 'EQUIP'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
