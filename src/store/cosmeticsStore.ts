import { create } from 'zustand'
import { WHEEL_SKINS, type WheelSkinId } from '../skins'

// Cosmetics store — tracks which visual skins the player owns and which
// one is currently active. Right now there's only one slot (the letter
// wheel) but the store is structured to grow (gem styling, tile
// backgrounds, etc.) without rippling through gameStore.
//
// Ownership model:
//   • 'default' is always owned — it's the free baseline every player
//     starts with and the safe fallback for un-owned ids.
//   • Other skins are unlocked by winning rank #1 in their associated
//     weekly event (see worldData.ts → eventReward.firstPlaceSkin). The
//     WeeklyEvents claim flow calls grantSkin() when a player claims a
//     1st-place reward.
//   • setWheelSkin stays permissive — it doesn't enforce ownership at the
//     store layer so the DebugMenu can preview any skin without spoofing
//     a claim. The production picker (when built) will only render skins
//     the player owns; ownership is the source of truth for *availability*.
//
// Persistence:
//   • Mirrored to localStorage under `wc_cosmetics_v2` on every change.
//   • Hydrated lazily at module load; SSR-safe via the typeof checks.
//   • Unknown / removed skin ids fall back to 'default' on hydrate so a
//     player who had a since-deleted skin doesn't end up with a blank wheel.
//   • Ownership is stored as a string[] (Sets don't JSON-serialize). The
//     state-shape uses Set for O(1) membership; we convert on save/load.
//   • Key bumped from v1 → v2 because the payload gained `ownedSkins`. An
//     older v1 payload is read as "wheelSkin only" and ownership starts
//     fresh, which is fine: 'default' is always owned and the active skin
//     is preserved.

const STORAGE_KEY = 'wc_cosmetics_v2'
const LEGACY_KEY  = 'wc_cosmetics_v1'

interface CosmeticsPayload {
  wheelSkin:  WheelSkinId
  ownedSkins: WheelSkinId[]
}

function sanitizeId(id: unknown): WheelSkinId | null {
  return typeof id === 'string' && (id as WheelSkinId) in WHEEL_SKINS
    ? (id as WheelSkinId)
    : null
}

function loadPayload(): CosmeticsPayload {
  const fallback: CosmeticsPayload = { wheelSkin: 'default', ownedSkins: ['default'] }
  try {
    if (typeof localStorage === 'undefined') return fallback
    // Prefer the current key. If absent, try to lift forward from v1 so
    // existing players don't see their selected skin reset.
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<CosmeticsPayload>
    const selected = sanitizeId(parsed.wheelSkin) ?? 'default'
    const ownedRaw = Array.isArray(parsed.ownedSkins) ? parsed.ownedSkins : []
    const owned    = new Set<WheelSkinId>(['default'])
    for (const id of ownedRaw) {
      const s = sanitizeId(id)
      if (s) owned.add(s)
    }
    // If the player has a non-default selected skin from a v1 payload but
    // no ownership record, trust the selection — they had it before, they
    // keep it. This is the only path that grants ownership at hydrate time.
    if (selected !== 'default') owned.add(selected)
    return { wheelSkin: selected, ownedSkins: [...owned] }
  } catch {
    return fallback
  }
}

function savePayload(payload: CosmeticsPayload) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    }
  } catch {
    // localStorage can throw (quota, privacy-mode iframes) — non-fatal.
  }
}

interface CosmeticsState {
  wheelSkin:  WheelSkinId
  /** Set for O(1) membership checks; serialized as an array. Always
   *  contains 'default'. */
  ownedSkins: Set<WheelSkinId>
  setWheelSkin: (id: WheelSkinId) => void
  /** Add a skin to the owned set (idempotent). Returns true if this call
   *  was the one that flipped the player from un-owned to owned — the
   *  caller can use that to fire a "new skin unlocked" toast/celebration. */
  grantSkin: (id: WheelSkinId) => boolean
  /** Membership helper for picker UIs. */
  ownsSkin: (id: WheelSkinId) => boolean
  /** Cycle through registered skins — handy for a one-button toggle. */
  cycleWheelSkin: () => void
  /** Reset every cosmetic slot to its default and forget all unlocks. */
  reset: () => void
}

const initial = loadPayload()

function persist(s: CosmeticsState) {
  savePayload({ wheelSkin: s.wheelSkin, ownedSkins: [...s.ownedSkins] })
}

export const useCosmeticsStore = create<CosmeticsState>((set, get) => ({
  wheelSkin:  initial.wheelSkin,
  ownedSkins: new Set(initial.ownedSkins),

  setWheelSkin: (id) => {
    // Guard against bogus ids reaching the store. The picker UI shouldn't
    // ever send one of these, but defense-in-depth keeps the wheel from
    // rendering as the ambiguous default-styled-with-attribute-of-junk.
    const safe: WheelSkinId = (id in WHEEL_SKINS) ? id : 'default'
    set({ wheelSkin: safe })
    persist(get())
  },

  grantSkin: (id) => {
    if (!(id in WHEEL_SKINS)) return false
    const owned = get().ownedSkins
    if (owned.has(id)) return false
    // Build a new Set so React/zustand picks up the change — mutating in
    // place wouldn't trigger subscribers.
    const next = new Set(owned)
    next.add(id)
    set({ ownedSkins: next })
    persist(get())
    return true
  },

  ownsSkin: (id) => get().ownedSkins.has(id),

  cycleWheelSkin: () => {
    const ids = Object.keys(WHEEL_SKINS) as WheelSkinId[]
    const idx = ids.indexOf(get().wheelSkin)
    const next = ids[(idx + 1) % ids.length]
    get().setWheelSkin(next)
  },

  reset: () => {
    set({ wheelSkin: 'default', ownedSkins: new Set<WheelSkinId>(['default']) })
    persist(get())
  },
}))

/** Convenience selectors. */
export const selectWheelSkinId = (s: CosmeticsState) => s.wheelSkin
export const selectOwnedSkins  = (s: CosmeticsState) => s.ownedSkins
