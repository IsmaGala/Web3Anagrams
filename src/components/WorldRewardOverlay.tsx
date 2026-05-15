import { useGameStore } from '../store/gameStore'
import { WORLDS } from '../data/worldData'
import { playSfx } from '../utils/sfx'

// Confirmation modal for the one-time Gem bounty granted on completing
// every level in a free world. Mounted globally in App.tsx so it can
// surface on any screen — both fresh wins (queued by gameStore.submitWord)
// and retroactive cases where a returning player already cleared the world
// before this feature shipped (queued by scanForUnclaimedWorldRewards).
//
// Gating against the LevelCompleteOverlay: when a fresh world-clearing
// level just finished, LevelCompleteOverlay sets `_levelComplete: true`
// and the per-level celebration owns the screen. We delay rendering until
// that overlay has been dismissed so the two don't stack on top of each
// other and steal each other's tap target.

export default function WorldRewardOverlay() {
  const pendingId       = useGameStore(s => s.pendingWorldRewardId)
  const screen          = useGameStore(s => s.screen)
  const levelComplete   = useGameStore(s => (s as any)._levelComplete) as boolean | undefined
  const acceptReward    = useGameStore(s => s.acceptWorldReward)

  if (!pendingId) return null
  // Hide while the player is still inside a level — LevelCompleteOverlay
  // owns the "you just won!" moment there. We surface once they navigate
  // back to a menu (levelSelect on tap MAP / ALL DONE, splash on tap
  // back, etc.). For retroactive rewards the player starts on splash and
  // sees the overlay immediately.
  if (screen === 'game') return null
  // Defensive: in the unlikely case _levelComplete is still set on a menu
  // screen, hide so the per-level celebration doesn't get stomped.
  if (levelComplete) return null

  const world = WORLDS.find(w => w.id === pendingId)
  if (!world) return null
  const amount = world.completionReward ?? 0
  if (amount <= 0) {
    // Defensive: if a world somehow got queued with no reward, drop it
    // through the accept path which will no-op and clear the queue.
    acceptReward()
    return null
  }

  function handleClaim() {
    playSfx('uiTap')
    acceptReward()
  }

  return (
    <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.85)', backdropFilter:'blur(14px)' }}>

      <div className="w-full max-w-xs text-center slide-up">
        {/* World icon with the world's accent glow — matches the visual
            language of the world's card so the player recognises which
            world they're being rewarded for. */}
        <div className="text-7xl mb-2"
          style={{
            animation:'bounce 0.6s ease infinite alternate',
            filter:`drop-shadow(0 6px 24px ${world.color}cc)`,
          }}>
          {world.icon}
        </div>

        <p className="font-nunito font-bold text-xs mb-1 uppercase tracking-widest"
          style={{ color:'rgba(255,255,255,0.55)', letterSpacing:'3px' }}>
          {world.name}
        </p>
        <h2 className="font-fredoka text-3xl mb-1"
          style={{ color: world.color, textShadow:`0 4px 24px ${world.color}66` }}>
          WORLD COMPLETE!
        </h2>
        <p className="font-nunito font-bold text-sm mb-5 px-2"
          style={{ color:'rgba(255,255,255,0.6)', lineHeight:1.4 }}>
          You cleared every level. Claim your one-time Gem bounty as a reward.
        </p>

        {/* Reward badge — large amount + Gem symbol so the value is the
            first thing the eye lands on. */}
        <div className="flex items-center justify-center gap-3 mb-6 mx-auto py-3 px-5 rounded-2xl"
          style={{
            background:`linear-gradient(160deg, ${world.color}33, rgba(0,0,0,0.4))`,
            border:`3px solid ${world.color}88`,
            boxShadow:`0 6px 0 rgba(0,0,0,0.35), 0 0 28px ${world.color}33`,
            width:'fit-content',
          }}>
          <span className="text-4xl" style={{ color:'#22d3ee', filter:'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>◈</span>
          <span className="font-fredoka text-4xl text-white" style={{ textShadow:'0 3px 0 rgba(0,0,0,0.35)' }}>
            +{amount.toLocaleString()}
          </span>
        </div>

        <button onClick={handleClaim} className="btn-3d w-full py-4"
          style={{
            background:`linear-gradient(160deg, ${world.color}, ${world.color}cc)`,
            border:`4px solid ${world.color}`,
            borderBottom:`4px solid ${world.color}55`,
            boxShadow:`0 8px 0 ${world.color}44, 0 0 28px ${world.color}55`,
            borderRadius:'20px',
            color:'#fff',
            fontFamily:'Fredoka One,cursive', fontSize:'1.3rem', letterSpacing:'1.5px',
          }}>
          CLAIM REWARD
        </button>
      </div>
    </div>
  )
}
