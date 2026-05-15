// ─── Wheel skin contract ─────────────────────────────────────────────────────
//
// A "skin" is the visual treatment applied to the letter wheel: tile look,
// outer ring, and the connector lines drawn on the canvas as the player
// drags. Tile + selected-tile styling lives in CSS (keyed off the
// `data-skin` attribute on the wheel container, see global.css), because
// CSS gives us cheap transitions, pseudo-elements, and daily-mode overrides
// for free. Anything the React/canvas code needs at runtime — ring color,
// connector gradient stops, glow shadow — lives here as plain strings so
// Wheel.tsx can pluck values without re-implementing CSS lookup.
//
// To add a new skin:
//   1. drop a `<id>.ts` in this folder exporting a `WheelSkin`
//   2. register it in `index.ts`
//   3. add `[data-skin="<id>"] .wheel-letter { ... }` rules in global.css
//      (and a `.selected` variant + `body.daily-mode` variant if desired)
//
// The Wheel never branches per skin id directly — it just reads values off
// whichever `WheelSkin` object is active, so every skin is on equal footing
// and the default remains a regular registry entry rather than a hardcoded
// fallback path.

export type WheelSkinId = 'default' | 'cybernetic' | 'deep-sea' | 'blood' | 'patriot'

export interface WheelConnectorPalette {
  /** Gradient stop at (0,0) of the canvas. */
  gradientStart: string
  /** Gradient stop at (CANVAS, CANVAS) of the canvas. */
  gradientEnd: string
  /** ctx.shadowColor — drives the soft glow behind the drawn line. */
  shadow: string
}

export interface WheelRingPalette {
  /** border color of the faint ring framing the wheel. */
  border: string
  /** box-shadow color used to give the ring an outer glow. */
  glow: string
}

export interface WheelSkin {
  id: WheelSkinId
  /** Human-friendly label for pickers / debug menu. */
  label: string
  /** Short description for shop-style UI later. */
  description: string
  /** Optional Gem price for direct purchase from the Wardrobe. Skins with
   *  no price are earn-only (rank-1 event reward or always-owned default).
   *  Set this on event-themed skins so players who missed the event can
   *  still buy them; leave undefined for ultra-rare or default skins. */
  price?: number
  /** Outer-ring palette for the standard (campaign) game mode. */
  ring: WheelRingPalette
  /** Connector-line palette for the standard game mode. */
  connector: WheelConnectorPalette
  /** Optional overrides applied when `body.daily-mode` is active. If a slot
   *  is omitted the standard palette is reused — which preserves the
   *  original behavior where daily mode swapped to amber tones. */
  daily?: {
    ring?: Partial<WheelRingPalette>
    connector?: Partial<WheelConnectorPalette>
  }
}
