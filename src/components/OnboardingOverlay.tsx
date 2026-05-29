import { useState } from 'react'
import { playSfx } from '../utils/sfx'

// First-run onboarding. Three swipeable cards introducing the game's main
// surfaces. The "I've seen this" decision is persisted to localStorage under
// `wc_onboarding_seen_v1` so a returning player doesn't get the splash dance
// every time. Reset on full progress wipe + on wallet disconnect (a new
// player on a shared device deserves the walkthrough too).

export const ONBOARDING_STORAGE_KEY = 'wc_onboarding_seen_v1'

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1' } catch { return false }
}

export function markOnboardingSeen(): void {
  try { localStorage.setItem(ONBOARDING_STORAGE_KEY, '1') } catch {}
}

export function clearOnboardingSeen(): void {
  try { localStorage.removeItem(ONBOARDING_STORAGE_KEY) } catch {}
}

interface Card {
  icon:     string
  title:    string
  subtitle: string
  body:     string
  accent:   string   // primary color for this card's accent
  glow:     string   // matching glow color
}

const CARDS: Card[] = [
  {
    icon:     '⬡',
    title:    'G WORDY',
    subtitle: 'Word puzzles, anagram-style',
    body:     'Each level gives you a handful of letters and a target list of words to find. Drag through the wheel to spell. Find them all to clear the level and earn score.',
    accent:   '#a78bfa',
    glow:     'rgba(167,139,250,0.55)',
  },
  {
    icon:     '🎮',
    title:    'PLAY EVERY DAY',
    subtitle: 'Story levels + daily challenge',
    body:     'SINGLE PLAYER works through worlds — Town Star, Mirandus, Galaswap and more — with words themed to each. The DAILY challenge is one tough 5-minute round per day. Win it to build a streak; lose it and pay 1 GEM to retry.',
    accent:   '#fbbf24',
    glow:     'rgba(251,191,36,0.55)',
  },
  {
    icon:     '🏆',
    title:    'COMPETE & UNLOCK',
    subtitle: 'Premium worlds + weekly events',
    body:     'Spend GEMS to unlock PREMIUM worlds — Area 51, Asimov Robotics, Peaks & Trails. Or pay into the WEEKLY EVENT for a leaderboard run: top 3 at the end of the week claim hint-pack rewards. Buy more Gems with GALA tokens from the STORE. Connect a wallet to sync progress across devices.',
    accent:   '#22d3ee',
    glow:     'rgba(34,211,238,0.55)',
  },
]

interface Props {
  /** Called when the player dismisses (Skip or finishes Get Started). The
   *  parent is responsible for unmounting AND for whether to persist the
   *  "seen" flag — we don't write to localStorage from inside the component
   *  so the parent can decide based on its own state machine. */
  onDone: () => void
}

export default function OnboardingOverlay({ onDone }: Props) {
  const [index, setIndex] = useState(0)
  const card    = CARDS[index]
  const isLast  = index === CARDS.length - 1
  const isFirst = index === 0

  function tap<T extends any[]>(fn: (...args: T) => void) {
    return (...args: T) => { playSfx('uiTap'); fn(...args) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center px-6"
      style={{ background:'rgba(0,0,0,0.92)', backdropFilter:'blur(18px)' }}>

      {/* Skip — top-right escape hatch for impatient players. */}
      <button onClick={tap(onDone)}
        className="absolute font-nunito font-bold text-xs uppercase"
        style={{ top: 18, right: 22, color:'rgba(255,255,255,0.4)', letterSpacing:'2px' }}>
        SKIP ›
      </button>

      <div className="w-full max-w-sm text-center slide-up">
        <div className="text-6xl mb-3"
          style={{ filter:`drop-shadow(0 6px 20px ${card.glow})`,
                   animation:'bounce 2s ease infinite alternate' }}>
          {card.icon}
        </div>
        <h2 className="font-fredoka text-3xl mb-1" style={{ color: card.accent, letterSpacing:'1px' }}>
          {card.title}
        </h2>
        <p className="font-nunito font-bold mb-5 uppercase"
          style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.78rem', letterSpacing:'2px' }}>
          {card.subtitle}
        </p>
        <p className="font-nunito font-bold mb-8 px-1"
          style={{ color:'rgba(255,255,255,0.78)', fontSize:'0.95rem', lineHeight:1.5 }}>
          {card.body}
        </p>

        {/* Progress dots — visual indicator of where we are in the deck. */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {CARDS.map((_, i) => (
            <span key={i} className="rounded-full transition-all"
              style={{
                width:  i === index ? 24 : 8,
                height: 8,
                background: i === index ? card.accent : 'rgba(255,255,255,0.2)',
              }} />
          ))}
        </div>

        {/* Primary action — advance, or "Get Started" on the last card. */}
        <button onClick={tap(() => isLast ? onDone() : setIndex(i => i + 1))}
          className="btn-3d w-full py-3 mb-3"
          style={{
            background:    `linear-gradient(160deg,${card.accent},${card.accent}cc)`,
            border:        `4px solid ${card.accent}`,
            borderBottom:  `4px solid ${card.accent}66`,
            boxShadow:     `0 6px 0 ${card.accent}44`,
            borderRadius:  '18px',
            color:         '#fff',
            fontFamily:    'Fredoka One,cursive', fontSize:'1.1rem', letterSpacing:'1px',
          }}>
          {isLast ? 'GET STARTED' : 'NEXT ›'}
        </button>

        {/* Back — only on cards 2+. Soft styling so it's clearly secondary. */}
        {!isFirst && (
          <button onClick={tap(() => setIndex(i => i - 1))}
            className="font-nunito font-bold text-xs uppercase"
            style={{ color:'rgba(255,255,255,0.45)', letterSpacing:'2px', padding:'8px' }}>
            ‹ BACK
          </button>
        )}
      </div>
    </div>
  )
}
