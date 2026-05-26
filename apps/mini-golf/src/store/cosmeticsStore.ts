// Golf cosmetics: ball skins + club skins.
// Structure mirrors wordchain's cosmeticsStore but is typed for golf items.

import { create } from 'zustand'
import type { BallSkinId, ClubSkinId, CosmeticItem } from '../types'

const STORAGE_KEY = 'mg_cosmetics_v1'

// ── Item registries ───────────────────────────────────────────────────────────

export const BALL_ITEMS: Record<BallSkinId, CosmeticItem> = {
  default: { id: 'default', type: 'ball', label: 'Classic',   description: 'The original white ball.',    color: '#ffffff', trailColor: 'rgba(255,255,255,0.4)' },
  gold:    { id: 'gold',    type: 'ball', label: 'Gold',      description: 'Shine bright on the course.', color: '#fbbf24', trailColor: 'rgba(251,191,36,0.5)', price: 200 },
  neon:    { id: 'neon',    type: 'ball', label: 'Neon',      description: 'Impossible to lose.',         color: '#34d399', trailColor: 'rgba(52,211,153,0.6)', price: 150 },
  gala:    { id: 'gala',    type: 'ball', label: 'GALA Ball', description: 'Earn-only. Exclusive drop.',  color: '#a78bfa', trailColor: 'rgba(167,139,250,0.6)' },
}

export const CLUB_ITEMS: Record<ClubSkinId, CosmeticItem> = {
  default: { id: 'default', type: 'club', label: 'Standard', description: 'Trusty old putter.',         color: '#9ca3af' },
  chrome:  { id: 'chrome',  type: 'club', label: 'Chrome',   description: 'Sleek metallic finish.',     color: '#e5e7eb', price: 180 },
  bamboo:  { id: 'bamboo',  type: 'club', label: 'Bamboo',   description: 'Eco-friendly and flexible.', color: '#86efac', price: 120 },
  laser:   { id: 'laser',   type: 'club', label: 'Laser',    description: 'Earn-only. Maximum style.',  color: '#f472b6' },
}

// ── Persistence ───────────────────────────────────────────────────────────────

interface StoredCosmetics {
  ballSkin:   BallSkinId
  clubSkin:   ClubSkinId
  ownedBalls: BallSkinId[]
  ownedClubs: ClubSkinId[]
}

const DEFAULTS: StoredCosmetics = {
  ballSkin:   'default',
  clubSkin:   'default',
  ownedBalls: ['default'],
  ownedClubs: ['default'],
}

function load(): StoredCosmetics {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<StoredCosmetics>
    return {
      ballSkin:   (p.ballSkin  && p.ballSkin  in BALL_ITEMS) ? p.ballSkin  : 'default',
      clubSkin:   (p.clubSkin  && p.clubSkin  in CLUB_ITEMS) ? p.clubSkin  : 'default',
      ownedBalls: ['default', ...(p.ownedBalls ?? []).filter(id => id in BALL_ITEMS && id !== 'default')],
      ownedClubs: ['default', ...(p.ownedClubs ?? []).filter(id => id in CLUB_ITEMS && id !== 'default')],
    }
  } catch { return DEFAULTS }
}

function persist(s: CosmeticsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ballSkin:   s.ballSkin,
      clubSkin:   s.clubSkin,
      ownedBalls: [...s.ownedBalls],
      ownedClubs: [...s.ownedClubs],
    }))
  } catch {}
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface CosmeticsState {
  ballSkin:   BallSkinId
  clubSkin:   ClubSkinId
  ownedBalls: Set<BallSkinId>
  ownedClubs: Set<ClubSkinId>

  setBallSkin:  (id: BallSkinId) => void
  setClubSkin:  (id: ClubSkinId) => void
  grantBall:    (id: BallSkinId) => boolean   // returns true on first grant
  grantClub:    (id: ClubSkinId) => boolean
  ownsBall:     (id: BallSkinId) => boolean
  ownsClub:     (id: ClubSkinId) => boolean
  setOwnedBalls:(ids: BallSkinId[]) => void
  setOwnedClubs:(ids: ClubSkinId[]) => void
  reset:        () => void
}

const init = load()

export const useCosmeticsStore = create<CosmeticsState>((set, get) => ({
  ballSkin:   init.ballSkin,
  clubSkin:   init.clubSkin,
  ownedBalls: new Set(init.ownedBalls),
  ownedClubs: new Set(init.ownedClubs),

  setBallSkin: (id) => {
    const safe = id in BALL_ITEMS ? id : 'default'
    set({ ballSkin: safe })
    persist(get())
  },

  setClubSkin: (id) => {
    const safe = id in CLUB_ITEMS ? id : 'default'
    set({ clubSkin: safe })
    persist(get())
  },

  grantBall: (id) => {
    if (!(id in BALL_ITEMS)) return false
    const owned = get().ownedBalls
    if (owned.has(id)) return false
    set({ ownedBalls: new Set([...owned, id]) })
    persist(get())
    return true
  },

  grantClub: (id) => {
    if (!(id in CLUB_ITEMS)) return false
    const owned = get().ownedClubs
    if (owned.has(id)) return false
    set({ ownedClubs: new Set([...owned, id]) })
    persist(get())
    return true
  },

  ownsBall: (id) => get().ownedBalls.has(id),
  ownsClub: (id) => get().ownedClubs.has(id),

  setOwnedBalls: (ids) => {
    set({ ownedBalls: new Set(['default', ...ids.filter(id => id in BALL_ITEMS)]) })
    persist(get())
  },

  setOwnedClubs: (ids) => {
    set({ ownedClubs: new Set(['default', ...ids.filter(id => id in CLUB_ITEMS)]) })
    persist(get())
  },

  reset: () => {
    set({ ballSkin: 'default', clubSkin: 'default', ownedBalls: new Set(['default']), ownedClubs: new Set(['default']) })
    persist(get())
  },
}))
