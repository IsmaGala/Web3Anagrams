import type { WheelSkin } from './types'

// Cybernetic skin — electric cyan tiles with a magenta accent when a letter
// is selected, and a cyan→magenta connector line that feels like a neon
// circuit trace. The palette stays high-contrast against the dark game
// background so letter glyphs read just as clearly as the default skin.
//
// Daily-mode keeps the cyber vibe but shifts toward red/amber to preserve
// the "this is the daily challenge, not the campaign" affordance players
// already learned from the default skin's amber daily override.
export const cyberneticSkin: WheelSkin = {
  id: 'cybernetic',
  label: 'Cybernetic',
  description: 'Neon circuit tiles. Cyan idle, magenta lock-on.',
  ring: {
    // Electric cyan ring with a colder outer halo.
    border: 'rgba(34,211,238,0.35)',
    glow:   'rgba(6,182,212,0.25)',
  },
  connector: {
    // Cyan at the start of the trace, magenta at the end — gives the line
    // a directional "current is flowing this way" feel as it builds.
    gradientStart: 'rgba(103,232,249,0.95)',
    gradientEnd:   'rgba(232,121,249,0.95)',
    shadow:        'rgba(34,211,238,0.75)',
  },
  daily: {
    ring: {
      border: 'rgba(244,114,182,0.40)',
      glow:   'rgba(244,63,94,0.25)',
    },
    connector: {
      // Hotter, daily-only palette: amber → magenta, brighter shadow.
      gradientStart: 'rgba(253,224,71,0.95)',
      gradientEnd:   'rgba(244,114,182,0.95)',
      shadow:        'rgba(244,114,182,0.7)',
    },
  },
}
