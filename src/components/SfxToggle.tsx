import { useGameStore } from '../store/gameStore'

/** Compact speaker icon button — toggles SFX mute. Reads/writes the store
 *  which mirrors the localStorage-backed pref in src/utils/sfx.ts.
 *
 *  `variant` controls color/border for the surface it lives on:
 *    - 'splash'   purple, for use over the dark splash background
 *    - 'daily'    amber,  for the daily-mode game board
 *    - 'single'   purple, for the standard game board
 */
type Variant = 'splash' | 'daily' | 'single'

const COLORS: Record<Variant, { bg: string; border: string; borderBottom: string; shadow: string; text: string }> = {
  splash: { bg:'linear-gradient(160deg,#4c1d95,#3b0764)', border:'#7c3aed', borderBottom:'#2e1065', shadow:'#1e0050', text:'#e9d5ff' },
  daily:  { bg:'linear-gradient(160deg,#92400e,#78350f)', border:'#f59e0b', borderBottom:'#451a03', shadow:'#451a03', text:'#fde68a' },
  single: { bg:'linear-gradient(160deg,#4c1d95,#3b0764)', border:'#7c3aed', borderBottom:'#2e1065', shadow:'#1e0050', text:'#e9d5ff' },
}

export default function SfxToggle({ variant = 'splash', size = 'md' }: { variant?: Variant; size?: 'sm' | 'md' }) {
  const muted     = useGameStore(s => s.sfxMuted)
  const toggle    = useGameStore(s => s.toggleSfxMuted)
  const c         = COLORS[variant]
  const padding   = size === 'sm' ? '0.4rem 0.65rem' : '0.55rem 0.85rem'
  const fontSize  = size === 'sm' ? '0.9rem' : '1.05rem'

  return (
    <button
      onClick={toggle}
      aria-label={muted ? 'Unmute SFX' : 'Mute SFX'}
      className="btn-3d"
      style={{
        background: c.bg,
        border: `2px solid ${c.border}`,
        borderBottom: `2px solid ${c.borderBottom}`,
        boxShadow: `0 3px 0 ${c.shadow}`,
        borderRadius: '10px',
        color: c.text,
        fontFamily: 'Fredoka One,cursive',
        fontSize,
        padding,
        lineHeight: 1,
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
