// Skin registry. Add new skins by importing them here and dropping them
// into WHEEL_SKINS — every consumer (store, picker UI, Wheel component)
// reads from this single source of truth so nothing has to special-case
// any particular skin.

import type { WheelSkin, WheelSkinId } from './types'
import { defaultSkin } from './default'
import { cyberneticSkin } from './cybernetic'
import { deepSeaSkin } from './deepSea'
import { bloodSkin } from './blood'

export type { WheelSkin, WheelSkinId, WheelRingPalette, WheelConnectorPalette } from './types'

export const WHEEL_SKINS: Record<WheelSkinId, WheelSkin> = {
  'default':    defaultSkin,
  'cybernetic': cyberneticSkin,
  'deep-sea':   deepSeaSkin,
  'blood':      bloodSkin,
}

/** Ordered list — useful for rendering pickers in a stable sequence. */
export const WHEEL_SKIN_LIST: WheelSkin[] = [defaultSkin, cyberneticSkin, deepSeaSkin, bloodSkin]

/** Safe lookup: falls back to the default skin if an unknown id sneaks in
 *  (e.g. a localStorage value left over from a deprecated skin). */
export function getWheelSkin(id: WheelSkinId | string | null | undefined): WheelSkin {
  if (id && (id as WheelSkinId) in WHEEL_SKINS) return WHEEL_SKINS[id as WheelSkinId]
  return defaultSkin
}

/** Resolve a palette slot for the current game mode. Mode overrides cascade
 *  on a per-key basis — a skin can override just the ring color in daily
 *  mode without having to redeclare the connector. */
export function resolveRing(skin: WheelSkin, isDaily: boolean) {
  if (isDaily && skin.daily?.ring) return { ...skin.ring, ...skin.daily.ring }
  return skin.ring
}

export function resolveConnector(skin: WheelSkin, isDaily: boolean) {
  if (isDaily && skin.daily?.connector) return { ...skin.connector, ...skin.daily.connector }
  return skin.connector
}
