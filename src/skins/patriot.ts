import type { WheelSkin } from './types'

// Patriot skin — Old Glory palette skewed for the US flag. Tiles rest in
// deep navy with a red trim (the "blue field + red stripe edge" feel of a
// flag fold), then flare to bright arterial red ringed in white when a
// letter is locked in (the star-on-the-flag beat). Connector trace runs
// red → navy with a white-hot shadow, evoking the layered palette without
// trying to render a literal flag inside the wheel.
//
// Why these specific colors:
//   • Idle navy `#1e3a8a` is a calibrated "flag blue" — saturated enough
//     to read as patriotic, dark enough that the white letter glyph reads
//     instantly. Pure black would lose the "blue field" identity.
//   • Selected red `#dc2626` is Old Glory red rather than blood crimson —
//     keeps the Patriot skin visually distinct from the Blood skin even
//     though both lean red on lock-on.
//   • White halo around the selected tile is the "star pops out" cue and
//     also gives the highest-contrast affordance for tracking the active
//     letter against a dark navy backdrop.
//
// Daily mode shifts toward a parade/military brass palette — amber-gold
// trim against a dark warm ground. Other red-leaning skins (Blood) use a
// klaxon-pink daily; this one stakes out the ceremonial-gold lane so the
// two stay readable side-by-side.
export const patriotSkin: WheelSkin = {
  id: 'patriot',
  label: 'Patriot',
  description: 'Old-Glory navy tiles with a red-and-white star pop.',
  price: 3000,
  ring: {
    // Red ring with a navy haze bleeding outward.
    border: 'rgba(220,38,38,0.35)',
    glow:   'rgba(30,58,138,0.25)',
  },
  connector: {
    // Red → navy gradient; white-leaning shadow gives the trace a halo
    // that reads as the white stripe between bands of color.
    gradientStart: 'rgba(220,38,38,0.95)',
    gradientEnd:   'rgba(30,58,138,0.95)',
    shadow:        'rgba(255,255,255,0.55)',
  },
  daily: {
    ring: {
      // Parade gold trim — military brass / ceremony.
      border: 'rgba(251,191,36,0.40)',
      glow:   'rgba(220,38,38,0.25)',
    },
    connector: {
      // Gold filament fading into deeper red. Reads as "ceremonial" rather
      // than "alarm" so it doesn't collide with the Blood skin's daily.
      gradientStart: 'rgba(253,224,71,0.95)',
      gradientEnd:   'rgba(220,38,38,0.95)',
      shadow:        'rgba(251,191,36,0.7)',
    },
  },
}
