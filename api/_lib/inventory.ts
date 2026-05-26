// Server-authoritative inventory.
//
// "Ownership" — owned skins, unlocked premium worlds, unlocked event weeks —
// used to live in the client's JSONB payload and was only as honest as the
// client wanted it to be. As of milestone 3 we derive ownership from the
// audit log: a successful spend with `reason in {cosmetic_skin, unlock_premium,
// unlock_event}` *is* the ownership record. The payload still mirrors these
// for the client's eager UI, but the truth comes from balance_transactions.
//
// Why the audit log instead of dedicated tables? Three reasons:
//   • The data is already there — every purchase already writes a row.
//   • Idempotency for free — purchase-time we just ask "does a matching row
//     already exist?" before debiting.
//   • One less table to migrate the next time ownership semantics change.
//
// Metadata schema (what the spend endpoint requires and we read here):
//   cosmetic_skin   → { skinId: string }
//   unlock_premium  → { worldId: string }
//   unlock_event    → { worldId: string, weekId: number }

import { sql } from './db.js'

export interface Inventory {
  /** Skin IDs the player owns (matches src/skins/types.ts WheelSkinId). */
  ownedSkins:      string[]
  /** World IDs the player has unlocked. */
  unlockedPremium: string[]
  /** Event entries — one record per (worldId, weekId) the player has
   *  unlocked. Lets the client say "did I enter Blood Donor on week 2832?"
   *  without trusting a client-asserted flag. */
  eventUnlocks:    Array<{ worldId: string; weekId: number }>
}

/** Read the full inventory for an address. One round trip; all three lists
 *  come from a single SELECT against balance_transactions. */
export async function getInventory(address: string): Promise<Inventory> {
  const db = sql()
  const rows = await db`
    SELECT reason, metadata
      FROM balance_transactions
     WHERE address = ${address}
       AND reason IN ('cosmetic_skin', 'unlock_premium', 'unlock_event')
  ` as Array<{ reason: string; metadata: Record<string, unknown> }>

  const ownedSkins      = new Set<string>()
  const unlockedPremium = new Set<string>()
  const eventUnlocks: Array<{ worldId: string; weekId: number }> = []
  const eventSeen       = new Set<string>()  // dedup composite key

  for (const r of rows) {
    const m = r.metadata ?? {}
    switch (r.reason) {
      case 'cosmetic_skin': {
        const skinId = typeof m.skinId === 'string' ? m.skinId : null
        if (skinId) ownedSkins.add(skinId)
        break
      }
      case 'unlock_premium': {
        const worldId = typeof m.worldId === 'string' ? m.worldId : null
        if (worldId) unlockedPremium.add(worldId)
        break
      }
      case 'unlock_event': {
        const worldId = typeof m.worldId === 'string' ? m.worldId : null
        const weekIdRaw = m.weekId
        const weekId = typeof weekIdRaw === 'number'
          ? weekIdRaw
          : typeof weekIdRaw === 'string'
            ? parseInt(weekIdRaw, 10)
            : NaN
        if (worldId && Number.isFinite(weekId)) {
          const key = `${worldId}::${weekId}`
          if (!eventSeen.has(key)) {
            eventSeen.add(key)
            eventUnlocks.push({ worldId, weekId })
          }
        }
        break
      }
    }
  }

  return {
    ownedSkins:      [...ownedSkins].sort(),
    unlockedPremium: [...unlockedPremium].sort(),
    eventUnlocks:    eventUnlocks.sort((a, b) =>
      a.worldId === b.worldId ? a.weekId - b.weekId : a.worldId.localeCompare(b.worldId)
    ),
  }
}

/** Has the player already received this specific ownership grant? Used by
 *  /api/economy/spend to refuse double-purchases before debiting gems. */
export async function alreadyOwns(args: {
  address: string
  reason:  'cosmetic_skin' | 'unlock_premium' | 'unlock_event'
  match:   Record<string, unknown>
}): Promise<boolean> {
  const db = sql()
  const rows = await db`
    SELECT 1 FROM balance_transactions
     WHERE address  = ${args.address}
       AND reason   = ${args.reason}
       AND metadata @> ${JSON.stringify(args.match)}::jsonb
     LIMIT 1
  ` as Array<{ '?column?': number }>
  return rows.length > 0
}
