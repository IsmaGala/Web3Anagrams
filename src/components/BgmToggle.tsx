import { useGameStore } from '../store/gameStore'

/** Music note icon with an optional diagonal slash overlay when muted.
 *  Mirrors SfxToggle's variant/size API so the two buttons look paired. */
type Variant = 'splash' | 'daily' | 'single'

const COLORS: Record<Variant, { bg: string; border: string; borderBottom: string; shadow: string; text: string }> = {
  splash: { bg:'linear-gradient(160deg,#4c1d95,#3b0764)', border:'#7c3aed', borderBottom:'#2e1065', shadow:'#1e0050', text:'#e9d5ff' },
  daily:  { bg:'linear-gradient(160deg,#92400e,#78350f)', border:'#f59e0b', borderBottom:'#451a03', shadow:'#451a03', text:'#fde68a' },
  single: { bg:'linear-gradient(160deg,#4c1d95,#3b0764)', border:'#7c3aed', borderBottom:'#2e1065', shadow:'#1e0050', text:'#e9d5ff' },
}

export default function BgmToggle({ variant = 'splash', size = 'md' }: { variant?: Variant; size?: 'sm' | 'md' }) {
  const muted  = useGameStore(s => s.bgmMuted)
  const toggle = useGameStore(s => s.toggleBgmMuted)
  const c      = COLORS[variant]
  const padding   = size === 'sm' ? '0.4rem 0.65rem' : '0.55rem 0.85rem'
  const fontSize  = size === 'sm' ? '0.9rem' : '1.05rem'

  return (
    <button
      onClick={toggle}
      aria-label={muted ? 'Unmute music' : 'Mute music'}
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
      {/* Music note with a diagonal slash drawn over it when muted —
          mirrors the visual language of the 🔊/🔇 SFX toggle. */}
      <span style={{ position: 'relative', display: 'inline-block' }}>
        🎵
        {muted && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: '50%', left: '-1px', right: '-1px',
              height: '2px',
              background: c.text,
              transform: 'rotate(-45deg)',
              borderRadius: '2px',
              opacity: 0.9,
            }}
          />
        )}
      </span>
    </button>
  )
}
